/* ---------------- STATE (in-memory only) ---------------- */
let reportSeq = 1004;
const LEVEL_INFO = {
  1:{label:"Low", color:"lvl1", action:"Logged for monitoring — no urgent routing.", sla:"Periodic monitoring"},
  2:{label:"Moderate", color:"lvl2", action:"Routed to Manager for scheduled field validation.", sla:"5–7 business days"},
  3:{label:"High", color:"lvl3", action:"Priority routing to CENRO — expedited TCP track.", sla:"2–3 business days"},
  4:{label:"Severe / Emergency", color:"lvl4", action:"Flagged for Special Tree Cutting Permit (STCP) — LGU/Barangay disaster office auto-notified.", sla:"Immediate / same-day"}
};
const PERMIT_TABLE = {
  "Branch/Limb Trimming":"Simplified pruning clearance (subject to DAO 2021-11 thresholds)",
  "Trunk-Level Cutting":"TCP — standard processing",
  "Full Tree Removal":"TCP (standard), or STCP if imminent hazard present",
  "Emergency Removal":"STCP — expedited; may allow removal ahead of full paperwork"
};

let reports = [
  {id:"KB-1001", species:"Acacia", desc:"Large cavity at base, tree leans slightly over the school gate path.",
   context:"School Zone", symptoms:["cavities","sig_lean"], baseLevel:3, level:4, coords:"8.3667° N, 124.8667° E",
   status:"Field Validation", scope:null, submittedBy:"M. Otero", ts:"Jul 27"},
  {id:"KB-1002", species:"Mahogany", desc:"Small dead branches near the top, otherwise looks healthy.",
   context:"Park", symptoms:["dead_branches"], baseLevel:1, level:1, coords:"8.3701° N, 124.8592° E",
   status:"Pending Review", scope:null, submittedBy:"R. Lumantao", ts:"Jul 28"},
  {id:"KB-1003", species:"Narra", desc:"Root heaving has cracked the sidewalk tiles, heavy foot traffic on this path.",
   context:"Sidewalk/Pathway", symptoms:["root_heaving"], baseLevel:3, level:3, coords:"8.3654° N, 124.8629° E",
   status:"Permit Routed", scope:"Trunk-Level Cutting", submittedBy:"J. Amora", ts:"Jul 29"},
];

const DEFAULT_ACCOUNTS = [
  {name:"Alliah", role:"Admin", email:"alliah@cenro-mf.gov.ph", password:"kubli123", status:"Active"},
  {name:"Shane", role:"Manager", email:"shane@cenro-mf.gov.ph", password:"kubli123", status:"Active"},
  {name:"Rechelle", role:"User", email:"rechelle@gmail.com", password:"kubli123", status:"Active"},
  {name:"Jane", role:"User", email:"jane@gmail.com", password:"kubli123", status:"Pending"},
];
let accounts = loadAccounts();
function loadAccounts(){
  try{
    const raw = localStorage.getItem("kubli-accounts");
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length) return parsed;
    }
  }catch(e){}
  return DEFAULT_ACCOUNTS.map(a=>({...a}));
}
function saveAccounts(){
  localStorage.setItem("kubli-accounts", JSON.stringify(accounts));
}

/* ---------------- AUTH ---------------- */
let currentUser = null;
let authMode = "signin";
const ROLE_TABS = {
  User: ['dashboard','user'],
  Manager: ['dashboard','manager'],
  Admin: ['dashboard','user','manager','admin']
};

function setAuthMode(mode){
  authMode = mode;
  const signup = mode === "signup";
  document.getElementById("tab-signin").classList.toggle("active", !signup);
  document.getElementById("tab-signup").classList.toggle("active", signup);
  document.getElementById("signup-only").hidden = !signup;
  document.getElementById("signup-pass2").hidden = !signup;
  document.getElementById("signin-role").hidden = signup;
  document.getElementById("li-submit").textContent = signup ? "Create account" : "Sign in";
  document.getElementById("switch-auth").textContent = signup
    ? "Already have an account? Sign in"
    : "Don't have an account yet? Create one";
  document.getElementById("auth-sub").textContent = signup
    ? "Create a citizen account to report hazardous trees with your camera and GPS."
    : "Sign in if you already have an account. If not, create one first.";
  document.getElementById("li-error").textContent = "";
  document.getElementById("li-password").autocomplete = signup ? "new-password" : "current-password";
}

document.getElementById("tab-signin").addEventListener("click", ()=>setAuthMode("signin"));
document.getElementById("tab-signup").addEventListener("click", ()=>setAuthMode("signup"));
document.getElementById("switch-auth").addEventListener("click", ()=>setAuthMode(authMode==="signin"?"signup":"signin"));

document.querySelectorAll('.role-pick-btn').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.role-pick-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
});

function enterApp(user){
  currentUser = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  document.getElementById('hdr-name').textContent = currentUser.name;
  document.getElementById('hdr-role').textContent = currentUser.role;

  document.querySelectorAll('nav.roles button').forEach(btn=>{
    btn.style.display = ROLE_TABS[currentUser.role].includes(btn.dataset.role) ? '' : 'none';
    btn.classList.toggle('active', btn.dataset.role === 'dashboard');
  });
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-dashboard').classList.add('active');

  renderDashboard(); renderUserReports(); renderManager(); renderAdmin();
}

document.getElementById('li-submit').addEventListener('click', ()=>{
  const name = document.getElementById('li-name').value.trim();
  const email = document.getElementById('li-email').value.trim();
  const pass = document.getElementById('li-password').value;
  const pass2 = document.getElementById('li-password2').value;
  const errEl = document.getElementById('li-error');
  const pickedRole = document.querySelector('.role-pick-btn.active').dataset.role;

  if(!email || !pass){ errEl.textContent = "Enter email and password."; return; }

  if(authMode === "signup"){
    if(!name){ errEl.textContent = "Enter your full name."; return; }
    if(pass.length < 6){ errEl.textContent = "Password must be at least 6 characters."; return; }
    if(pass !== pass2){ errEl.textContent = "Passwords do not match."; return; }
    if(accounts.some(a=>a.email.toLowerCase()===email.toLowerCase())){
      errEl.textContent = "That email already has an account. Sign in instead.";
      setAuthMode("signin");
      return;
    }
    const neu = {name, email, password:pass, role:"User", status:"Active"};
    accounts.push(neu);
    saveAccounts();
    enterApp({name, email, role:"User"});
    return;
  }

  const existing = accounts.find(a=>a.email.toLowerCase()===email.toLowerCase());
  if(!existing){
    errEl.textContent = "No account yet for this email. Create one first.";
    setAuthMode("signup");
    return;
  }
  if(existing.password && existing.password !== pass){
    errEl.textContent = "Wrong password.";
    return;
  }
  if(existing.status === 'Pending'){
    errEl.textContent = "This account is still pending admin approval.";
    return;
  }
  enterApp({ name: existing.name, email: existing.email, role: existing.role || pickedRole });
});

document.getElementById('logout-btn').addEventListener('click', ()=>{
  currentUser = null;
  stopCamera();
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('li-name').value = '';
  document.getElementById('li-email').value = '';
  document.getElementById('li-password').value = '';
  document.getElementById('li-password2').value = '';
  document.getElementById('li-error').textContent = '';
  setAuthMode("signin");
});

/* ---------------- ROLE SWITCHING (tab nav, post-login) ---------------- */
document.querySelectorAll('nav.roles button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.roles button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+btn.dataset.role).classList.add('active');
    if(btn.dataset.role==='manager') renderManager();
    if(btn.dataset.role==='admin') renderAdmin();
    if(btn.dataset.role==='user'){ renderUserReports(); startCamera(); }
    if(btn.dataset.role==='dashboard') renderDashboard();
    if(btn.dataset.role!=='user') stopCamera();
  });
});

/* ---------------- CLASSIFICATION ENGINE ---------------- */
function classify(symptoms, context){
  let base = 1;
  symptoms.forEach(s=>{
    const box = document.querySelector(`.check-row input[value="${s}"]`);
    const lvl = parseInt(box?.dataset.lvl || 1);
    if(lvl > base) base = lvl;
  });
  let level = base;

  // Sidewalk / pathway consequence multiplier (Section 3.6)
  if(context === "Sidewalk/Pathway" && (symptoms.includes("root_heaving") || symptoms.includes("cavities"))){
    level = Math.max(level, 3);
  } else if(context === "Sidewalk/Pathway" && level < 2 && symptoms.length){
    level = Math.max(level, 2); // elevated foot-traffic consequence score
  }

  // School / Hospital auto-flag: +1 tier regardless of score (Section 3.4)
  if(context === "School Zone" || context === "Hospital Zone"){
    level = Math.min(level + 1, 4);
  }
  return {base, level};
}

function updatePreview(){
  const checked = [...document.querySelectorAll('.check-row input:checked')].map(i=>i.value);
  const context = document.getElementById('u-context').value;
  const out = document.getElementById('p-level');
  if(!checked.length){
    out.innerHTML = "— select at least one condition —";
    return;
  }
  const {base, level} = classify(checked, context);
  const info = LEVEL_INFO[level];
  let flagNote = "";
  if(level > base) flagNote = ` <span style="color:var(--ink-soft);">(raised from L${base} — ${context})</span>`;
  out.innerHTML = `<span class="lvl-tag ${info.color}">L${level}</span>${info.label}${flagNote}`;
}
document.querySelectorAll('.check-row input, #u-context').forEach(el=>el.addEventListener('change', updatePreview));

/* ---------------- CAMERA ---------------- */
let camStream = null;
let capturedPhoto = null;

function setCamStatus(msg){
  const el = document.getElementById("cam-status");
  if(el) el.textContent = msg;
}

async function startCamera(){
  const video = document.getElementById("cam-video");
  const preview = document.getElementById("cam-preview");
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    setCamStatus("Camera not supported — use Upload");
    return;
  }
  try{
    camStream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } },
      audio:false
    });
    video.srcObject = camStream;
    video.hidden = false;
    preview.hidden = true;
    capturedPhoto = null;
    document.getElementById("cam-snap").disabled = false;
    document.getElementById("cam-retake").disabled = true;
    setCamStatus("LIVE · line up the tree");
  }catch(err){
    setCamStatus("Camera blocked — use Upload instead");
  }
}

function stopCamera(){
  if(camStream){
    camStream.getTracks().forEach(t=>t.stop());
    camStream = null;
  }
  const video = document.getElementById("cam-video");
  if(video) video.srcObject = null;
}

function snapPhoto(){
  const video = document.getElementById("cam-video");
  const canvas = document.getElementById("cam-canvas");
  const preview = document.getElementById("cam-preview");
  if(!video || !video.videoWidth){ setCamStatus("Wait for camera…"); return; }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  capturedPhoto = canvas.toDataURL("image/jpeg", 0.82);
  preview.src = capturedPhoto;
  preview.hidden = false;
  video.hidden = true;
  document.getElementById("cam-retake").disabled = false;
  setCamStatus("CAPTURED · retake if blurry");
}

function retakePhoto(){
  capturedPhoto = null;
  document.getElementById("cam-preview").hidden = true;
  document.getElementById("cam-video").hidden = false;
  document.getElementById("cam-retake").disabled = true;
  if(!camStream) startCamera();
  else setCamStatus("LIVE · line up the tree");
}

document.getElementById("cam-start").addEventListener("click", startCamera);
document.getElementById("cam-snap").addEventListener("click", snapPhoto);
document.getElementById("cam-retake").addEventListener("click", retakePhoto);
document.getElementById("cam-file").addEventListener("change", e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    capturedPhoto = reader.result;
    const preview = document.getElementById("cam-preview");
    const video = document.getElementById("cam-video");
    preview.src = capturedPhoto;
    preview.hidden = false;
    video.hidden = true;
    document.getElementById("cam-retake").disabled = false;
    setCamStatus("UPLOADED from device");
  };
  reader.readAsDataURL(file);
});

/* ---------------- GEOLOCATION ---------------- */
document.getElementById('u-locate').addEventListener('click', ()=>{
  const out = document.getElementById('u-coords');
  if(!navigator.geolocation){ out.textContent = "Geolocation not supported by this browser."; return; }
  out.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(
    pos=>{ out.textContent = `${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E — captured.`; },
    err=>{ out.textContent = "Location unavailable (permission denied) — using placeholder pin for this demo: 8.3667° N, 124.8667° E"; }
  );
});

/* ---------------- SUBMIT REPORT ---------------- */
document.getElementById('u-submit').addEventListener('click', ()=>{
  const checked = [...document.querySelectorAll('.check-row input:checked')].map(i=>i.value);
  const context = document.getElementById('u-context').value;
  const desc = document.getElementById('u-desc').value.trim();
  const species = document.getElementById('u-species').value.trim() || "Unidentified species";
  const coordsText = document.getElementById('u-coords').textContent;

  if(!checked.length){ alert("Select at least one observed condition so KUBLI can classify the risk."); return; }
  if(!desc){ alert("Add a short description of what you observed."); return; }
  if(!capturedPhoto){ alert("Take or upload a photo of the tree first."); return; }

  const {base, level} = classify(checked, context);
  reportSeq++;
  reports.unshift({
    id:"KB-"+reportSeq, species, desc, context, symptoms:checked, baseLevel:base, level,
    coords: coordsText.includes("captured") || coordsText.includes("placeholder") ? coordsText.split(" — ")[0] : "Not captured",
    photo: capturedPhoto,
    status:"Pending Review", scope:null, submittedBy: currentUser ? currentUser.name : "You", ts:"Just now"
  });

  document.getElementById('u-desc').value = "";
  document.getElementById('u-species').value = "";
  capturedPhoto = null;
  document.getElementById("cam-preview").hidden = true;
  document.getElementById("cam-preview").removeAttribute("src");
  document.getElementById("cam-video").hidden = false;
  document.getElementById("cam-file").value = "";
  setCamStatus(camStream ? "LIVE · line up the tree" : "Camera off");
  document.querySelectorAll('.check-row input').forEach(i=>i.checked=false);
  document.getElementById('u-coords').textContent = "No coordinates captured yet.";
  updatePreview();
  renderUserReports();
  renderDashboard();
  alert(`Report ${("KB-"+reportSeq)} submitted — classified as Level ${level} (${LEVEL_INFO[level].label}).`);
});
document.getElementById('u-clear').addEventListener('click', ()=>{
  document.getElementById('u-desc').value = "";
  document.getElementById('u-species').value = "";
  capturedPhoto = null;
  document.getElementById("cam-preview").hidden = true;
  document.getElementById("cam-preview").removeAttribute("src");
  document.getElementById("cam-video").hidden = false;
  document.getElementById("cam-file").value = "";
  setCamStatus(camStream ? "LIVE · line up the tree" : "Camera off");
  document.querySelectorAll('.check-row input').forEach(i=>i.checked=false);
  document.getElementById('u-coords').textContent = "No coordinates captured yet.";
  updatePreview();
});

/* ---------------- RENDER: DASHBOARD ---------------- */
const LEVEL_COLOR = {1:"var(--canopy)",2:"var(--amber)",3:"var(--rust)",4:"var(--hazard)"};

function renderDashboard(){
  const total = reports.length;
  const counts = {1:0,2:0,3:0,4:0};
  reports.forEach(r=>counts[r.level]++);
  const highSevere = counts[3]+counts[4];
  const resolved = reports.filter(r=>r.status==="Resolved").length;
  const awaitingPermit = reports.filter(r=>r.status!=="Resolved" && !r.scope).length;

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-box"><div class="num" style="color:var(--forest-deep);">${total}</div><div class="lbl">Total reports</div></div>
    <div class="stat-box"><div class="num" style="color:var(--hazard);">${highSevere}</div><div class="lbl">High + Severe (L3–L4)</div></div>
    <div class="stat-box"><div class="num" style="color:var(--amber);">${awaitingPermit}</div><div class="lbl">Awaiting permit scope</div></div>
    <div class="stat-box"><div class="num" style="color:var(--canopy);">${resolved}</div><div class="lbl">Resolved</div></div>
  `;

  // --- donut chart (risk distribution) ---
  const donut = document.getElementById('dash-donut');
  const r = 52, c = 2*Math.PI*r;
  let offset = 0;
  let segments = "";
  [4,3,2,1].forEach(lvl=>{
    const frac = total ? counts[lvl]/total : 0;
    const len = frac * c;
    segments += `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${LEVEL_COLOR[lvl]}" stroke-width="18"
      stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
    offset += len;
  });
  const svg = total ? `
    <svg width="140" height="140" viewBox="0 0 140 140">
      ${segments}
      <circle cx="70" cy="70" r="${r-9}" fill="#FBF8EF"/>
      <text x="70" y="66" text-anchor="middle" font-family="Fraunces, serif" font-size="22" font-weight="600" fill="var(--forest-deep)">${total}</text>
      <text x="70" y="82" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" fill="var(--ink-soft)">REPORTS</text>
    </svg>` : `<svg width="140" height="140" viewBox="0 0 140 140"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--parchment-dark)" stroke-width="18"/></svg>`;

  const legend = [4,3,2,1].map(lvl=>`
    <div class="legend-item">
      <span class="legend-swatch" style="background:${LEVEL_COLOR[lvl]};"></span>
      L${lvl} — ${LEVEL_INFO[lvl].label} <b>${counts[lvl]}</b>
    </div>`).join("");

  donut.innerHTML = `${svg}<div class="donut-legend">${legend}</div>`;

  // --- status breakdown bars ---
  const statuses = ["Pending Review","Field Validation","Permit Routed","Resolved"];
  const statusCounts = statuses.map(s=>reports.filter(r=>r.status===s).length);
  const maxStatus = Math.max(1, ...statusCounts);
  document.getElementById('dash-status-bars').innerHTML = statuses.map((s,i)=>`
    <div class="bar-row">
      <div class="bar-label"><span>${s}</span><b>${statusCounts[i]}</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(statusCounts[i]/maxStatus*100)}%;background:var(--canopy);"></div></div>
    </div>`).join("");

  // --- location context bars ---
  const contexts = [...new Set(reports.map(r=>r.context))];
  const ctxCounts = contexts.map(c=>reports.filter(r=>r.context===c).length);
  const maxCtx = Math.max(1, ...ctxCounts);
  document.getElementById('dash-context-bars').innerHTML = contexts.length ? contexts.map((c,i)=>`
    <div class="bar-row">
      <div class="bar-label"><span>${c}</span><b>${ctxCounts[i]}</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(ctxCounts[i]/maxCtx*100)}%;background:var(--bark);"></div></div>
    </div>`).join("") : `<div class="empty">No reports yet.</div>`;

  // --- recent activity ---
  const recent = [...reports].slice(0,3);
  document.getElementById('dash-recent').innerHTML = recent.length
    ? recent.map(r=>tagCard(r,false)).join("")
    : `<div class="empty">No activity yet.</div>`;
}

/* ---------------- RENDER: USER REPORTS ---------------- */
function renderUserReports(){
  const wrap = document.getElementById('u-reports-list');
  const mine = reports.filter(r=>currentUser && r.submittedBy===currentUser.name);
  if(!mine.length){
    wrap.innerHTML = `<div class="empty">You haven't submitted a report yet. Fill out the form to see it tracked here.</div>`;
    return;
  }
  wrap.innerHTML = mine.map(r=>tagCard(r, false)).join("");
}

function tagCard(r, showManagerNote){
  const info = LEVEL_INFO[r.level];
  return `
  <div class="field-tag">
    <div class="punch"></div>
    <div class="body">
      <div class="top-row">
        <span class="id mono">${r.id} · ${r.ts}</span>
        <span class="stamp ${info.color}">RISK L${r.level}</span>
      </div>
      <h4>${r.species}</h4>
      ${r.photo ? `<img class="report-photo" src="${r.photo}" alt="Evidence photo for ${r.id}">` : ""}
      <div class="meta">📍 ${r.coords} &nbsp;·&nbsp; ${r.context}</div>
      <div class="desc">${r.desc}</div>
      <span class="status-pill">${r.status}</span>
      ${r.scope ? `<span class="status-pill" style="margin-left:6px;">${r.scope}</span>` : ""}
      <div class="action-note">${info.action}<br><span class="mono" style="font-size:0.7rem;">SLA: ${info.sla}</span></div>
    </div>
  </div>`;
}

/* ---------------- RENDER: MANAGER ---------------- */
function renderManager(){
  const stats = document.getElementById('mgr-stats');
  const counts = {1:0,2:0,3:0,4:0};
  reports.forEach(r=>counts[r.level]++);
  stats.innerHTML = [4,3,2,1].map(l=>`
    <div class="stat-box">
      <div class="num" style="color:var(--${l===4?'hazard':l===3?'rust':l===2?'amber':'canopy'});">${counts[l]}</div>
      <div class="lbl">Level ${l} — ${LEVEL_INFO[l].label}</div>
    </div>`).join("");

  document.getElementById('f-level').onchange = renderManagerList;
  document.getElementById('f-status').onchange = renderManagerList;
  renderManagerList();
}

function renderManagerList(){
  const fLevel = document.getElementById('f-level').value;
  const fStatus = document.getElementById('f-status').value;
  let list = [...reports].sort((a,b)=>b.level-a.level);
  if(fLevel!=='all') list = list.filter(r=>String(r.level)===fLevel);
  if(fStatus!=='all') list = list.filter(r=>r.status===fStatus);

  const container = document.getElementById('mgr-list');
  if(!list.length){
    container.innerHTML = `<div class="empty">No reports match this filter.</div>`;
    return;
  }
  container.innerHTML = list.map(r=>{
    const info = LEVEL_INFO[r.level];
    const isFast = r.context === "School Zone" || r.context === "Hospital Zone";
    return `
    <div class="mgr-card">
      <div class="mgr-top">
        <div>
          <h4>${r.species} <span class="stamp ${info.color}" style="font-size:0.6rem;">L${r.level}</span></h4>
          <div class="meta mono" style="font-size:0.74rem;color:var(--ink-soft);">${r.id} · 📍 ${r.coords} · ${r.context}${isFast ? " · ⚡ fast-track (24–48hr)" : ""}</div>
        </div>
        <span class="status-pill">${r.status}</span>
      </div>
      <div class="desc" style="margin-top:8px;font-size:0.85rem;">${r.desc}</div>
      <div class="action-note">${info.action}</div>

      <div class="mgr-grid">
        <div class="mgr-field">
          <label>Status</label>
          <select data-id="${r.id}" class="mgr-status">
            ${["Pending Review","Field Validation","Permit Routed","Resolved"].map(s=>`<option ${s===r.status?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="mgr-field">
          <label>Permit scope classification</label>
          <select data-id="${r.id}" class="mgr-scope">
            <option value="">— not yet classified —</option>
            ${Object.keys(PERMIT_TABLE).map(s=>`<option value="${s}" ${r.scope===s?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      ${r.scope ? `<div class="hint" style="margin-top:8px;"><b>Permit track:</b> ${PERMIT_TABLE[r.scope]}</div>` : ""}
    </div>`;
  }).join("");

  container.querySelectorAll('.mgr-status').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const r = reports.find(r=>r.id===e.target.dataset.id);
      r.status = e.target.value;
      renderManagerList();
      renderDashboard();
    });
  });
  container.querySelectorAll('.mgr-scope').forEach(sel=>{
    sel.addEventListener('change', e=>{
      const r = reports.find(r=>r.id===e.target.dataset.id);
      r.scope = e.target.value || null;
      renderManagerList();
      renderDashboard();
    });
  });
}

/* ---------------- RENDER: ADMIN ---------------- */
function renderAdmin(){
  const tbody = document.getElementById('a-table');
  tbody.innerHTML = accounts.map((a,i)=>`
    <tr>
      <td><b>${a.name}</b><br><span class="hint">${a.email}</span></td>
      <td><span class="role-badge">${a.role}</span></td>
      <td><span class="${a.status==='Active'?'status-active':'status-pending'}">${a.status}</span></td>
      <td>
        ${a.status==='Pending' ? `<button class="btn btn-sm" data-approve="${i}">Approve</button>` : ""}
        <button class="btn btn-outline btn-sm" data-remove="${i}">Remove</button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click', e=>{
    accounts[e.target.dataset.approve].status = 'Active';
    renderAdmin();
  }));
  tbody.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click', e=>{
    accounts.splice(e.target.dataset.remove,1);
    saveAccounts();
    renderAdmin();
  }));
}

document.getElementById('a-add').addEventListener('click', ()=>{
  const name = document.getElementById('a-name').value.trim();
  const email = document.getElementById('a-email').value.trim();
  const role = document.getElementById('a-role').value;
  if(!name || !email){ alert("Enter a name and email address."); return; }
  accounts.push({name, email, role, password:"kubli123", status:"Pending"});
  document.getElementById('a-name').value = "";
  document.getElementById('a-email').value = "";
  renderAdmin();
});

/* ---------------- INIT ---------------- */
renderDashboard();
renderUserReports();
renderManager();
renderAdmin();