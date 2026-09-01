/**
 * Loan Approval Model dashboard.
 * Pulls live data from the Flask API and renders it — no state is hardcoded here.
 */

// Relative paths work when Flask itself serves this page (port 5000). When the
// page is instead opened via a static server — e.g. VS Code's Live Server, on
// port 5500 — fetches need to point at Flask explicitly, since the static
// server can't answer /model/* routes itself.
const API_BASE = window.location.port === "5000" ? "" : "http://127.0.0.1:5000";

const ACCENTS = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6"];

const FEATURE_ICONS = {
  ApplicantIncome: "💰",
  CoapplicantIncome: "🤝",
  LoanAmount: "🏠",
  Loan_Amount_Term: "📅",
  Credit_History: "✅",
  Education: "🎓",
  Married: "💍",
};

const SAMPLE_COLUMNS = [
  "ApplicantIncome", "CoapplicantIncome", "LoanAmount",
  "Loan_Amount_Term", "Credit_History", "Education", "Married", "Loan_Status",
];

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

function pct(x) { return (x * 100).toFixed(1) + "%"; }

/* ---------- Model details + file card + base URL ---------- */

async function loadModelInfo() {
  // The actual base the API calls use — Flask's own origin, not necessarily
  // this page's origin (they differ when served via Live Server).
  document.getElementById("base-url").textContent = API_BASE || window.location.origin;
  // A plain <a href> would otherwise resolve against Live Server's own origin,
  // which has no /model/download route at all — point it at Flask explicitly.
  document.getElementById("download-link").href = `${API_BASE}/model/download`;

  const el = document.getElementById("model-details");
  try {
    const info = await getJSON(`${API_BASE}/model/info`);
    const row = (label, value, mono) => `
      <div class="kv-row"><dt>${label}</dt><dd${mono ? ' class="mono"' : ""}>${value}</dd></div>
    `;
    el.innerHTML =
      row("Algorithm", escapeHTML(info.algorithm)) +
      row("Kernel", escapeHTML(info.kernel)) +
      row("C (Regularization)", info.C) +
      row("Gamma", escapeHTML(info.gamma)) +
      row("Probability", info.probability ? "Enabled" : "Disabled") +
      row("Class Weight", escapeHTML(info.class_weight)) +
      row("Decision Function Shape", escapeHTML(info.decision_function_shape)) +
      row("Classes", info.classes.join(", ")) +
      row("Model File", escapeHTML(info.model_filename), true) +
      row("File Size", `${info.model_filesize_mb} MB`) +
      row("Trained On", escapeHTML(info.trained_on));

    document.getElementById("file-name").textContent = info.model_filename;
    document.getElementById("file-meta").textContent = `${info.model_file_type} · ${info.model_filesize_mb} MB`;
    document.getElementById("file-checksum").textContent = info.model_sha256;
  } catch (e) {
    el.innerHTML = `<div class="kv-row"><dt>Error</dt><dd>${escapeHTML(e.message)}</dd></div>`;
  }
}

/* ---------- Metric cards ---------- */

async function loadMetricCards() {
  try {
    const [m, sv] = await Promise.all([
      getJSON(`${API_BASE}/model/metrics`),
      getJSON(`${API_BASE}/model/support_vectors`),
    ]);
    document.getElementById("m-accuracy").textContent = pct(m.accuracy);
    document.getElementById("m-precision").textContent = pct(m.precision);
    document.getElementById("m-recall").textContent = pct(m.recall);
    document.getElementById("m-f1").textContent = pct(m.f1_score);
    document.getElementById("m-support-vectors").textContent = sv.total;
  } catch (e) {
    ["m-accuracy", "m-precision", "m-recall", "m-f1", "m-support-vectors"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
  }
}

/* ---------- Feature list ---------- */

async function loadFeatures() {
  const el = document.getElementById("feature-rows");
  try {
    const features = await getJSON(`${API_BASE}/model/features`);
    el.innerHTML = features.map((f, i) => `
      <li>
        <span class="feature-dot" style="--fc:${ACCENTS[i % ACCENTS.length]}">${FEATURE_ICONS[f.name] || "🔹"}</span>
        <span class="feature-text">
          <span class="feature-name">${escapeHTML(f.name)}</span>
          <span class="feature-desc">${escapeHTML(f.description)}</span>
        </span>
      </li>
    `).join("");
  } catch (e) {
    el.innerHTML = `<li class="placeholder">Failed to load features: ${escapeHTML(e.message)}</li>`;
  }
}

/* ---------- Dataset samples ---------- */

async function loadSamples() {
  const table = document.getElementById("samples-table");
  try {
    const rows = await getJSON(`${API_BASE}/model/samples`);
    if (!rows.length) throw new Error("No sample rows returned");

    const thead = `<thead><tr>${SAMPLE_COLUMNS.map(c => `<th>${escapeHTML(c)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map(row => `
      <tr>${SAMPLE_COLUMNS.map(c => {
        const v = row[c];
        if (c === "Loan_Status") {
          const approved = v === "Y";
          return `<td><span class="status-pill ${approved ? "approved" : "rejected"}">${approved ? "Approved" : "Rejected"}</span></td>`;
        }
        return `<td>${v === null || v === undefined || v === "" ? "—" : escapeHTML(v)}</td>`;
      }).join("")}</tr>
    `).join("")}</tbody>`;

    table.innerHTML = thead + tbody;
  } catch (e) {
    table.innerHTML = `<tbody><tr><td class="placeholder">Failed to load samples: ${escapeHTML(e.message)}</td></tr></tbody>`;
  }
}

/* ---------- Decision boundary (Plotly, computed from real model + PCA) ---------- */

async function loadDecisionBoundary() {
  const el = document.getElementById("decision-plot");
  try {
    const d = await getJSON(`${API_BASE}/model/decision_boundary`);

    const classColor = { 0: "#ec4899", 1: "#3b82f6" };
    const classLabel = { 0: "Predicted: Rejected", 1: "Predicted: Approved" };

    const pointsByClass = { 0: { x: [], y: [] }, 1: { x: [], y: [] } };
    d.test_points.forEach((p) => {
      pointsByClass[p.predicted].x.push(p.x);
      pointsByClass[p.predicted].y.push(p.y);
    });

    const scatterTraces = [0, 1].map((cls) => ({
      x: pointsByClass[cls].x,
      y: pointsByClass[cls].y,
      mode: "markers",
      type: "scatter",
      name: classLabel[cls],
      marker: { color: classColor[cls], size: 6, opacity: 0.85 },
      hoverinfo: "skip",
    }));

    const svTrace = {
      x: d.support_vectors.map((p) => p.x),
      y: d.support_vectors.map((p) => p.y),
      mode: "markers",
      type: "scatter",
      name: "Support Vectors",
      marker: { color: "rgba(0,0,0,0)", size: 11, line: { color: "#ffffff", width: 1.3 } },
      hoverinfo: "skip",
    };

    const fillTrace = {
      x: d.grid.x, y: d.grid.y, z: d.grid.z,
      type: "contour",
      colorscale: [[0, "#ec4899"], [0.5, "#11162a"], [1, "#3b82f6"]],
      showscale: false,
      opacity: 0.28,
      contours: { coloring: "fill", showlines: false },
      ncontours: 12,
      hoverinfo: "skip",
    };

    const boundaryTrace = {
      x: d.grid.x, y: d.grid.y, z: d.grid.z,
      type: "contour",
      showscale: false,
      // Contour line color is driven by colorscale, not `line.color` — pin it flat
      // so the boundary always renders solid white regardless of z-range.
      colorscale: [[0, "#ffffff"], [1, "#ffffff"]],
      autocontour: false,
      contours: { coloring: "lines", start: 0, end: 0, size: 1 },
      line: { width: 2.5 },
      hoverinfo: "skip",
    };

    const marginTrace = {
      x: d.grid.x, y: d.grid.y, z: d.grid.z,
      type: "contour",
      showscale: false,
      colorscale: [[0, "#c7cdda"], [1, "#c7cdda"]],
      autocontour: false,
      contours: { coloring: "lines", start: -1, end: 1, size: 2 },
      line: { width: 1, dash: "dash" },
      hoverinfo: "skip",
    };

    el.innerHTML = "";
    Plotly.newPlot(
      el,
      [fillTrace, marginTrace, boundaryTrace, ...scatterTraces, svTrace],
      {
        margin: { t: 10, r: 10, b: 36, l: 40 },
        height: 340,
        showlegend: false,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { color: "#8b93a7", size: 11 },
        xaxis: { title: `PC1 (${(d.explained_variance[0] * 100).toFixed(0)}% var)`, gridcolor: "rgba(255,255,255,.06)", zeroline: false },
        yaxis: { title: `PC2 (${(d.explained_variance[1] * 100).toFixed(0)}% var)`, gridcolor: "rgba(255,255,255,.06)", zeroline: false },
      },
      { displayModeBar: false, responsive: true }
    );
  } catch (e) {
    el.innerHTML = `<p class="placeholder">Failed to load decision boundary: ${escapeHTML(e.message)}</p>`;
  }
}

/* ---------- Init ---------- */

loadModelInfo();
loadMetricCards();
loadFeatures();
loadSamples();
loadDecisionBoundary();
