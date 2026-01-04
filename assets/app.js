const API_URL = "PUT_YOUR_APPS_SCRIPT_WEBAPP_URL_HERE";

async function api(payload){
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload),
  });
  return await res.json();
}

function qs(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }
function setHtml(id, html){ const el = document.getElementById(id); if(el) el.innerHTML = html; }

function copy(text){
  navigator.clipboard.writeText(text);
}

/* =========================
   Merchant Page
========================= */

async function merchantInit(){
  const token = sessionStorage.getItem("adminToken") || "";
  if (token) {
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("mainCard").style.display = "block";
    await loadAccounts();
  }
}

async function adminLogin(){
  const password = document.getElementById("adminPassword").value;
  const out = await api({ action:"adminLogin", password });
  if (!out.ok) return showErr(out.error);
  sessionStorage.setItem("adminToken", out.token);
  location.reload();
}

function adminToken(){
  const t = sessionStorage.getItem("adminToken");
  if(!t) throw new Error("Not logged in");
  return t;
}

function showErr(msg){
  setText("errBox", msg || "Error");
  document.getElementById("errBox").style.display = "block";
}
function clearErr(){
  document.getElementById("errBox").style.display = "none";
  setText("errBox","");
}

async function loadAccounts(){
  clearErr();
  const out = await api({ action:"adminListAccounts", adminToken: adminToken() });
  if (!out.ok) return showErr(out.error);

  const items = out.items || [];
  const sel = document.getElementById("accountSelect");
  sel.innerHTML = items.map(a => `<option value="${a.id}">${escapeHtml(a.label || a.email || a.id)}</option>`).join("");

  const rows = items.map(a => `
    <tr>
      <td>${escapeHtml(a.label||"")}</td>
      <td>${escapeHtml(a.email||"")}</td>
      <td><code>${escapeHtml(a.id)}</code></td>
      <td class="small">${escapeHtml((a.instructions||"").slice(0,60))}${(a.instructions||"").length>60?"…":""}</td>
    </tr>
  `).join("");

  setHtml("accountsTableBody", rows || `<tr><td colspan="4" class="small">No accounts yet</td></tr>`);
}

async function createAccount(){
  clearErr();
  const payload = {
    action:"adminCreateAccount",
    adminToken: adminToken(),
    label: document.getElementById("accLabel").value,
    email: document.getElementById("accEmail").value,
    password: document.getElementById("accPass").value,
    totpSecretBase32: document.getElementById("accSecret").value,
    instructions: document.getElementById("accInstr").value,
  };
  const out = await api(payload);
  if (!out.ok) return showErr(out.error);
  document.getElementById("accLabel").value="";
  document.getElementById("accEmail").value="";
  document.getElementById("accPass").value="";
  document.getElementById("accSecret").value="";
  document.getElementById("accInstr").value="";
  await loadAccounts();
}

async function createClients(){
  clearErr();
  const accountId = document.getElementById("accountSelect").value;
  const count = Number(document.getElementById("clientCount").value || 1);
  const maxAttempts = Number(document.getElementById("maxAttempts").value || 1);

  const out = await api({
    action:"adminCreateClients",
    adminToken: adminToken(),
    accountId,
    count,
    maxAttempts
  });
  if (!out.ok) return showErr(out.error);

  const base = location.origin + location.pathname.replace("merchant.html","client.html");
  const links = (out.created || []).map(x => {
    const url = `${base}?id=${encodeURIComponent(x.clientId)}`;
    return `<div class="card">
      <div class="small">Client link</div>
      <div style="word-break:break-all">${escapeHtml(url)}</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn secondary" onclick="copy('${escapeAttr(url)}')">Copy link</button>
      </div>
    </div>`;
  }).join("");
  setHtml("createdLinks", links || "");
}

function logout(){
  sessionStorage.removeItem("adminToken");
  location.reload();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

/* =========================
   Client Page
========================= */

async function clientInit(){
  const clientId = qs("id");
  if (!clientId) {
    setText("clientErr", "الرابط غير صحيح (مفقود id).");
    return;
  }
  const info = await api({ action:"clientGetInfo", clientId });
  if (!info.ok) {
    setText("clientErr", info.error || "خطأ");
    return;
  }

  document.getElementById("clientErr").style.display = "none";
  document.getElementById("clientCard").style.display = "block";

  setText("accLabel2", info.account.label || "حساب");
  setText("accEmail2", info.account.email || "");
  setText("accPass2", info.account.password || "");
  setText("attemptsLeft2", String(info.client.attemptsLeft));
  setText("maxAttempts2", String(info.client.maxAttempts));
  setText("instructions2", info.account.instructions || "");

  window.__CLIENT_ID__ = clientId;
}

async function revealCode(){
  const clientId = window.__CLIENT_ID__;
  const out = await api({ action:"clientRevealCode", clientId });
  if (!out.ok) {
    setText("clientErr", out.error || "خطأ");
    document.getElementById("clientErr").style.display = "block";
    return;
  }
  document.getElementById("clientErr").style.display = "none";
  setText("codeBox", out.code);
  setText("attemptsLeft2", String(out.attemptsLeft));
}
