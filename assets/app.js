// ✅ ضع رابط Web App الخاص بـ Apps Script هنا
const API_URL = "https://script.google.com/macros/s/AKfycbyvoZbm0tK6Yk-43rd_yFsD7LBN5ZSz_SMSXPtHgG-evCN26U30_WqCBSIZCrg70NJ11g/exec";

/* -------------------------
   Generic helpers
------------------------- */
async function api(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json();
}

function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

/* =========================
   MERCHANT (ADMIN)
========================= */

function showErr(msg) {
  setText("errBox", msg || "Error");
  const box = document.getElementById("errBox");
  if (box) box.style.display = "block";
}

function clearErr() {
  const box = document.getElementById("errBox");
  if (box) box.style.display = "none";
  setText("errBox", "");
}

function adminToken() {
  const t = sessionStorage.getItem("adminToken");
  if (!t) throw new Error("Not logged in");
  return t;
}

function getSavedStoreId() {
  return localStorage.getItem("storeId") || "";
}

function fillSavedStoreId() {
  const v = getSavedStoreId();
  const el = document.getElementById("storeId");
  if (el && v) el.value = v;
}

async function merchantInit() {
  const token = sessionStorage.getItem("adminToken");
  if (token) {
    const loginCard = document.getElementById("loginCard");
    const mainCard = document.getElementById("mainCard");
    if (loginCard) loginCard.style.display = "none";
    if (mainCard) mainCard.style.display = "block";
    await loadAccounts();
  } else {
    fillSavedStoreId();
  }
}

async function adminLogin() {
  clearErr();

  const storeId = (document.getElementById("storeId")?.value || "").trim();
  const password = document.getElementById("adminPassword")?.value || "";

  if (!storeId || !password) {
    showErr("اكتب Store ID وكلمة المرور");
    return;
  }

  const out = await api({ action: "adminLogin", storeId, password });
  if (!out.ok) {
    showErr(out.error || "Login failed");
    return;
  }

  localStorage.setItem("storeId", storeId);
  sessionStorage.setItem("adminToken", out.token);
  location.reload();
}

function logout() {
  sessionStorage.removeItem("adminToken");
  location.reload();
}

async function loadAccounts() {
  clearErr();

  const out = await api({ action: "adminListAccounts", adminToken: adminToken() });
  if (!out.ok) {
    showErr(out.error || "Failed to load accounts");
    return;
  }

  const items = out.items || [];

  // select options
  const sel = document.getElementById("accountSelect");
  if (sel) {
    sel.innerHTML = items.map(a =>
      `<option value="${escapeAttr(a.accountId)}">${escapeHtml(a.label || a.email || a.accountId)}</option>`
    ).join("");
  }

  // table
  const rows = items.map(a => `
    <tr>
      <td>${escapeHtml(a.label || "")}</td>
      <td>${escapeHtml(a.email || "")}</td>
      <td><code>${escapeHtml(a.accountId)}</code></td>
      <td class="small">${escapeHtml((a.instructions || "").slice(0, 70))}${(a.instructions || "").length > 70 ? "…" : ""}</td>
    </tr>
  `).join("");

  setHtml("accountsTableBody", rows || `<tr><td colspan="4" class="small">No accounts yet</td></tr>`);
}

async function createAccount() {
  clearErr();

  const payload = {
    action: "adminCreateAccount",
    adminToken: adminToken(),
    accountId: (document.getElementById("accId")?.value || "").trim(),
    label: document.getElementById("accLabel")?.value || "",
    email: document.getElementById("accEmail")?.value || "",
    password: document.getElementById("accPass")?.value || "",
    totpSecretBase32: document.getElementById("accSecret")?.value || "",
    instructions: document.getElementById("accInstr")?.value || "",
  };

  const out = await api(payload);
  if (!out.ok) {
    showErr(out.error || "Failed to create account");
    return;
  }

  // clear inputs
  ["accId","accLabel","accEmail","accPass","accSecret","accInstr","accNote"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  await loadAccounts();
}

async function createClients() {
  clearErr();

  const accountId = document.getElementById("accountSelect")?.value || "";
  const count = Number(document.getElementById("clientCount")?.value || 1);
  const maxAttempts = Number(document.getElementById("maxAttempts")?.value || 1);

  const out = await api({
    action: "adminCreateClients",
    adminToken: adminToken(),
    accountId,
    count,
    maxAttempts
  });

  if (!out.ok) {
    showErr(out.error || "Failed to create clients");
    return;
  }

  const base = location.origin + location.pathname.replace("merchant.html", "client.html");

  const cards = (out.created || []).map(x => {
    const url = `${base}?id=${encodeURIComponent(x.clientId)}`;
    return `
      <div class="card">
        <div class="small">رابط العميل</div>
        <div style="word-break:break-all">${escapeHtml(url)}</div>
        <div class="actions" style="margin-top:10px">
          <button class="btn secondary" onclick="copyText('${escapeAttr(url)}')">نسخ الرابط</button>
        </div>
      </div>
    `;
  }).join("");

  setHtml("createdLinks", cards || "");
}

/* =========================
   CLIENT
========================= */

async function clientInit() {
  const clientId = qs("id");
  if (!clientId) {
    setText("clientErr", "الرابط غير صحيح (مفقود id).");
    return;
  }

  const info = await api({ action: "clientGetInfo", clientId });
  if (!info.ok) {
    setText("clientErr", info.error || "خطأ");
    return;
  }

  const err = document.getElementById("clientErr");
  const card = document.getElementById("clientCard");
  if (err) err.style.display = "none";
  if (card) card.style.display = "block";

  setText("accLabel2", info.account.label || "صفحة العميل");
  const emailEl = document.getElementById("accEmail2");
  const passEl  = document.getElementById("accPass2");
  if (emailEl) emailEl.value = info.account.email || "";
  if (passEl)  passEl.value  = info.account.password || "";

  setText("attemptsLeft2", String(info.client.attemptsLeft ?? ""));
  setText("maxAttempts2", String(info.client.maxAttempts ?? ""));
  setText("instructions2", info.account.instructions || "");

  window.__CLIENT_ID__ = clientId;
}

async function revealCode() {
  const clientId = window.__CLIENT_ID__;
  const out = await api({ action: "clientRevealCode", clientId });

  const err = document.getElementById("clientErr");
  if (!out.ok) {
    if (err) {
      err.style.display = "block";
      setText("clientErr", out.error || "خطأ");
    }
    return;
  }

  if (err) err.style.display = "none";
  setText("codeBox", out.code);
  setText("attemptsLeft2", String(out.attemptsLeft));
}
