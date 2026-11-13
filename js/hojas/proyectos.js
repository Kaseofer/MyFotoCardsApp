/* Hojas de fotos · proyectos y arranque
   Guardado automático en IndexedDB (base «hojas-fotos-a4»), lista de proyectos,
   copias de seguridad, nube y app instalable (fotos compartidas desde la galería). */

/* ---------- proyectos: guardado automático en este navegador (IndexedDB) ---------- */
function newId(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
let proj = null, lastSig = null, lastSavedAt = null, saveError = false, dbOk = true;
let persisted = new Set(); // ids de fotos que ya están guardadas en IndexedDB para el proyecto abierto
let dbp = null;
function db(){
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("hojas-fotos-a4", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", {keyPath:"id"});
      if (!d.objectStoreNames.contains("photos")){ const st = d.createObjectStore("photos", {keyPath:"id"}); st.createIndex("project", "projectId"); }
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const doneP = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

function record(){
  return {id:proj.id, name:proj.name, created:proj.created,
    settings:{...currentSettings(), pages:state.pages, orients:[...state.orients]},
    slots: state.slots.map(sl => sl ? {photoId:sl.id, fx:sl.fx, fy:sl.fy, zoom:sl.zoom, rot:sl.rot, date:sl.date, caption:sl.caption, autoCap:sl.autoCap, gps:sl.gps || null, place:sl.place ?? null, pos:sl.pos, name:sl.name, w:sl.w, h:sl.h, adj:sl.adj || null} : null)};
}
// Los guardados se encolan: nunca corren dos a la vez y "Guardar ahora" no se pierde
let saveChain = Promise.resolve();
function saveProject(force){
  saveChain = saveChain.then(() => doSave(force)).catch(() => {});
  return saveChain;
}
async function doSave(force){
  if (!proj || !dbOk) return;
  const p = proj, rec = record(), sig = JSON.stringify(rec);
  const pending = new Map();
  state.slots.forEach(sl => { if (sl && (!persisted.has(sl.id) || sl.dirty)) pending.set(sl.id, sl); });
  if (!force && sig === lastSig && !pending.size) return;
  clearTimeout(autoTimer); autoTimer = 0;
  setSaveState("saving");
  try {
    const d = await db();
    const t = d.transaction(["projects","photos"], "readwrite");
    const ps = t.objectStore("photos");
    t.objectStore("projects").put({...rec, updated:Date.now(), photoCount:state.slots.filter(Boolean).length});
    pending.forEach(sl => ps.put({id:sl.id, projectId:p.id, blob:sl.blob, thumb:sl.thumbBlob}));
    const keep = new Set(state.slots.filter(Boolean).map(sl => sl.id));
    const keys = await reqP(ps.index("project").getAllKeys(p.id));
    keys.forEach(k => { if (!keep.has(k)) ps.delete(k); });
    await doneP(t);
    if (proj === p){
      persisted = keep; pending.forEach(sl => sl.dirty = false);
      lastSig = sig; lastSavedAt = new Date(); saveError = false;
      remember(LS_LAST, p.id);
    }
  } catch(err){ saveError = true; }
  if (saveError) setSaveState("error");
  else if (isDirty()){ setSaveState("dirty"); noteChange(); } // hubo cambios mientras se guardaba
  else setSaveState("saved");
}
function hhmm(d){ return d.toLocaleTimeString("es", {hour:"2-digit", minute:"2-digit"}); }
/* símbolo de guardado: ✓ guardado · ● cambios sin guardar · ◌ guardando · ⚠ error */
const SAVE_ICONS = {
  saved: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  dirty: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.5" fill="currentColor"/></svg>',
  saving: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>'
};
let saveState = "";
function setSaveState(st){
  if (!dbOk) st = "error";
  const el = $("saveState");
  if (saveState !== st){ el.innerHTML = SAVE_ICONS[st]; el.dataset.state = st; saveState = st; }
  const label = st === "saved" ? (lastSavedAt ? `Todo guardado (${hhmm(lastSavedAt)})` : "Todo guardado")
    : st === "dirty" ? "Hay cambios sin guardar: se guardan solos en unos segundos"
    : st === "saving" ? "Guardando…"
    : !dbOk ? "Este navegador no permite guardar" : "No se pudo guardar";
  el.title = label; el.setAttribute("aria-label", label + ". Tocá para guardar ahora.");
  const info = $("saveInfo");
  info.hidden = st !== "error";
  if (st === "error") info.textContent = !dbOk
    ? "Este navegador no permite guardar (¿modo incógnito?). Descargá una copia desde Mis proyectos para no perder el trabajo."
    : "No se pudo guardar. Puede faltar espacio: descargá una copia desde Mis proyectos.";
}
function isDirty(){
  if (!proj) return false;
  if (JSON.stringify(record()) !== lastSig) return true;
  return state.slots.some(sl => sl && (!persisted.has(sl.id) || sl.dirty));
}
// Cada cambio avisa acá; si de verdad cambió algo se marca ● y se guarda solo a los pocos segundos
const SAVE_DELAY = 2500;
let checkTimer = 0, autoTimer = 0;
// Sin reiniciar la espera en cada cambio: si no, trabajando sin parar nunca se guardaría
function noteChange(){ if (!checkTimer) checkTimer = setTimeout(() => { checkTimer = 0; checkDirty(); }, 600); }
function checkDirty(){
  if (!proj) return; // todavía abriendo: no pisar la configuración recordada con la de fábrica
  rememberSettings();
  if (!dbOk || saveState === "saving") return;
  if (isDirty()){
    setSaveState("dirty");
    if (!autoTimer) autoTimer = setTimeout(() => { autoTimer = 0; saveProject(); }, SAVE_DELAY);
  } else if (!saveError) setSaveState("saved");
}

/* lo que se recuerda en este navegador: el último proyecto y la última configuración usada */
const LS_LAST = "mfc-ultimo-proyecto", LS_CONFIG = "mfc-configuracion";
function remember(k, v){ try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch(_){} }
function recall(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
function currentSettings(){
  return {paper:state.paper, orient:state.orient, layout:state.layout, shape:state.shape, capAuto:state.capAuto, style:state.style, bg:state.bg,
    margin:state.margin, gap:state.gap, cuts:state.cuts, captions:state.captions, capPos:state.capPos,
    groupId:state.groupId, albumId:state.albumId, groupLabel:state.groupLabel};
}
function rememberSettings(){ remember(LS_CONFIG, currentSettings()); }
function lastSettings(){ try { return JSON.parse(recall(LS_CONFIG) || "null") || {}; } catch(_){ return {}; } }
async function listProjects(){ const d = await db(); return (await reqP(d.transaction("projects").objectStore("projects").getAll())).sort((a,b) => b.updated - a.updated); }

function applySettings(st){
  Object.assign(state, {paper:st.paper||"a4", orient:st.orient||"v", layout:ALL_LAYOUTS.some(l => l.id === st.layout) ? st.layout : "12", shape:SHAPES.some(x => x.id === st.shape) ? st.shape : "auto", capAuto:st.capAuto||"year", style:st.style||"polaroid", bg:st.bg||"#ffffff", margin:st.margin ?? 5, gap:st.gap ?? 3,
    cuts:st.cuts ?? true, captions:st.captions ?? true, capPos:st.capPos||"br", pages:st.pages||1,
    groupId:st.groupId || null, albumId:st.albumId || null, groupLabel:st.groupLabel || ""});
  // proyectos anteriores no tienen orientación por hoja: todas como la general
  state.orients = Array.isArray(st.orients) && st.orients.length ? st.orients.map(o => o === "h" ? "h" : "v") : Array(state.pages).fill(state.orient);
  $("margin").value = state.margin; $("gap").value = state.gap;
  $("cuts").checked = state.cuts; $("captions").checked = state.captions;
}
async function newProject(){
  if (proj) await saveProject();
  let n = 1; try { n = (await listProjects()).length + 1; } catch(_){}
  releaseImages(); clearUndo();
  proj = {id:newId("p"), name:`Proyecto ${n}`, created:Date.now()}; persisted = new Set();
  state.slots = []; state.page = 0; state.sel = -1; state.moving = -1;
  applySettings({...lastSettings(), pages:1}); // arranca con la configuración que venías usando
  $("projName").value = proj.name; lastSig = null; lastSavedAt = null;
  buildUI(); draw(); await saveProject(true);
  remember(LS_LAST, proj.id);
}
async function openProject(id){
  if (proj && proj.id !== id) await saveProject();
  const d = await db();
  const t = d.transaction(["projects","photos"]);
  const rec = await reqP(t.objectStore("projects").get(id));
  const photos = await reqP(t.objectStore("photos").index("project").getAll(id));
  if (!rec) return;
  statusLock = true; $("status").textContent = "Abriendo proyecto…";
  const byId = new Map(photos.map(p => [p.id, p]));
  const slots = [], total = rec.slots.filter(Boolean).length;
  let done = 0;
  for (const s of rec.slots){
    const ph = s && byId.get(s.photoId);
    if (!ph){ slots.push(null); continue; }
    try {
      let thumb, thumbBlob = ph.thumb, w = s.w, h = s.h, dirty = false;
      if (thumbBlob && w && h) thumb = await createImageBitmap(thumbBlob);
      else {
        // proyecto guardado con una versión anterior: se arma la miniatura una vez y se guarda
        const full = await createImageBitmap(ph.blob);
        w = full.width; h = full.height;
        ({thumb, thumbBlob} = await makeThumb(full));
        full.close(); dirty = true;
      }
      const {photoId, ...rest} = s;
      // proyectos anteriores: el texto es automático si coincide con el año de la foto
      const autoCap = rest.autoCap ?? ((rest.caption || "") === (rest.date ? rest.date.slice(0,4) : ""));
      slots.push({gps:null, place:null, ...rest, autoCap, id:photoId, blob:ph.blob, thumb, thumbBlob, w, h, dirty});
    } catch(_){ slots.push(null); }
    if (++done % 10 === 0){ $("status").textContent = `Abriendo proyecto… ${done} de ${total}`; await new Promise(r => setTimeout(r, 0)); }
  }
  releaseImages(); clearUndo();
  persisted = new Set(photos.map(p => p.id));
  proj = {id:rec.id, name:rec.name, created:rec.created};
  applySettings(rec.settings || {});
  state.slots = slots; state.page = 0; state.sel = -1; state.moving = -1; fitPages();
  $("projName").value = proj.name;
  lastSig = JSON.stringify(record()); lastSavedAt = new Date(rec.updated);
  statusLock = false; buildUI(); draw(); setSaveState("saved"); checkDirty();
  remember(LS_LAST, proj.id);
  resolvePlaces();
}
async function deleteProject(id){
  const d = await db();
  const t = d.transaction(["projects","photos"], "readwrite");
  t.objectStore("projects").delete(id);
  const ps = t.objectStore("photos");
  (await reqP(ps.index("project").getAllKeys(id))).forEach(k => ps.delete(k));
  await doneP(t);
}

$("projName").addEventListener("input", e => { if (proj){ proj.name = e.target.value.trim() || "Sin nombre"; noteChange(); } });
$("projName").addEventListener("change", () => saveProject());
$("saveState").onclick = async () => {
  if (!dbOk){ say("Este navegador no permite guardar. Descargá una copia desde Mis proyectos.", 5000); return; }
  await saveProject(true);
  say(saveError ? "No se pudo guardar." : `Todo guardado a las ${hhmm(lastSavedAt)}.`);
};
setInterval(() => saveProject(), 30000); // respaldo por si algún cambio no avisó
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveProject(); });
window.addEventListener("pagehide", () => saveProject());

/* lista de proyectos */
async function renderProjectList(){
  const box = $("plist"); box.innerHTML = '<h3 class="ghead modehead">Hojas de fotos</h3>';
  let list = [];
  try { list = await listProjects(); } catch(_){}
  if (!list.length) box.insertAdjacentHTML("beforeend", '<div class="empty">Todavía no hay proyectos guardados.</div>');
  list.forEach(p => {
    const it = document.createElement("div");
    it.className = "pitem" + (proj && p.id === proj.id ? " cur" : "");
    const info = document.createElement("div"); info.className = "pinfo";
    const b = document.createElement("b"); b.textContent = p.name;
    const sm = document.createElement("small");
    const pages = p.settings?.pages || 1, k = p.photoCount ?? p.slots.filter(Boolean).length;
    sm.textContent = `${k} ${k === 1 ? "foto" : "fotos"} · ${pages} ${pages === 1 ? "hoja" : "hojas"} · ${new Date(p.updated).toLocaleString("es", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"})}`;
    info.append(b, sm);
    const open = document.createElement("button"); open.className = "open";
    open.textContent = proj && p.id === proj.id ? "Abierto" : "Abrir";
    open.onclick = async () => { closeProjects(); await openProject(p.id); };
    const del = document.createElement("button"); del.textContent = "Eliminar";
    del.onclick = async () => {
      if (!del.dataset.armed){ del.dataset.armed = "1"; del.textContent = "¿Seguro?"; setTimeout(() => { delete del.dataset.armed; del.textContent = "Eliminar"; }, 3000); return; }
      const wasCurrent = proj && p.id === proj.id;
      if (wasCurrent) proj = null; // así ningún guardado automático vuelve a crear el proyecto borrado
      await saveChain;
      await deleteProject(p.id);
      if (wasCurrent){ proj = null; const rest = await listProjects(); if (rest.length) await openProject(rest[0].id); else await newProject(); }
      renderProjectList();
    };
    const cv = document.createElement("canvas"); cv.className = "pthumb";
    MFC.thumb(cv, {mode:"hojas", thumbId:(p.slots || []).find(Boolean)?.photoId});
    it.append(cv, info, open, del);
    box.appendChild(it);
  });
  await MFC.renderOtherProjects(box, "cards");
}
async function openProjects(){ await saveProject(); $("projModal").classList.add("on"); renderProjectList(); }
function closeProjects(){ $("projModal").classList.remove("on"); }
$("projectsBtn").onclick = openProjects;
$("projClose").onclick = closeProjects;
$("projModal").addEventListener("click", e => { if (e.target.id === "projModal") closeProjects(); });
$("newProjBtn").onclick = async () => { closeProjects(); await newProject(); say("Proyecto nuevo creado."); };

/* copia de seguridad en archivo */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
$("exportProjBtn").onclick = async () => {
  if (!proj) return;
  const btn = $("exportProjBtn"), label = btn.textContent;
  btn.textContent = "Preparando copia…"; btn.disabled = true;
  try {
    const photos = [];
    for (const sl of state.slots) if (sl) photos.push({id:sl.id, data: await blobToDataURL(sl.blob)});
    const data = new Blob([JSON.stringify({format:"hojas-fotos-a4", version:1, project:{...record(), updated:Date.now()}, photos})], {type:"application/json"});
    const safe = (proj.name || "proyecto").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || "proyecto";
    if (downloads){
      try { await downloads.save({filename:`${safe}.json`, data}); say("Copia descargada."); }
      catch(err){ if (!(err && err.code === "declined")) say("No se pudo descargar la copia."); }
    } else if (!window.claude){ saveBlobLocal(data, `${safe}.json`); say("Copia descargada."); }
    else say("La descarga no está disponible en esta vista. Abrí la página desde su enlace.", 5000);
  } finally { btn.textContent = label; btn.disabled = false; }
};
const dataURLToBlob = u => MFC.dataURLToBlob(u); // está en common.js
$("exportAllBtn").onclick = async () => {
  await saveProject();
  const btn = $("exportAllBtn"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Preparando copia…";
  try {
    const blob = await MFC.exportAll(n => btn.textContent = `Preparando copia… ${n}`);
    MFC.saveBlobLocal(blob, `myfotocards-todo-${new Date().toISOString().slice(0,10)}.ndjson`); say("Copia de todo descargada.");
  } catch(_){ say("No se pudo preparar la copia.", 4000); }
  finally { btn.disabled = false; btn.textContent = label; }
};
$("importAllBtn").onclick = () => $("fileAll").click();
$("fileAll").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  await saveProject();
  try { const r = await MFC.importAll(f); say(`Listo: ${r.projects} proyectos restaurados.`); setTimeout(() => location.reload(), 900); }
  catch(_){ say("Ese archivo no es una copia de todo de MyFotoCards.", 4000); }
};
$("toCardsBtn").onclick = async () => {
  const slots = state.slots.filter(Boolean);
  if (!slots.length){ say("Agregá al menos una foto."); return; }
  await saveProject();
  say("Pasando las fotos a Luli's Photocards…", 60000);
  const files = slots.map((sl, i) => new File([sl.blob], sl.name || `foto-${i+1}.jpg`, {type:sl.blob.type || "image/jpeg"}));
  try { await MFC.handoff("cards", files, {name:proj.name, groupId:state.groupId, albumId:state.albumId}); }
  catch(_){ say("No se pudieron pasar las fotos.", 4000); }
};
$("importProjBtn").onclick = () => $("fileBackup").click();
$("fileBackup").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.format !== "hojas-fotos-a4" || !j.project) throw 0;
    await saveProject();
    const idMap = new Map(), pid = newId("p"), prepared = [];
    const used = new Set((j.project.slots || []).filter(Boolean).map(s => s.photoId));
    for (const ph of j.photos || []){
      if (!used.has(ph.id) || idMap.has(ph.id)) continue; // no guarda fotos que ninguna hoja usa
      const nid = newId("f"); idMap.set(ph.id, nid);
      prepared.push({id:nid, projectId:pid, blob:dataURLToBlob(ph.data)});
    }
    const d = await db();
    const t = d.transaction(["projects","photos"], "readwrite");
    prepared.forEach(ph => t.objectStore("photos").put(ph));
    const slots = (j.project.slots || []).map(s => s && idMap.has(s.photoId) ? {...s, photoId:idMap.get(s.photoId)} : null);
    t.objectStore("projects").put({...j.project, id:pid, name:j.project.name || "Proyecto importado", slots, updated:Date.now(), photoCount:slots.filter(Boolean).length});
    await doneP(t);
    closeProjects(); await openProject(pid); say("Copia abierta como proyecto.");
  } catch(_){ say("Ese archivo no es una copia válida de este proyecto.", 4000); }
};

window.addEventListener("resize", draw);
buildUI(); draw(); setSaveState("saving"); // mientras abre el último proyecto
(async () => {
  const q = new URLSearchParams(location.search);
  // fotos compartidas desde la galería: van a la última modalidad que se usó
  if (q.has("compartidas") && !q.has("nuevo") && MFC.recall("mfc-modo") === "cards"){
    location.replace("./" + location.search); return;
  }
  MFC.initModeNav("hojas", () => saveProject());
  try { await navigator.storage?.persist?.(); } catch(_){}
  const wantId = q.get("p");
  const shared = await MFC.takeShared();
  if (wantId) history.replaceState(null, "", location.pathname);
  try {
    const list = await listProjects(), last = recall(LS_LAST);
    const pick = list.find(p => p.id === wantId) || list.find(p => p.id === last) || list[0]; // el último con el que se trabajó
    if (shared && shared.name){
      await newProject();
      proj.name = shared.name; $("projName").value = proj.name;
      if (shared.groupId){
        state.groupId = shared.groupId; state.albumId = shared.albumId || null;
        state.groupLabel = await MFC.groupLabel(state.groupId, state.albumId);
        if (state.groupLabel) state.capAuto = "group";
      }
      buildUI(); draw();
    } else if (pick) await openProject(pick.id); else await newProject();
  } catch(_){
    dbOk = false; proj = {id:newId("p"), name:"Proyecto 1", created:Date.now()};
    applySettings({...lastSettings(), pages:1}); buildUI(); draw();
    $("projName").value = proj.name; setSaveState("error");
  }
  if (shared){
    if (shared.files.length) await addFiles(shared.files);
    else say("No llegaron fotos. Probá compartirlas de nuevo.", 4000);
  }
  // la nube: guarda los proyectos en la cuenta y trae los cambios de otros dispositivos
  MFC.cloud.init({mount: $("cloudMount"), flush: () => saveProject(), onRemoteChange: async ({changed, removed}) => {
    if (proj && removed.includes(proj.id)){
      proj = null; const list = await listProjects();
      if (list.length) await openProject(list[0].id); else await newProject();
    } else if (proj && changed.includes(proj.id) && JSON.stringify(record()) === lastSig) await openProject(proj.id);
    if ($("projModal").classList.contains("on")) renderProjectList();
  }});
})();

/* ---------- app instalable: funciona sin conexión y recibe fotos compartidas ---------- */
const swAllowed = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
if ("serviceWorker" in navigator && swAllowed){
  try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch(_){}
}
try { document.fonts.load("500 40px Caveat").then(draw).catch(() => {}); } catch(_){}
