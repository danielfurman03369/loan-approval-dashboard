/**
 * Loan Eligibility Check — Stage 3 end-user prediction tool.
 * Scores a single application against the live model.
 */

// Relative paths work when Flask itself serves this page (port 5000). When the
// page is instead opened via a static server — e.g. VS Code's Live Server, on
// port 5500 — fetches need to point at Flask explicitly, since the static
// server can't answer /model/* routes itself.
const API_BASE = window.location.port === "5000" ? "" : "http://127.0.0.1:5000";

async function getJSON(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- Predict form ---------- */

// Populated from /model/feature_ranges before the form can meaningfully validate.
let FEATURE_RANGES = null;

const RANGE_FIELD_LABELS = {
  ApplicantIncome: "applicant income",
  CoapplicantIncome: "co-applicant income",
  LoanAmount: "loan amount",
  Loan_Amount_Term: "loan term",
};

async function loadFeatureRanges() {
  try {
    FEATURE_RANGES = await getJSON(`${API_BASE}/model/feature_ranges`);
    for (const field of Object.keys(FEATURE_RANGES)) {
      const input = document.getElementById(field);
      if (!input) continue;
      // Soft guidance only — HTML min/max on a number input don't block typing
      // or submission here, they just inform the field's expected range.
      input.min = FEATURE_RANGES[field].min;
      input.max = FEATURE_RANGES[field].max;
    }
  } catch (e) {
    FEATURE_RANGES = null; // Validation step below just skips silently if unavailable.
  }
}

// Flags values far outside the training data — more than 2x the observed max,
// or less than half the observed min. Not a strict statistical cutoff, just a
// sanity check for a model with no real basis to
// extrapolate that far.
function findOutOfRangeFields(payload) {
  if (!FEATURE_RANGES) return [];
  const flagged = [];
  for (const field of Object.keys(RANGE_FIELD_LABELS)) {
    const range = FEATURE_RANGES[field];
    const value = payload[field];
    if (!range || Number.isNaN(value)) continue;
    if (value > range.max * 2 || value < range.min * 0.5) {
      flagged.push({ field, value, ...range });
    }
  }

  flagged.push(...findLoanToIncomeIssue(payload));
  return flagged;
}

// Relational check on top of the per-field ones above: ApplicantIncome=100 and
// LoanAmount=100 (thousands) can each look individually plausible while
// jointly implying a loan worth ~1,000 months of income — nonsensical, but
// invisible to a check that only ever looks at one field at a time.
function findLoanToIncomeIssue(payload) {
  const range = FEATURE_RANGES && FEATURE_RANGES.LoanToIncomeRatio;
  const monthlyIncome = payload.ApplicantIncome + payload.CoapplicantIncome;
  if (!range || !(monthlyIncome > 0) || Number.isNaN(payload.LoanAmount)) return [];

  const ratio = (payload.LoanAmount * 1000) / monthlyIncome;
  if (ratio > range.max * 2 || ratio < range.min * 0.5) {
    return [{ field: "LoanToIncomeRatio", value: ratio, ...range, isRatio: true }];
  }
  return [];
}

function renderRangeWarning(flagged) {
  if (!flagged.length) return "";
  const items = flagged.map((f) => f.isRatio ? `
    <li>This application's <strong>loan amount relative to income</strong> is far outside
    what's typical for applicants in the training data (a loan-to-income ratio of
    ${f.value.toFixed(1)} vs. typically up to ${f.max.toFixed(1)}).</li>
  ` : `
    <li>This applicant's <strong>${RANGE_FIELD_LABELS[f.field]}</strong> (${f.value.toLocaleString()})
    is far outside the range of applicants (${f.min.toLocaleString()}–${f.max.toLocaleString()})
    used to train this model.</li>
  `).join("");
  return `
    <div class="range-warning">
      <div class="range-warning-title">⚠ Out-of-range input</div>
      <ul>${items}</ul>
      <p>Treat this prediction with caution — it may not be reliable.</p>
    </div>
  `;
}

function initPredictForm() {
  const form = document.getElementById("predict-form");
  const resultEl = document.getElementById("result");

  // Native form reset clears the inputs/selects; it doesn't touch the result panel.
  form.addEventListener("reset", () => {
    resultEl.className = "result";
    resultEl.innerHTML = "";
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    // The form uses novalidate so out-of-range numbers don't get silently blocked
    // by the browser (min/max below are informational only) — but that also
    // disables the native "required" check, so replicate just that part here.
    const requiredFields = ["ApplicantIncome", "CoapplicantIncome", "LoanAmount", "Loan_Amount_Term"];
    const emptyField = requiredFields.find((f) => String(data[f] ?? "").trim() === "");
    if (emptyField) {
      resultEl.className = "result show error";
      resultEl.innerHTML = `Please fill in ${RANGE_FIELD_LABELS[emptyField]}.`;
      return;
    }

    const payload = {
      ApplicantIncome: Number(data.ApplicantIncome),
      CoapplicantIncome: Number(data.CoapplicantIncome),
      LoanAmount: Number(data.LoanAmount),
      Loan_Amount_Term: Number(data.Loan_Amount_Term),
      Credit_History: Number(data.Credit_History),
      Education: data.Education,
      Married: data.Married,
    };

    resultEl.className = "result show";
    resultEl.innerHTML = `<p class="placeholder">Scoring application…</p>`;

    try {
      const res = await getJSON(`${API_BASE}/model/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const approved = res.prediction === 1;
      const p = (res.probability * 100).toFixed(1);
      const warningHTML = renderRangeWarning(findOutOfRangeFields(payload));

      resultEl.className = `result show ${approved ? "approved" : "rejected"}`;
      resultEl.innerHTML = `
        <div class="verdict"><span class="swatch"></span>${approved ? "Approved" : "Rejected"}</div>
        <div class="prob-label"><span>Approval probability</span><span>${p}%</span></div>
        <div class="prob-track"><div class="prob-fill" style="width:${p}%"></div></div>
        ${warningHTML}
      `;
    } catch (e) {
      resultEl.className = "result show error";
      resultEl.innerHTML = `${escapeHTML(e.message)}`;
    }
  });
}

/* ---------- Init ---------- */

loadFeatureRanges();
initPredictForm();
