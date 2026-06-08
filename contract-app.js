/* ============================================================
   contract-app.js — Consumer site logic for BuildContract
   Manages form state, live preview, and PDF download
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let clauses = [{ title: 'General Scope', body: '' }];
let accentColor = '#6366f1';
let isGenerating = false;

// ── DOM refs ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Set default dates
  const today = new Date();
  const in30  = new Date(today); in30.setDate(today.getDate() + 30);
  $("contractDate").value = today.toISOString().split("T")[0];
  $("startDate").value    = today.toISOString().split("T")[0];
  $("endDate").value      = in30.toISOString().split("T")[0];

  renderClauses();
  bindEvents();
  updatePreview();
});

function bindEvents() {
  // Color picker
  $("accentColor").addEventListener("input", (e) => {
    accentColor = e.target.value;
    $("accentColorHex").value = e.target.value;
    updatePreview();
  });
  $("accentColorHex").addEventListener("input", (e) => {
    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
      accentColor = e.target.value;
      $("accentColor").value = e.target.value;
      updatePreview();
    }
  });

  // Add clause
  $("btnAddClause").addEventListener("click", () => {
    clauses.push({ title: '', body: '' });
    renderClauses();
    updatePreview();
  });

  // Download
  $("btnDownload").addEventListener("click", downloadContract);

  // Listen to all form inputs for live preview
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    el.addEventListener("input", () => { calcDeposit(); updatePreview(); });
  });

  // Toast close
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("toast")) e.target.classList.remove("show");
  });
}

// ── Clauses ───────────────────────────────────────────────────
function renderClauses() {
  const container = $("clauseItems");
  container.innerHTML = "";

  clauses.forEach((clause, i) => {
    const section = document.createElement("div");
    section.className = "clause-section";
    section.innerHTML = `
      <div class="clause-header">
        <span class="clause-number">§${i + 1}</span>
        <input type="text" placeholder="Clause title" value="${escHtml(clause.title)}" data-idx="${i}" data-field="title" style="flex:1;">
        <button class="btn-remove-item" data-idx="${i}" title="Remove clause">✕</button>
      </div>
      <textarea placeholder="Describe the work, deliverables, or terms for this clause…" data-idx="${i}" data-field="body" rows="3">${escHtml(clause.body)}</textarea>
    `;
    container.appendChild(section);
  });

  // Bind clause events
  container.querySelectorAll("input, textarea").forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx   = +e.target.dataset.idx;
      const field = e.target.dataset.field;
      clauses[idx][field] = e.target.value;
      updatePreview();
    });
  });

  container.querySelectorAll(".btn-remove-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = +e.target.dataset.idx;
      if (clauses.length > 1) {
        clauses.splice(idx, 1);
        renderClauses();
        updatePreview();
      }
    });
  });
}

// ── Deposit Calc ──────────────────────────────────────────────
function calcDeposit() {
  const totalValue     = parseFloat($("totalValue")?.value) || 0;
  const depositPercent = parseFloat($("depositPercent")?.value) || 0;
  const cur            = $("currency")?.value || "$";
  const deposit        = totalValue * (depositPercent / 100);
  const balance        = totalValue - deposit;

  if ($("dispValue"))   $("dispValue").textContent   = fmtCurrency(totalValue);
  if ($("dispDeposit")) $("dispDeposit").textContent  = fmtCurrency(deposit);
  if ($("dispBalance")) $("dispBalance").textContent  = fmtCurrency(balance);
}

// ── Live Preview ──────────────────────────────────────────────
function updatePreview() {
  const data = collectFormData();
  $("previewBody").innerHTML = renderPreviewHTML(data);
}

function collectFormData() {
  const currency = $("currency")?.value || "$";
  const totalValue     = parseFloat($("totalValue")?.value) || 0;
  const depositPercent = parseFloat($("depositPercent")?.value) || 0;

  return {
    from: {
      name:    $("fromName")?.value || "",
      email:   $("fromEmail")?.value || "",
      address: [$("fromStreet")?.value, $("fromCity")?.value, $("fromState")?.value].filter(Boolean).join(", "),
      phone:   $("fromPhone")?.value || "",
    },
    to: {
      name:    $("toName")?.value || "",
      email:   $("toEmail")?.value || "",
      address: [$("toStreet")?.value, $("toCity")?.value, $("toState")?.value].filter(Boolean).join(", "),
    },
    contract: {
      number:  $("contractNumber")?.value || "CTR-001",
      date:    $("contractDate")?.value || "",
      project: $("projectName")?.value || "",
      type:    $("contractType")?.value || "fixed_price",
    },
    clauses: clauses,
    payment: {
      total:           totalValue,
      currency:        currency,
      schedule:        $("paymentSchedule")?.value || "upon_completion",
      deposit_percent: depositPercent,
    },
    timeline: {
      start:        $("startDate")?.value || "",
      end:          $("endDate")?.value || "",
      late_penalty: $("latePenalty")?.value || "",
    },
    additional_terms:    $("additionalTerms")?.value || "",
    dispute_resolution:  $("disputeResolution")?.value || "none",
    governing_law:       $("governingLaw")?.value || "",
    options: {
      color:    accentColor,
      template: "modern",
      pageSize: "letter",
    },
    currency: currency,
    color:    accentColor,
  };
}

function renderPreviewHTML(d) {
  const col = d.color || "#6366f1";
  const cur = d.currency || "$";
  const fmt = (n) => `${cur}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  const esc = escHtml;

  const typeLabels = {
    fixed_price: "Fixed Price",
    time_and_materials: "Time & Materials",
    retainer: "Retainer",
    milestone: "Milestone-Based",
  };

  const scheduleLabels = {
    upon_completion: "Due upon completion",
    "50_50": "50% deposit, 50% upon completion",
    net_15: "Net 15 days",
    net_30: "Net 30 days",
    milestone: "Per milestone completion",
    custom: "Custom schedule (see additional terms)",
  };

  const disputeLabels = {
    none: "",
    mediation: "Mediation",
    arbitration: "Binding Arbitration",
    litigation: "Litigation in courts of applicable jurisdiction",
  };

  const deposit = d.payment.total * (d.payment.deposit_percent / 100);
  const balance = d.payment.total - deposit;

  // Build clauses HTML
  const clausesHTML = d.clauses.map((c, i) => {
    if (!c.title && !c.body) return "";
    return `
      <div style="margin-bottom:10px;">
        <div style="font-weight:700;font-size:11px;color:#1a202c;margin-bottom:3px;">${i + 1}. ${esc(c.title) || "Untitled Clause"}</div>
        ${c.body ? `<div style="font-size:10px;color:#4a5568;line-height:1.6;padding-left:14px;">${esc(c.body)}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div style="font-family:Inter,sans-serif;font-size:12px;color:#1a202c;padding:24px;background:#fff;min-height:500px;">
      <!-- Header bar -->
      <div style="height:4px;background:${col};border-radius:2px;margin-bottom:16px;"></div>

      <!-- Title -->
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:16px;font-weight:800;color:#1a202c;letter-spacing:1px;">CONTRACT AGREEMENT</div>
        <div style="font-size:9px;color:#718096;margin-top:4px;">
          ${d.contract.number ? `Contract #${esc(d.contract.number)}` : ""}
          ${d.contract.date ? ` · Date: ${d.contract.date}` : ""}
          ${d.contract.type ? ` · ${typeLabels[d.contract.type] || d.contract.type}` : ""}
        </div>
        ${d.contract.project ? `<div style="font-size:11px;font-weight:600;color:${col};margin-top:4px;">Project: ${esc(d.contract.project)}</div>` : ""}
      </div>

      <!-- Parties -->
      <div style="background:#f7f7fb;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:16px;">
        <div style="font-size:8px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:8px;">BETWEEN</div>
        <div style="display:flex;justify-content:space-between;">
          <div>
            <div style="font-size:9px;font-weight:700;color:#718096;letter-spacing:0.5px;margin-bottom:2px;">CONTRACTOR</div>
            <div style="font-weight:700;font-size:12px;">${esc(d.from.name) || "<span style='color:#aaa'>Your Company</span>"}</div>
            ${d.from.address ? `<div style="color:#718096;font-size:10px;">${esc(d.from.address)}</div>` : ""}
            ${d.from.email ? `<div style="color:#718096;font-size:10px;">${esc(d.from.email)}</div>` : ""}
            ${d.from.phone ? `<div style="color:#718096;font-size:10px;">${esc(d.from.phone)}</div>` : ""}
          </div>
          <div style="text-align:right;">
            <div style="font-size:9px;font-weight:700;color:#718096;letter-spacing:0.5px;margin-bottom:2px;">CLIENT</div>
            <div style="font-weight:700;font-size:12px;">${esc(d.to.name) || "<span style='color:#aaa'>Client Name</span>"}</div>
            ${d.to.address ? `<div style="color:#718096;font-size:10px;">${esc(d.to.address)}</div>` : ""}
            ${d.to.email ? `<div style="color:#718096;font-size:10px;">${esc(d.to.email)}</div>` : ""}
          </div>
        </div>
      </div>

      <!-- Scope of Work -->
      <div style="margin-bottom:14px;">
        <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">SCOPE OF WORK</div>
        ${clausesHTML || "<div style='font-size:10px;color:#aaa;font-style:italic;'>Add clauses above to define the scope of work.</div>"}
      </div>

      <!-- Payment Terms -->
      <div style="margin-bottom:14px;">
        <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">PAYMENT TERMS</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;">
          <span>Contract Value</span><span style="font-weight:600;">${fmt(d.payment.total)}</span>
        </div>
        ${d.payment.deposit_percent > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;">
            <span>Deposit (${d.payment.deposit_percent}%)</span><span style="font-weight:600;">${fmt(deposit)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;">
            <span>Balance Due</span><span style="font-weight:600;">${fmt(balance)}</span>
          </div>
        ` : ""}
        <div style="font-size:10px;color:#4a5568;margin-top:4px;">
          <strong>Schedule:</strong> ${scheduleLabels[d.payment.schedule] || d.payment.schedule}
        </div>
      </div>

      <!-- Timeline -->
      ${d.timeline.start || d.timeline.end || d.timeline.late_penalty ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">TIMELINE</div>
          <div style="font-size:10px;color:#4a5568;">
            ${d.timeline.start ? `<div><strong>Start:</strong> ${d.timeline.start}</div>` : ""}
            ${d.timeline.end ? `<div><strong>End:</strong> ${d.timeline.end}</div>` : ""}
            ${d.timeline.late_penalty ? `<div><strong>Late Penalty:</strong> ${esc(d.timeline.late_penalty)}</div>` : ""}
          </div>
        </div>
      ` : ""}

      <!-- Additional Terms -->
      ${d.additional_terms ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">ADDITIONAL TERMS</div>
          <div style="font-size:10px;color:#4a5568;line-height:1.6;">${esc(d.additional_terms)}</div>
        </div>
      ` : ""}

      <!-- Dispute Resolution -->
      ${d.dispute_resolution && d.dispute_resolution !== "none" ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">DISPUTE RESOLUTION</div>
          <div style="font-size:10px;color:#4a5568;">
            Any disputes arising from this agreement shall be resolved through <strong>${disputeLabels[d.dispute_resolution] || d.dispute_resolution}</strong>.
            ${d.governing_law ? `<br>Governing Law: <strong>${esc(d.governing_law)}</strong>` : ""}
          </div>
        </div>
      ` : (d.governing_law ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">GOVERNING LAW</div>
          <div style="font-size:10px;color:#4a5568;">This agreement is governed by the laws of <strong>${esc(d.governing_law)}</strong>.</div>
        </div>
      ` : "")}

      <!-- Signature Blocks -->
      <div style="margin-top:28px;">
        <div style="font-size:9px;font-weight:700;color:${col};letter-spacing:1.5px;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">SIGNATURES</div>
        <div style="display:flex;justify-content:space-between;gap:24px;">
          <div style="flex:1;">
            <div style="font-size:9px;font-weight:600;color:#718096;margin-bottom:24px;">CONTRACTOR</div>
            <div style="border-top:1px solid #1a202c;padding-top:6px;">
              <div style="font-size:10px;font-weight:600;">${esc(d.from.name) || "Contractor Name"}</div>
              <div style="font-size:9px;color:#999;margin-top:2px;">Signature</div>
            </div>
            <div style="border-top:1px solid #ccc;margin-top:16px;padding-top:4px;font-size:9px;color:#999;">Date</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;font-weight:600;color:#718096;margin-bottom:24px;">CLIENT</div>
            <div style="border-top:1px solid #1a202c;padding-top:6px;">
              <div style="font-size:10px;font-weight:600;">${esc(d.to.name) || "Client Name"}</div>
              <div style="font-size:9px;color:#999;margin-top:2px;">Signature</div>
            </div>
            <div style="border-top:1px solid #ccc;margin-top:16px;padding-top:4px;font-size:9px;color:#999;">Date</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Download ──────────────────────────────────────────────────
function downloadContract() {
  if (isGenerating) return;

  const data = collectFormData();
  if (!data.from.name) { showToast("Enter your company name to generate a contract.", "error"); return; }
  if (!data.to.name)   { showToast("Enter a client name to generate a contract.", "error"); return; }
  if (clauses.every((c) => !c.title && !c.body)) { showToast("Add at least one clause to the scope of work.", "error"); return; }

  isGenerating = true;
  $("btnDownload").disabled = true;
  $("btnDownload").textContent = "Generating...";

  const previewHTML = renderPreviewHTML(data);
  const filename = `contract-${(data.to.name || 'document').replace(/\s+/g, '-').toLowerCase()}-${data.contract.number || 'CTR-001'}.pdf`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: #fff; }
        @media print {
          body { margin: 0; }
          @page { size: letter; margin: 0.5in; }
        }
      </style>
    </head>
    <body>
      ${previewHTML}
      <script>
        // Wait for fonts to load then print
        document.fonts.ready.then(function() {
          setTimeout(function() { window.print(); }, 300);
        });
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();

  isGenerating = false;
  $("btnDownload").disabled = false;
  $("btnDownload").textContent = "\u2b07 Download Contract PDF";
  showToast("Contract ready \u2014 use Save as PDF in the print dialog", "success");
}

// ── Helpers ───────────────────────────────────────────────────
function fmtCurrency(n) {
  const cur = $("currency")?.value || "$";
  return `${cur}${Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, type = "success") {
  const toast = $("toast");
  toast.textContent = msg;
  toast.className   = `toast toast--${type} show`;
  setTimeout(() => toast.classList.remove("show"), 4000);
}
