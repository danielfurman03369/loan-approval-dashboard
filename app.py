"""
Loan Approval Model — Stage 2 API

Loads the pre-trained SVC pipeline (stage1_model/loan_svc_model_v4.pkl) and exposes it
through a small Flask API, plus serves the dashboard page that visualizes it. The model
itself is never retrained or modified here — see stage1_model/loan_trainv4.ipynb for that.
"""

import hashlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, render_template, send_from_directory, abort
from flask_cors import CORS
from joblib import load as load_model
from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)

MODEL_PATH = Path("stage1_model/loan_svc_model_v4.pkl")
DATA_PATH = Path("stage1_model/loan_datav4.csv")

# Exact column order the pipeline was fit on (see loan_trainv4.ipynb, cell 2-3).
FEATURE_COLUMNS = [
    "ApplicantIncome",
    "CoapplicantIncome",
    "LoanAmount",
    "Loan_Amount_Term",
    "Credit_History",
    "Education",
    "Married",
]

# Education/Married are encoded outside the pipeline, so the same maps are used
# for both live predictions and metric recomputation.
EDUCATION_MAP = {"Graduate": 1, "Not Graduate": 0}
MARRIED_MAP = {"Yes": 1, "No": 0}
LOAN_STATUS_MAP = {"Y": 1, "N": 0}

# The 4 numeric fields the "out of training range" warning applies to.
NUMERIC_RANGE_COLUMNS = ["ApplicantIncome", "CoapplicantIncome", "LoanAmount", "Loan_Amount_Term"]

FEATURE_DESCRIPTIONS = [
    {
        "name": "ApplicantIncome",
        "description": "The primary applicant's monthly income.",
    },
    {
        "name": "CoapplicantIncome",
        "description": "The co-applicant's monthly income, if any. 0 if there is no co-applicant.",
    },
    {
        "name": "LoanAmount",
        "description": "The amount requested, in thousands.",
    },
    {
        "name": "Loan_Amount_Term",
        "description": "The repayment term of the loan, in days.",
    },
    {
        "name": "Credit_History",
        "description": "Whether the applicant has a history of repaying past credit. 1 = good, 0 = bad.",
    },
    {
        "name": "Education",
        "description": "The applicant's education level: Graduate or Not Graduate.",
    },
    {
        "name": "Married",
        "description": "The applicant's marital status: Yes or No.",
    },
]

app = Flask(__name__)
CORS(app)  # local dev only, fine to allow all origins since this never leaves localhost

MODEL = load_model(MODEL_PATH)
SVC = MODEL.named_steps["svc"]
DATASET = pd.read_csv(DATA_PATH)

# Computed once at startup — real values, not placeholders.
MODEL_SHA256 = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
MODEL_TRAINED_ON = datetime.fromtimestamp(MODEL_PATH.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d")


def build_features_and_labels(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Reproduce the exact X, y used at training time from the raw CSV."""
    X = df[FEATURE_COLUMNS].copy()
    X["Education"] = X["Education"].map(EDUCATION_MAP)
    X["Married"] = X["Married"].map(MARRIED_MAP)
    y = df["Loan_Status"].map(LOAN_STATUS_MAP)
    return X, y


def transform_to_scaled_space(X: pd.DataFrame) -> np.ndarray:
    """Run X through the pipeline's already-fitted imputer + scaler (no SVC step)."""
    imputed = MODEL.named_steps["imputer"].transform(X)
    return MODEL.named_steps["scaler"].transform(imputed)


@app.route("/")
def dashboard():
    return render_template("stage2/stage2_index.html")


@app.route("/predict-page")
def predict_page():
    return render_template("stage3/stage3_predict.html")


@app.route("/model/info")
def model_info():
    return jsonify(
        {
            "algorithm": type(SVC).__name__,
            "kernel": SVC.kernel,
            "C": SVC.C,
            "gamma": SVC.gamma,
            "probability": SVC.probability,
            "class_weight": SVC.class_weight,
            "decision_function_shape": SVC.decision_function_shape,
            "classes": SVC.classes_.tolist(),
            "model_filename": MODEL_PATH.name,
            "model_filesize_mb": round(MODEL_PATH.stat().st_size / (1024 * 1024), 3),
            "model_file_type": "Pickle file",
            "model_sha256": MODEL_SHA256,
            "trained_on": MODEL_TRAINED_ON,
        }
    )


@app.route("/model/features")
def model_features():
    return jsonify(FEATURE_DESCRIPTIONS)


@app.route("/model/samples")
def model_samples():
    # A deterministic, stratified sample (still real rows) so the dashboard shows
    # both outcomes rather than whatever a plain random draw happens to land on.
    approved = DATASET[DATASET["Loan_Status"] == "Y"].sample(n=4, random_state=42)
    rejected = DATASET[DATASET["Loan_Status"] == "N"].sample(n=4, random_state=42)
    sample = pd.concat([approved, rejected]).sample(frac=1, random_state=42)
    sample = sample.replace({np.nan: None})
    return jsonify(sample.to_dict(orient="records"))


@app.route("/model/metrics")
def model_metrics():
    X, y = build_features_and_labels(DATASET)
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    y_pred = MODEL.predict(X_test)

    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)

    return jsonify(
        {
            "accuracy": accuracy_score(y_test, y_pred),
            "precision": precision_score(y_test, y_pred, zero_division=0),
            "recall": recall_score(y_test, y_pred, zero_division=0),
            "f1_score": f1_score(y_test, y_pred, zero_division=0),
            "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
            "classification_report": report,
            "test_size": len(y_test),
        }
    )


@app.route("/model/feature_ranges")
def model_feature_ranges():
    # Live from the training CSV — the actual range of applicants this model has
    # ever seen, which is what makes an in-distribution prediction meaningful.
    ranges = {}
    for col in NUMERIC_RANGE_COLUMNS:
        series = DATASET[col].dropna()
        ranges[col] = {
            "min": float(series.min()),
            "max": float(series.max()),
            "mean": round(float(series.mean()), 1),
        }

    # A relational check on top of the per-field ones: two individually-plausible
    # values (e.g. a modest income and a modest loan amount) can still combine
    # into a nonsensical loan-to-income ratio. LoanAmount is in thousands, so
    # *1000 puts it in the same units as the income fields before dividing.
    monthly_income = DATASET["ApplicantIncome"] + DATASET["CoapplicantIncome"].fillna(0)
    ratio = (DATASET["LoanAmount"] * 1000) / monthly_income
    ratio = ratio[(monthly_income > 0) & ratio.notna()]
    ranges["LoanToIncomeRatio"] = {
        "min": float(ratio.min()),
        "max": float(ratio.max()),
        "mean": round(float(ratio.mean()), 1),
    }

    return jsonify(ranges)


@app.route("/model/support_vectors")
def model_support_vectors():
    per_class = {int(cls): int(count) for cls, count in zip(SVC.classes_, SVC.n_support_)}
    return jsonify({"total": int(SVC.n_support_.sum()), "per_class": per_class})


@app.route("/model/decision_boundary")
def model_decision_boundary():
    """
    Project the test set into 2D via PCA (fit on the same scaled space the SVC
    actually sees) and evaluate the REAL model's decision_function over a grid
    in that 2D space, so the contour reflects the actual trained classifier
    rather than a separately-fit 2D approximation.
    """
    X, y = build_features_and_labels(DATASET)
    X_train, X_test, _, _ = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    train_scaled = transform_to_scaled_space(X_train)
    test_scaled = transform_to_scaled_space(X_test)

    pca = PCA(n_components=2, random_state=42)
    train_2d = pca.fit_transform(train_scaled)
    test_2d = pca.transform(test_scaled)

    y_pred_test = MODEL.predict(X_test)

    pad = 1.0
    x_min, x_max = train_2d[:, 0].min() - pad, train_2d[:, 0].max() + pad
    y_min, y_max = train_2d[:, 1].min() - pad, train_2d[:, 1].max() + pad
    xx = np.linspace(x_min, x_max, 60)
    yy = np.linspace(y_min, y_max, 60)
    grid_2d = np.column_stack([v.ravel() for v in np.meshgrid(xx, yy)])
    grid_scaled = pca.inverse_transform(grid_2d)
    z = SVC.decision_function(grid_scaled).reshape(60, 60)

    sv_2d = train_2d[SVC.support_]

    return jsonify(
        {
            "test_points": [
                {"x": float(px), "y": float(py), "predicted": int(pred)}
                for (px, py), pred in zip(test_2d, y_pred_test)
            ],
            "support_vectors": [{"x": float(px), "y": float(py)} for px, py in sv_2d],
            "grid": {"x": xx.tolist(), "y": yy.tolist(), "z": z.tolist()},
            "explained_variance": pca.explained_variance_ratio_.tolist(),
        }
    )


@app.route("/model/predict", methods=["POST"])
def model_predict():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"error": "Expected a JSON body with the 7 loan fields."}), 400

    missing = [f for f in FEATURE_COLUMNS if f not in payload]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    education = payload["Education"]
    married = payload["Married"]
    if education not in EDUCATION_MAP:
        return jsonify({"error": "Education must be 'Graduate' or 'Not Graduate'."}), 400
    if married not in MARRIED_MAP:
        return jsonify({"error": "Married must be 'Yes' or 'No'."}), 400

    def to_number(value):
        # Blank/missing numeric fields become NaN; the pipeline's imputer fills them in.
        if value is None or value == "":
            return np.nan
        return float(value)

    row = {
        "ApplicantIncome": to_number(payload["ApplicantIncome"]),
        "CoapplicantIncome": to_number(payload["CoapplicantIncome"]),
        "LoanAmount": to_number(payload["LoanAmount"]),
        "Loan_Amount_Term": to_number(payload["Loan_Amount_Term"]),
        "Credit_History": to_number(payload["Credit_History"]),
        "Education": EDUCATION_MAP[education],
        "Married": MARRIED_MAP[married],
    }
    X = pd.DataFrame([row], columns=FEATURE_COLUMNS)

    prediction = int(MODEL.predict(X)[0])
    probability_approved = float(MODEL.predict_proba(X)[0][1])

    return jsonify(
        {
            "prediction": prediction,
            "label": "Approved" if prediction == 1 else "Rejected",
            "probability": probability_approved,
        }
    )


@app.route("/model/download")
def model_download():
    if not MODEL_PATH.exists():
        abort(404)
    return send_from_directory(MODEL_PATH.parent, MODEL_PATH.name, as_attachment=True)


if __name__ == "__main__":
    # use_reloader=False: the auto-reloader restarts this process on every file
    # save, and on Windows the old socket doesn't always release before the new
    # one binds — that's what was producing duplicate/zombie listeners on :5000.
    # debug=True is kept so errors still render as real tracebacks, not raw HTML.
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
