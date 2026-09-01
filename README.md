# Loan Approval Prediction Model

A loan approval prediction system: a trained SVC (Support Vector Classifier) model
wrapped in a Flask API, with a dashboard frontend for exploring the model and trying
live predictions.

## Project structure

| File / folder | Purpose |
|---|---|
| `app.py` | Flask backend — loads the trained model and exposes all API endpoints |
| `loan_trainv4.ipynb` | Training notebook showing how the model was built (reference only) |
| `loan_datav4.csv` | Training dataset (Analytics Vidhya loan prediction data) |
| `loan_svc_model_v4.pkl` | The saved, trained model pipeline (imputer + scaler + SVC) |
| `templates/index.html` | The dashboard page |
| `static/script.js` | Frontend logic — fetches from the API and renders everything |
| `static/style.css` | Dashboard styling |
| `requirements.txt` | Python dependencies |

## How to run it

```bash
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000/** in a browser.

Do **not** open `index.html` directly, and don't serve it with a static file server
(e.g. VS Code's Live Server) on its own. The dashboard's API calls only work when Flask
itself is running — Flask serves both the HTML page and the `/model/*` routes together
on the same port, and a static server has no way to answer those routes.

## The model

An SVC (linear kernel) predicts loan approval (Y/N) from 7 features: `ApplicantIncome`,
`CoapplicantIncome`, `LoanAmount`, `Loan_Amount_Term`, `Credit_History`, `Education`,
and `Married`. On the held-out test split, it achieves **85.4% accuracy** (83.2%
precision, 98.8% recall, 90.3% F1 on the "approved" class).

`ApplicantIncome` and `CoapplicantIncome` are **monthly** income figures, as defined in
the original dataset (Dream Housing Finance, a home loan company) — enter realistic
monthly values when trying a prediction, not an annual salary.

## API endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/model/info` | Algorithm, hyperparameters, and model file details |
| GET | `/model/features` | The 7 input features and what each one means |
| GET | `/model/samples` | Real rows from the training dataset |
| GET | `/model/metrics` | Accuracy, precision, recall, F1, and confusion matrix |
| GET | `/model/support_vectors` | Support vector count |
| GET | `/model/decision_boundary` | A 2D PCA projection of the model's decision boundary |
| GET | `/model/feature_ranges` | Min/max/mean of the numeric features, from the training data |
| POST | `/model/predict` | Scores a single application, returns a prediction + probability |
| GET | `/model/download` | Downloads the trained model file (`.pkl`) |

## A note on prediction reliability

This model was fit to a specific, finite range of applicants (see `/model/feature_ranges`),
so it has no real basis for predicting on inputs far outside that range — e.g. an
unusually high or low income. A prediction on such an input isn't a meaningful risk
assessment, just extrapolation beyond anything the model has seen. This is a property
of empirical models generally, not a bug. The dashboard's prediction form reflects this:
it warns when a submitted value — or a combination, like an implied loan-to-income ratio
far beyond what's typical — falls far outside the training data's observed range, so the
result is presented with the appropriate caveat rather than false confidence.
