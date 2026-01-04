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
   MERCHANT (per-store)
========================= */

// storeId ثابت من الرابط: merchant.html?store=myshop
function currentStoreId() {
  const storeId = (qs("store") || "").trim();
  return storeId;
}

function tokenKey() {
  // نخزن توكن منفصل لكل متجر
  return "adminToken:" + currentStoreId();
}

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
  const t = sessionStorage.getItem(tokenKey());
  if (!t) throw new Error("Not logged in");
  return t;
}

async function merchantInit() {
  clearErr();

  const storeId = currentStoreId();
  if (!storeId) {
    showErr("الرابط لازم يحتوي storeId مثل: merchant.html?store=myshop");
    return;
  }

  setText("storeIdView", storeId);
  setText("storeTitle", "لوحة المتجر: " + storeId);

  const token = sessionStorage.getItem(tokenKey());
  if (token) {
    // عرض اللوحة
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("mainCard").style.display = "block";
    await loadAccounts();
  }
}

async function adminLogin() {
  clearErr();

  const storeId = currentStoreId();
  const password = document.getElementById("adminPassword")?.value || "";

  if (!storeId || !password) {
    showErr("اكتب كلمة المرور.");
    return;
  }

  const out = await api({ action: "adminLogin", storeId, password });
  if (!out.ok) {
    showErr(out.error || "Login failed");
    return;
  }

  sessionStorage.setItem(tokenKey(), out.token);
  location.reload();
}

function logout() {
  sessionStorage.removeItem(tokenKey());
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

  const sel = document.getElementById("accountSelect");
  if (sel) {
    sel.innerHTML = items.map(a =>
      `<option value="${escapeAttr(a.accountId)}">${escapeHtml(a.label || a.email || a.accountId)}</option>`
    ).join("");
  }

  const rows = items.map(a => `
    <tr>
      <td>${escapeHtml(a.label || "")}</td>
      <td>${escapeHtml(a.email || "")}</td>
      <td><code>${escapeHtml(a.accountId)}</code></td>
      <td class="small">${escapeHtml((a.instructions || "").slice(0, 70))}${(a.instructions || "").length > 70 ? "…" : ""}</td>
    </tr>
  `).join("");

  setHtml("accountsTableBody", rows || `<tr><td colspan="4" class="small">لا توجد حسابات لهذا المتجر</td></tr>`);
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

  ["accId","accLabel","accEmail","accPass","accSecret","accInstr"].forEach(id => {
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

  const baseClient = location.origin + location.pathname.replace("merchant.html", "client.html");

  const cards = (out.created || []).map(x => {
    const url = `${baseClient}?id=${encodeURIComponent(x.clientId)}`;
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
  const clientId = (qs("id") || "").trim();
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
