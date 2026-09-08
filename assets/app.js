// =============================================================
// Prozent- & Zinsrechner — App-Logik
// Reines Vanilla-JS, kein Build-Schritt nötig. Speicherung über
// Supabase (siehe supabase/schema.sql und README.md).
// =============================================================

// ---- Supabase-Konfiguration -----------------------------------
// Trage hier die Werte aus deinem Supabase-Projekt ein
// (Project Settings → API). Ohne gültige Werte läuft die App im
// Offline-Modus: Aufgaben funktionieren, aber nichts wird gespeichert.
const SUPABASE_URL = "https://vyunodtwvtgtjbaonejt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dW5vZHR3dnRndGpiYW9uZWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NDEyNDMsImV4cCI6MjEwNDQxNzI0M30.dsV_4GxVq-PTkDG0H5d_4ZW11ae9feSs2NmuKuhyQgM";

const supa =
  window.supabase && !SUPABASE_URL.includes("YOUR-PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// ---- Aufgabentexte (Platzhalter werden pro Variante gefüllt) ---
const TASK_DEFS = [
  {
    key: "t1",
    unit: "%",
    prompt: (t) => `Wie viel Prozent sind ${t.a} von ${t.b}?`,
  },
  {
    key: "t2",
    unit: "€",
    prompt: (t) => `Berechne ${fmtNum(t.p)} % von ${fmtNum(t.g)} €.`,
  },
  {
    key: "t3",
    unit: "€",
    prompt: (t) => `${fmtNum(t.p)} % eines Betrags sind ${fmtNum(t.w)} €. Berechne den Grundwert.`,
  },
  {
    key: "t4",
    unit: "€",
    prompt: (t) => `Ein Artikel kostet ${fmtNum(t.n)} € netto. Berechne den Bruttopreis (19 % MwSt).`,
  },
  {
    key: "t5",
    unit: "€",
    prompt: (t) => `Ein Preis von ${fmtNum(t.p)} € steigt um ${fmtNum(t.pct)} %. Berechne den neuen Preis mit dem Wachstumsfaktor.`,
  },
  {
    key: "t6",
    unit: "€",
    prompt: (t) => `Berechne die Jahreszinsen für ${fmtNum(t.k)} € zu ${fmtNum(t.z)} %.`,
  },
];
const TASK7_PROMPT = "Erkläre in ganzen Sätzen, wie du bei Aufgabe 3 (Grundwert berechnen) vorgegangen bist.";

const TOLERANCE = 0.05;

// ---- Helpers -----------------------------------------------------

function fmtNum(n) {
  // 42.5 -> "42,5" / 300 -> "300" (deutsche Schreibweise, ohne unnötige Nachkommastellen)
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString().replace(".", ",");
}

function parseGermanNumber(str) {
  if (typeof str !== "string") return NaN;
  const cleaned = str.trim().replace(/[€%\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function isClose(a, b, tol = TOLERANCE) {
  return Number.isFinite(a) && Math.abs(a - b) <= tol;
}

function findVariant(code) {
  const norm = (code || "").trim().toUpperCase();
  return VARIANTS.find((v) => v.code.toUpperCase() === norm) || null;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function downloadTextFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- App-Root ------------------------------------------------------

const app = document.getElementById("app");

function render(html) {
  app.innerHTML = html;
}

// ================= Gate (Login) =================

function renderGate(opts = {}) {
  const { tab = "student", error = "" } = opts;
  render(`
    <div class="card">
      <div class="tabs" role="tablist">
        <button class="tab-btn" role="tab" aria-selected="${tab === "student"}" data-tab="student">Schüler:in</button>
        <button class="tab-btn" role="tab" aria-selected="${tab === "admin"}" data-tab="admin">Für Lehrkräfte</button>
      </div>

      ${error ? `<p class="error-msg" style="margin-bottom:16px;">${escapeHtml(error)}</p>` : ""}

      ${tab === "student" ? `
        <form id="student-form" class="stack" autocomplete="off">
          <p class="eyebrow">Übung starten</p>
          <div class="row">
            <div class="field">
              <label for="in-code">Zugangscode</label>
              <input type="text" id="in-code" class="mono" placeholder="z. B. PZ26-A" autocapitalize="characters" required />
              <p class="hint">Steht auf deinem Arbeitsblatt / wurde dir von deiner Lehrkraft genannt.</p>
            </div>
            <div class="field">
              <label for="in-name">Dein Name</label>
              <input type="text" id="in-name" autocomplete="name" placeholder="Vorname Nachname" required />
              <p class="hint">Wird zusammen mit deinem Ergebnis gespeichert.</p>
            </div>
          </div>
          <div>
            <button class="btn" type="submit">Aufgaben öffnen →</button>
          </div>
        </form>
      ` : `
        <form id="admin-form" class="stack" autocomplete="on">
          <p class="eyebrow">Admin-Anmeldung</p>
          <div class="row">
            <div class="field">
              <label for="in-email">E-Mail</label>
              <input type="email" id="in-email" autocomplete="username" required />
            </div>
            <div class="field">
              <label for="in-pass">Passwort</label>
              <input type="password" id="in-pass" autocomplete="current-password" required />
            </div>
          </div>
          <div>
            <button class="btn" type="submit">Anmelden →</button>
          </div>
          <p class="hint">Zugang wird in Supabase (Authentication) angelegt — siehe README.</p>
        </form>
      `}
    </div>

    ${!supa ? `<div class="card" style="margin-top:20px;"><p class="error-msg">Offline-Modus: Es ist noch keine Supabase-Verbindung eingerichtet (siehe <code>assets/app.js</code>). Aufgaben funktionieren, Ergebnisse werden aber nicht gespeichert.</p></div>` : ""}
  `);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => renderGate({ tab: btn.dataset.tab }));
  });

  const studentForm = document.getElementById("student-form");
  if (studentForm) {
    studentForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = document.getElementById("in-code").value;
      const name = document.getElementById("in-name").value.trim();
      const variant = findVariant(code);
      if (!variant) {
        renderGate({ tab: "student", error: "Diesen Zugangscode kenne ich nicht. Bitte prüfe die Schreibweise." });
        return;
      }
      if (!name) {
        renderGate({ tab: "student", error: "Bitte gib deinen Namen ein." });
        return;
      }
      renderWorksheet(variant, name);
    });
  }

  const adminForm = document.getElementById("admin-form");
  if (adminForm) {
    adminForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!supa) {
        renderGate({ tab: "admin", error: "Supabase ist nicht konfiguriert — Admin-Ansicht ist ohne Datenbank-Anbindung nicht möglich." });
        return;
      }
      const email = document.getElementById("in-email").value.trim();
      const password = document.getElementById("in-pass").value;
      const submitBtn = adminForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      submitBtn.textContent = "Anmelden …";
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        renderGate({ tab: "admin", error: "Anmeldung fehlgeschlagen: " + error.message });
        return;
      }
      renderAdmin();
    });
  }
}

// ================= Worksheet =================

function renderWorksheet(variant, name, prevAnswers = {}) {
  const tasksHtml = TASK_DEFS.map((def, idx) => {
    const t = variant.tasks[def.key];
    const prev = prevAnswers[def.key] ?? "";
    return `
      <div class="task" data-key="${def.key}">
        <div class="task-num">${idx + 1}</div>
        <div class="task-body">
          <p>${def.prompt(t)}</p>
          <div class="task-answer">
            <input type="text" inputmode="decimal" class="answer-input" data-key="${def.key}" value="${escapeHtml(prev)}" placeholder="0" />
            <span class="unit">${def.unit}</span>
          </div>
          <div class="task-feedback"></div>
        </div>
      </div>
    `;
  }).join("");

  render(`
    <div class="card">
      <span class="variant-pill">Angemeldet als <strong>${escapeHtml(name)}</strong> · <span class="code-pill">${variant.code}</span></span>
      <h2 style="margin-top:16px;">Prozent- und Zinsrechnung</h2>
      <p class="hint" style="margin-bottom:0;">Trage bei den Aufgaben 1–6 nur die Zahl ein (Dezimaltrennzeichen Komma oder Punkt). Bei Aufgabe 7 erklärst du deinen Rechenweg in ganzen Sätzen.</p>
    </div>

    <div class="card">
      <form id="worksheet-form">
        ${tasksHtml}
        <div class="task" data-key="t7">
          <div class="task-num">7</div>
          <div class="task-body">
            <p>${TASK7_PROMPT}</p>
            <textarea id="t7-input" placeholder="Zuerst habe ich … Dann …">${escapeHtml(prevAnswers.t7 ?? "")}</textarea>
          </div>
        </div>

        <div class="row" style="margin-top:20px; justify-content:space-between; align-items:center;">
          <button type="button" class="btn btn-ghost" id="back-btn">← Zurück</button>
          <button type="submit" class="btn" id="submit-btn">Abgeben</button>
        </div>
      </form>
      <div id="submit-status" style="margin-top:14px;"></div>
    </div>
  `);

  document.getElementById("back-btn").addEventListener("click", () => {
    if (confirm("Zurück zur Anmeldung? Deine Eingaben auf dieser Seite gehen dabei verloren.")) {
      renderGate();
    }
  });

  document.getElementById("worksheet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await handleSubmit(variant, name);
  });
}

async function handleSubmit(variant, name) {
  const answers = {};
  document.querySelectorAll(".answer-input").forEach((input) => {
    answers[input.dataset.key] = input.value;
  });
  answers.t7 = document.getElementById("t7-input").value.trim();

  let correctCount = 0;
  TASK_DEFS.forEach((def) => {
    const taskEl = document.querySelector(`.task[data-key="${def.key}"]`);
    const feedbackEl = taskEl.querySelector(".task-feedback");
    const given = parseGermanNumber(answers[def.key]);
    const correct = variant.tasks[def.key].answer;
    const ok = isClose(given, correct);
    taskEl.classList.remove("correct", "incorrect");
    taskEl.classList.add(ok ? "correct" : "incorrect");
    feedbackEl.textContent = ok
      ? "Richtig!"
      : `Nicht ganz — richtig wäre ${fmtNum(correct)} ${def.unit}.`;
    if (ok) correctCount++;
  });

  const total = TASK_DEFS.length;
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("submit-status");
  submitBtn.disabled = true;
  submitBtn.textContent = "Speichere …";

  const payload = {
    variant_code: variant.code,
    variant_label: variant.label,
    student_name: name,
    answers,
    score: correctCount,
    total,
    explanation: answers.t7,
  };

  let saved = false;
  if (supa) {
    const { error } = await supa.from("submissions").insert(payload);
    saved = !error;
    if (error) console.error("Supabase insert error:", error);
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Abgeben";

  if (saved) {
    statusEl.innerHTML = `<p class="info-msg">Gespeichert — deine Lehrkraft kann das Ergebnis einsehen.</p>`;
  } else {
    statusEl.innerHTML = `
      <p class="error-msg">Konnte nicht automatisch gespeichert werden.</p>
      <button type="button" class="btn btn-secondary btn-small" id="fallback-download">Ergebnis als Datei herunterladen</button>
    `;
    document.getElementById("fallback-download").addEventListener("click", () => {
      const lines = [
        `Name: ${name}`,
        `Variante: ${variant.code}`,
        `Punkte: ${correctCount} von ${total}`,
        "",
        ...TASK_DEFS.map((def, i) => `${i + 1}. Eingabe: ${answers[def.key]} ${def.unit} (richtig: ${fmtNum(variant.tasks[def.key].answer)} ${def.unit})`),
        "",
        "7. " + answers.t7,
      ];
      downloadTextFile(`${name.replace(/\s+/g, "_")}_${variant.code}.txt`, lines.join("\n"));
    });
  }

  renderResultBanner(correctCount, total, variant, name, answers);
}

function renderResultBanner(score, total, variant, name, answers) {
  const banner = document.createElement("div");
  banner.className = "score-banner";
  banner.innerHTML = `
    <span class="score-num">${score}/${total}</span>
    <span class="score-label">Aufgaben automatisch richtig gelöst · Aufgabe 7 wird von deiner Lehrkraft gelesen</span>
  `;
  const firstCard = document.querySelector(".card");
  firstCard.parentNode.insertBefore(banner, firstCard);
}

// ================= Admin dashboard =================

let ADMIN_ROWS = [];
let ADMIN_FILTER = { variant: "all", q: "" };

async function renderAdmin() {
  render(`<div class="card"><p class="hint">Lade Abgaben …</p></div>`);

  const { data, error } = await supa
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    render(`
      <div class="card">
        <p class="error-msg">Abgaben konnten nicht geladen werden: ${escapeHtml(error.message)}</p>
        <p class="hint">Prüfe, ob die RLS-Policy „Allow authenticated read“ aus <code>supabase/schema.sql</code> angelegt wurde.</p>
        <button class="btn btn-secondary" id="logout-btn">Abmelden</button>
      </div>
    `);
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await supa.auth.signOut();
      renderGate();
    });
    return;
  }

  ADMIN_ROWS = data || [];
  drawAdmin();
}

function drawAdmin() {
  const rows = ADMIN_ROWS.filter((r) => {
    if (ADMIN_FILTER.variant !== "all" && r.variant_code !== ADMIN_FILTER.variant) return false;
    if (ADMIN_FILTER.q && !r.student_name.toLowerCase().includes(ADMIN_FILTER.q.toLowerCase())) return false;
    return true;
  });

  const variantOptions = ["all", ...VARIANTS.map((v) => v.code)];
  const totalSubmissions = ADMIN_ROWS.length;
  const avgScore = totalSubmissions
    ? (ADMIN_ROWS.reduce((s, r) => s + (r.score ?? 0), 0) / totalSubmissions).toFixed(1)
    : "–";
  const uniqueStudents = new Set(ADMIN_ROWS.map((r) => r.student_name.trim().toLowerCase())).size;
  const uniqueVariantsUsed = new Set(ADMIN_ROWS.map((r) => r.variant_code)).size;

  render(`
    <div class="card">
      <div class="admin-toolbar">
        <div>
          <p class="eyebrow">Admin-Ansicht</p>
          <h2 style="margin:0;">Abgaben</h2>
        </div>
        <div class="row">
          <button class="btn btn-secondary btn-small" id="export-csv">Als CSV exportieren</button>
          <button class="btn btn-secondary btn-small" id="refresh-btn">Aktualisieren</button>
          <button class="btn btn-ghost btn-small" id="logout-btn">Abmelden</button>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-tile"><div class="num">${totalSubmissions}</div><div class="label">Abgaben gesamt</div></div>
        <div class="stat-tile"><div class="num">${uniqueStudents}</div><div class="label">Verschiedene Namen</div></div>
        <div class="stat-tile"><div class="num">${uniqueVariantsUsed}/${VARIANTS.length}</div><div class="label">Varianten genutzt</div></div>
        <div class="stat-tile"><div class="num">${avgScore}/6</div><div class="label">Ø Punkte (Aufg. 1–6)</div></div>
      </div>

      <div class="admin-filters" style="margin-bottom:14px;">
        <select id="filter-variant">
          ${variantOptions.map((c) => `<option value="${c}" ${ADMIN_FILTER.variant === c ? "selected" : ""}>${c === "all" ? "Alle Varianten" : c}</option>`).join("")}
        </select>
        <input type="text" id="filter-name" placeholder="Nach Name suchen …" value="${escapeHtml(ADMIN_FILTER.q)}" />
      </div>

      ${rows.length === 0 ? `<p class="empty-state">Noch keine passenden Abgaben.</p>` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Zeit</th>
                <th>Name</th>
                <th>Variante</th>
                <th>Punkte</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, i) => adminRowHtml(r, i)).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `);

  document.getElementById("filter-variant").addEventListener("change", (e) => {
    ADMIN_FILTER.variant = e.target.value;
    drawAdmin();
  });
  document.getElementById("filter-name").addEventListener("input", (e) => {
    ADMIN_FILTER.q = e.target.value;
    drawAdmin();
  });
  document.getElementById("refresh-btn").addEventListener("click", renderAdmin);
  document.getElementById("export-csv").addEventListener("click", () => exportCsv(rows));
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supa.auth.signOut();
    renderGate();
  });

  document.querySelectorAll(".row-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const detail = document.getElementById(btn.dataset.target);
      detail.style.display = detail.style.display === "none" ? "table-row" : "none";
    });
  });
}

function adminRowHtml(row, i) {
  const pct = row.total ? Math.round((row.score / row.total) * 100) : 0;
  const detailId = `detail-${i}`;
  const answers = row.answers || {};
  const time = new Date(row.created_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  const detailItems = TASK_DEFS.map((def, idx) => {
    const variant = VARIANTS.find((v) => v.code === row.variant_code);
    const correct = variant ? variant.tasks[def.key].answer : null;
    const given = parseGermanNumber(answers[def.key]);
    const ok = correct !== null && isClose(given, correct);
    return `<div class="detail-item ${ok ? "right" : "wrong"}">Aufg. ${idx + 1}: <strong>${escapeHtml(answers[def.key] ?? "–")}</strong> ${def.unit}${correct !== null ? ` (richtig: ${fmtNum(correct)} ${def.unit})` : ""}</div>`;
  }).join("");

  return `
    <tr>
      <td><button class="link-btn row-toggle" data-target="${detailId}">Details</button></td>
      <td class="mono">${time}</td>
      <td>${escapeHtml(row.student_name)}</td>
      <td><span class="code-pill">${escapeHtml(row.variant_code)}</span></td>
      <td class="num"><span class="pct-bar"><span style="width:${pct}%"></span></span>${row.score}/${row.total}</td>
    </tr>
    <tr class="detail-row" id="${detailId}" style="display:none;">
      <td colspan="5">
        <div class="detail-grid">${detailItems}</div>
        <p style="margin:0;"><strong>Aufgabe 7 (Erklärung):</strong><br>${escapeHtml(row.explanation || "–")}</p>
      </td>
    </tr>
  `;
}

function exportCsv(rows) {
  const header = ["Zeit", "Name", "Variante", "Punkte", "Von", ...TASK_DEFS.map((d, i) => `Aufgabe ${i + 1}`), "Erklärung (Aufgabe 7)"];
  const lines = [header.join(";")];
  rows.forEach((r) => {
    const answers = r.answers || {};
    const cells = [
      new Date(r.created_at).toLocaleString("de-DE"),
      r.student_name,
      r.variant_code,
      r.score,
      r.total,
      ...TASK_DEFS.map((d) => answers[d.key] ?? ""),
      (r.explanation || "").replace(/\n/g, " "),
    ];
    lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
  });
  downloadTextFile("abgaben.csv", lines.join("\n"), "text/csv");
}

// ================= Start =================

(async function init() {
  renderGate();
  if (supa) {
    const { data: { session } } = await supa.auth.getSession();
    if (session) renderAdmin();
  }
})();
