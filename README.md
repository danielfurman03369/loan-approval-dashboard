# Loan Approval Prediction Model

A loan approval prediction system: a trained SVC (Support Vector Classifier) model
wrapped in a Flask API, with two frontend pages — a Stage 2 dashboard for exploring
the model and a Stage 3 page for trying a live prediction.

## Pages

| Page | Route | Purpose |
|---|---|---|
| Model dashboard | `/` | Stage 2 — model config, metrics, dataset samples, decision boundary, API reference, model file/download |
| Try a Prediction | `/predict-page` | Stage 3 — the end-user-facing tool a loan applicant would use to check their eligibility |

The two pages link to each other via a small nav link in their header, and both call
the same `/model/*` API routes.

## Project structure

Files are grouped by which stage of the project they belong to.

**Stage 1 — training** (`s1_model/`)

| File | Purpose |
|---|---|
| `s1_model/loan_trainv4.ipynb` | Training notebook showing how the model was built (reference only) |
| `s1_model/loan_datav4.csv` | Training dataset (Analytics Vidhya loan prediction data) |
| `s1_model/loan_svc_model_v4.pkl` | The saved, trained model pipeline (imputer + scaler + SVC) |

**Stage 2 — model dashboard/API** (`templates/s2/`, `static/s2/`)

| File | Purpose |
|---|---|
| `templates/s2/index.html` | The Stage 2 model dashboard page |
| `static/s2/script.js` | Stage 2 dashboard logic — fetches from the API and renders everything |

**Stage 3 — end-user prediction page** (`templates/s3/`, `static/s3/`)

| File | Purpose |
|---|---|
| `templates/s3/predict.html` | The Stage 3 prediction page |
| `static/s3/predict.js` | Stage 3 prediction form logic — validation, submission, and result rendering |

**Shared / top-level**

| File / folder | Purpose |
|---|---|
| `app.py` | Flask backend — loads the trained model (from `s1_model/`) and exposes all API endpoints and both pages |
| `static/shared/style.css` | Styling shared by both the Stage 2 and Stage 3 pages |
| `requirements.txt` | Python dependencies |

## How to run it

There are two supported ways to run this project.

### Option A — Flask only (simplest)

```bash
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000/** in a browser.

### Option B — Live Server for the frontend, Flask for the API

Useful for faster CSS/JS iteration, since Live Server auto-reloads the page on file
changes.

1. In one terminal, start Flask and leave it running — this is what serves all the
   `/model/*` API routes:
   ```bash
   pip install -r requirements.txt
   python app.py
   ```
2. In VS Code, right-click `templates/s2/index.html` or `templates/s3/predict.html` and
   choose **"Open with Live Server"** (or click **"Go Live"** in the status bar).

Either way, Flask must be running in a terminal for the API to work — Live Server only
ever serves the static HTML/CSS/JS, never the backend. The frontend detects which way
it was loaded and points its API calls at Flask automatically (see `API_BASE` at the top
of `static/s2/script.js` and `static/s3/predict.js`), with CORS enabled on the Flask side
to allow the cross-origin requests from Live Server's origin.

## The model

An SVC (RBF kernel) predicts loan approval (Y/N) from 7 features: `ApplicantIncome`,
`CoapplicantIncome`, `LoanAmount`, `Loan_Amount_Term`, `Credit_History`, `Education`,
and `Married`. On the held-out test split, it achieves **86.2% accuracy** (86.2%
precision, 95.3% recall, 90.5% F1 on the "approved" class).

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
of empirical models generally, not a bug. The prediction form (`/predict-page`) reflects
this: it warns when a submitted value — or a combination, like an implied loan-to-income
ratio far beyond what's typical — falls far outside the training data's observed range,
so the result is presented with the appropriate caveat rather than false confidence.

## Known limitations

### Issues found and fixed during development

- An unrelated Node.js scaffold had gotten mixed into the project. It caused the API to
  silently fail and return HTML error pages instead of JSON. It was removed; `app.py` is
  now the sole backend entry point.

### Limitations of the training data (not fixable by code)

- `s1_model/loan_datav4.csv` has only 614 rows, which is small for a model with 7 input features.
- Predictions are noticeably less reliable in sparse regions of the training distribution.
  Applicants with unusually high combined income (over $20,000/month) make up only about
  3% of the training data (18 of 614 rows), and the single highest-income row in the whole
  dataset happened to be a rejected application. As a result, approval probability can
  behave non-monotonically as income increases — e.g. rising, then falling, then rising
  again — which reflects a lack of real training examples in that range rather than a
  genuine learned pattern.
- No individual feature captures the *relationship* between loan amount and income — two
  values can each look individually plausible (a modest income, a modest-looking loan
  amount) while their combination is unrealistic. The loan-to-income ratio check on the
  prediction form partially mitigates this, but a model trained with that ratio as an
  explicit feature would handle it more robustly.

These are inherent properties of training on a small, real-world dataset, not
implementation bugs. A larger or more balanced dataset would be the actual fix, not
further code changes.
