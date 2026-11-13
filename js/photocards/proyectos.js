/* Luli's Photocards · guardado de colecciones
   Guardado automático en IndexedDB (base «photocards-a4»: projects y photos), el Deshacer
   general (tick() mira cada 400 ms si algo cambió y apila el estado anterior), abrir,
   duplicar, eliminar y recuperar colecciones, y la lista de «Mis tarjetas».
   En Safari las fotos se guardan como bytes (MFC.packRec); si al abrir faltan, se bajan de la nube. */

/* ---------- proyectos (IndexedDB, solo en este navegador) ---------- */
let proj = null, lastSig = null, saving = false, lastSavedAt = null, saveError = false, dbOk = true, opening = false;
const LS_LAST = "lpc-ultimo-proyecto", LS_CONFIG = "lpc-configuracion";
function db(){ return MFC.openDb("cards"); }
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const doneP = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const SETTINGS = ["paper","size","shared","bleed","marks","withBacks","rotBack","backMode","backColor","backTextColor","backText","backText2","backNumber","pattern","patternColor","patternAlpha","frame","plate","font","logoSize","logo2Size","logoPos","logo2Pos","textPos","logoTint","logoTintColor","logo2Tint","logo2TintColor","logoStroke","logoStrokeColor","logoStrokeW","logo2Stroke","logo2StrokeColor","logo2StrokeW"];
function record(){
  const settings = {}; SETTINGS.forEach(k => settings[k] = state[k]);
  return {id:proj.id, name:proj.name, created:proj.created, groupId:proj.groupId || null, albumId:proj.albumId || null, cover:proj.cover || null, settings, commonBack:state.commonBack, logo:state.logo, logo2:state.logo2, cards:state.cards};
}
function usedPhotoIds(){
  const s = new Set();
  if (state.commonBack) s.add(state.commonBack.photoId);
  if (state.logo) s.add(state.logo.photoId);
  if (state.logo2) s.add(state.logo2.photoId);
  state.cards.forEach(c => { if (c.front) s.add(c.front.photoId); if (c.back) s.add(c.back.photoId); });
  return s;
}
// Los guardados se encolan: nunca corren dos a la vez y "Guardar ahora" no se pierde
let saveChain = Promise.resolve();
function saveProject(force){
  saveChain = saveChain.then(() => doSave(force)).catch(() => {});
  return saveChain;
}
async function doSave(force){
  if (!proj || !dbOk || opening) return;
  const p = proj, rec = record(), sig = JSON.stringify(rec), used = usedPhotoIds();
  const pending = [...used].filter(id => photos.has(id) && !photos.get(id).saved);
  if (!force && sig === lastSig && !pending.length) return;
  clearTimeout(autoTimer); autoTimer = 0;
  saving = true; setSaveState("saving");
  try {
    const packed = await Promise.all(pending.map(id => MFC.packRec({id, projectId:p.id, blob:photos.get(id).blob})));
    const d = await db(), t = d.transaction(["projects","photos"], "readwrite"), ps = t.objectStore("photos");
    t.objectStore("projects").put({...rec, updated:Date.now(), cardCount:rec.cards.length});
    packed.forEach(r => ps.put(r));
    const keys = await reqP(ps.index("project").getAllKeys(p.id));
    const gone = keys.filter(k => !used.has(k));
    gone.forEach(k => ps.delete(k));
    await doneP(t);
    pending.forEach(id => photos.get(id).saved = true);
    // las fotos que se dejaron de usar siguen en memoria por si se deshace el cambio
    gone.forEach(k => { if (photos.has(k)) photos.get(k).saved = false; });
    if (proj === p){ lastSig = sig; lastSavedAt = new Date(); saveError = false; MFC.remember(LS_LAST, p.id); }
  } catch(_){ saveError = true; }
  saving = false;
  if (saveError) setSaveState("error"); else tick();
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
  const short = st === "saved" ? "Guardado en este dispositivo" : st === "dirty" ? "Guardando pronto…" : st === "saving" ? "Guardando…" : !dbOk ? "No se puede guardar aquí" : "No se pudo guardar. Reintentar";
  if (saveState !== st){ el.innerHTML = SAVE_ICONS[st] + `<span>${short}</span>`; el.dataset.state = st; saveState = st; }
  const label = st === "saved" ? (lastSavedAt ? `Todo guardado (${hhmm(lastSavedAt)})` : "Todo guardado")
    : st === "dirty" ? "Hay cambios sin guardar: se guardan solos en unos segundos"
    : st === "saving" ? "Guardando…"
    : !dbOk ? "Este navegador no permite guardar" : "No se pudo guardar";
  el.title = label; el.setAttribute("aria-label", label + ". Tocá para guardar ahora.");
  const info = $("saveInfo");
  info.hidden = st !== "error";
  if (st === "error") info.textContent = !dbOk
    ? "Este navegador no permite guardar (¿modo incógnito?). Descargá una copia desde Mis tarjetas."
    : "No se pudo guardar. Puede faltar espacio: descargá una copia desde Mis tarjetas.";
}
function showSaveInfo(){ setSaveState(saveError || !dbOk ? "error" : "saved"); tick(); }

/* Cada pocos décimos de segundo se mira si algo cambió:
   - para el guardado automático (como mucho 2,5 s después del primer cambio, aunque se siga trabajando)
   - para el deshacer general (un paso por cada cambio, cuando se deja de mover el control) */
const SAVE_DELAY = 2500, UNDO_MAX = 40;
let autoTimer = 0, seenSig = null, changedAt = 0, undoBase = null, undoStack = [];
function tick(){
  if (state.tab === "back") backButtons();
  if (!proj || opening) return;
  const sig = JSON.stringify(record()), now = Date.now();
  if (sig !== seenSig){ seenSig = sig; changedAt = now; rememberSettings(); }
  if (undoBase === null) undoBase = sig;
  else if (sig !== undoBase && now - changedAt > 700){ undoStack.push(undoBase); if (undoStack.length > UNDO_MAX) undoStack.shift(); undoBase = sig; }
  $("undoAll").disabled = !undoStack.length && sig === undoBase;
  if (!dbOk || saving) return;
  const dirty = sig !== lastSig || [...usedPhotoIds()].some(id => photos.has(id) && !photos.get(id).saved);
  if (dirty){
    setSaveState("dirty");
    if (!autoTimer) autoTimer = setTimeout(() => { autoTimer = 0; saveProject(); }, SAVE_DELAY);
  } else if (!saveError) setSaveState("saved");
}
function clearUndo(){ undoStack = []; undoBase = null; seenSig = null; }
function undo(){
  if (!proj) return;
  const cur = JSON.stringify(record());
  const target = cur !== undoBase ? undoBase : undoStack.pop();
  if (!target) { toast("No hay nada para deshacer."); return; }
  const r = JSON.parse(target);
  Object.assign(state, DEFAULTS, r.settings || {}, {commonBack:r.commonBack || null, logo:r.logo || null, logo2:r.logo2 || null, cards:r.cards || []});
  proj.name = r.name; proj.groupId = r.groupId || null; proj.albumId = r.albumId || null;
  undoBase = seenSig = target; changedAt = Date.now();
  state.picked.clear(); state.selecting = false;
  if (ed) { $("editor").classList.remove("on"); ed = null; }
  syncInputs(); renderAll(); updateClassChip(); tick();
  toast("Cambio deshecho.");
}
$("undoAll").onclick = undo;
document.addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
  if (document.querySelector(".modal.on")) return; // el recorte tiene su propio deshacer
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
  e.preventDefault(); undo();
});
setInterval(tick, 400);

/* lo que se recuerda: la última colección y el estilo que se venía usando (no los textos ni logos) */
const NOT_REMEMBERED = ["backText", "backText2", "logoPos", "logo2Pos", "textPos", "backMode"];
function rememberSettings(){ const o = {}; SETTINGS.forEach(k => { if (!NOT_REMEMBERED.includes(k)) o[k] = state[k]; }); MFC.remember(LS_CONFIG, o); }
function lastSettings(){ try { const o = JSON.parse(MFC.recall(LS_CONFIG) || "null") || {}; NOT_REMEMBERED.forEach(k => delete o[k]); return o; } catch(_){ return {}; } }
async function listProjects(){ const d = await db(); return (await reqP(d.transaction("projects").objectStore("projects").getAll())).sort((a,b) => b.updated - a.updated); }
function syncInputs(){
  $("backText").value = state.backText; $("backText2").value = state.backText2;
  $("backColor").value = state.backColor; $("backTextColor").value = state.backTextColor;
  $("backNumber").checked = state.backNumber;
  $("patternColor").value = state.patternColor; $("patternAlpha").value = state.patternAlpha; ["logoSize","logo2Size","logoTintColor","logo2TintColor","logoStrokeColor","logo2StrokeColor","logoStrokeW","logo2StrokeW"].forEach(k => $(k).value = state[k]);
  $("logoStroke").checked = state.logoStroke; $("logo2Stroke").checked = state.logo2Stroke;
  $("logoTint").checked = state.logoTint; $("logo2Tint").checked = state.logo2Tint;
  $("frame").checked = state.frame; $("plate").checked = state.plate;
  ["withBacks","bleed","marks","rotBack","shared"].forEach(k => $(k).checked = !!state[k]);
  $("projName").value = proj ? proj.name : "";
}
const DEFAULTS = {paper:"a4", size:"std", shared:false, bleed:true, marks:true, withBacks:true, rotBack:false, backMode:"design", backColor:"#f6d3e4", backTextColor:"#5b2140", backText:"", backText2:"", backNumber:true, pattern:"naipe", patternColor:"#5b2140", patternAlpha:0.55, frame:true, plate:true, font:"Bricolage Grotesque", logoSize:0.5, logo2Size:0.4, logoPos:null, logo2Pos:null, textPos:null, logoTint:false, logoTintColor:"#ffffff", logo2Tint:false, logo2TintColor:"#ffffff", logoStroke:false, logoStrokeColor:"#000000", logoStrokeW:0.025, logo2Stroke:false, logo2StrokeColor:"#000000", logo2StrokeW:0.025};
async function newProject(){
  if (proj) await saveProject();
  let n = 1; try { n = (await listProjects()).length + 1; } catch(_){}
  proj = {id:newId("p"), name:`Colección ${n}`, created:Date.now()};
  Object.assign(state, DEFAULTS, lastSettings(), {commonBack:null, logo:null, logo2:null, cards:[], page:0, allFlipped:false});
  photos.clear(); releaseFull(); fullFailed.clear(); lastSig = null; lastSavedAt = null; clearUndo();
  syncInputs(); renderAll(); updateClassChip(); await saveProject(true);
  MFC.remember(LS_LAST, proj.id);
}
async function openProject(id, retry = false){
  if (proj && proj.id !== id) await saveProject();
  const d = await db(), t = d.transaction(["projects","photos"]);
  const rec = await reqP(t.objectStore("projects").get(id));
  const list = await reqP(t.objectStore("photos").index("project").getAll(id));
  if (!rec) return;
  toast("Abriendo…", 60000);
  opening = true;
  photos.clear(); releaseFull(); fullFailed.clear();
  // logos y dorso común se usan en todas las tarjetas: quedan completos; las fotos, como miniatura
  const keep = new Set([rec.logo, rec.logo2, rec.commonBack].filter(Boolean).map(r => r.photoId));
  let k = 0;
  for (const p of list){
    try {
      const blob = MFC.blobOf(p), bmp = await MFC.decode(blob), kf = keep.has(p.id);
      addPhoto(p.id, bmp, blob, blob.type === "image/png", true, kf);
      if (!kf && photos.get(p.id).src !== bmp) bmp.close && bmp.close();
    } catch(_){}
    if (++k % 10 === 0){ toast(`Abriendo… ${k} de ${list.length}`, 60000); await new Promise(r => setTimeout(r, 0)); }
  }
  proj = {id:rec.id, name:rec.name, created:rec.created, groupId:rec.groupId || null, albumId:rec.albumId || null, cover:rec.cover || null};
  Object.assign(state, DEFAULTS, rec.settings || {}, {commonBack:rec.commonBack || null, logo:rec.logo || null, logo2:rec.logo2 || null, cards:rec.cards || [], page:0, allFlipped:false});
  lastSig = JSON.stringify(record()); lastSavedAt = new Date(rec.updated);
  opening = false; clearUndo(); MFC.remember(LS_LAST, proj.id);
  syncInputs(); renderAll(); showSaveInfo(); updateClassChip();
  // fotos que faltan o no se pueden leer en este dispositivo: si hay nube se vuelven a bajar; si no, se avisa
  const lost = [...usedPhotoIds()].filter(id => !photos.has(id)), missing = lost.length;
  if (!missing){ toast(`Abierta: ${proj.name}`); return; }
  if (!retry && MFC.cloud && MFC.cloud.user && MFC.cloud.repair){
    toast("Bajando de nuevo las fotos de la nube…", 60000);
    if (await MFC.cloud.repair("cards", rec.id, lost) && proj && proj.id === rec.id) return openProject(rec.id, true);
  }
  toast(`${missing === 1 ? "Una foto no se pudo abrir" : missing + " fotos no se pudieron abrir"} en este dispositivo. Si las tenés en otro, entrá a la nube desde los dos.`, 9000);
}
/* lo último que se eliminó queda en memoria para poder recuperarlo desde Mis tarjetas */
let deletedProj = null;
async function keepDeleted(id){
  try {
    const d = await db(), t = d.transaction(["projects","photos"]);
    const rec = await reqP(t.objectStore("projects").get(id)), list = await reqP(t.objectStore("photos").index("project").getAll(id));
    deletedProj = rec ? {rec, list} : null;
  } catch(_){ deletedProj = null; }
  showUndel();
}
function showUndel(){
  $("undelBar").hidden = !deletedProj;
  if (deletedProj) $("undelText").textContent = `Eliminaste «${deletedProj.rec.name}».`;
}
async function recoverDeleted(){
  if (!deletedProj) return;
  // vuelve con un id nuevo, así la nube la toma como una colección nueva y no como la borrada
  const {rec, list} = deletedProj, pid = newId("p"), map = new Map(list.map(ph => [ph.id, newId("f")]));
  const fix = r => r && map.has(r.photoId) ? {...r, photoId:map.get(r.photoId)} : (r || null);
  const d = await db(), t = d.transaction(["projects","photos"], "readwrite");
  list.forEach(ph => t.objectStore("photos").put({...ph, id:map.get(ph.id), projectId:pid}));
  t.objectStore("projects").put({...rec, id:pid, updated:Date.now(), cards:(rec.cards || []).map(c => ({...c, front:fix(c.front), back:fix(c.back)})),
    commonBack:fix(rec.commonBack), logo:fix(rec.logo), logo2:fix(rec.logo2)});
  await doneP(t);
  deletedProj = null; showUndel(); renderProjectList();
  toast("Colección recuperada.");
}
$("undelBtn").onclick = recoverDeleted;
async function deleteProject(id){
  const d = await db(), t = d.transaction(["projects","photos"], "readwrite"), ps = t.objectStore("photos");
  t.objectStore("projects").delete(id);
  (await reqP(ps.index("project").getAllKeys(id))).forEach(k => ps.delete(k));
  await doneP(t);
}
$("projName").addEventListener("input", e => { if (proj) proj.name = e.target.value.trim() || "Sin nombre"; });
$("projName").addEventListener("change", () => saveProject());
setInterval(() => saveProject(), 30000); // respaldo por si algo no se detectó
$("saveState").onclick = async () => {
  if (!dbOk){ toast("Este navegador no permite guardar. Descargá una copia desde Mis tarjetas.", 4000); return; }
  await saveProject(true);
  toast(saveError ? "No se pudo guardar." : `Todo guardado a las ${hhmm(lastSavedAt)}.`);
};
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveProject(); });
window.addEventListener("pagehide", () => saveProject());

async function projThumb(cv, p){
  try {
    const ref = (p.cards || []).find(c => c && c.id === p.cover && c.front)?.front || (p.cards || []).find(c => c && c.front)?.front || p.logo2 || p.logo || p.commonBack;
    if (!ref) return;
    const d = await db(), rec = await reqP(d.transaction("photos").objectStore("photos").get(ref.photoId));
    if (!rec) return;
    const bmp = await MFC.decode(MFC.blobOf(rec)), dpr = devicePixelRatio || 1;
    cv.width = Math.round(40*dpr); cv.height = Math.round(62*dpr);
    const x = cv.getContext("2d"), sc = Math.max(cv.width/bmp.width, cv.height/bmp.height);
    x.drawImage(bmp, (cv.width - bmp.width*sc)/2, (cv.height - bmp.height*sc)/2, bmp.width*sc, bmp.height*sc);
  } catch(_){}
}
async function duplicateProject(id, newName){
  await saveProject();
  const d = await db(), t0 = d.transaction(["projects","photos"]);
  const rec = await reqP(t0.objectStore("projects").get(id));
  const list = await reqP(t0.objectStore("photos").index("project").getAll(id));
  if (!rec) return;
  const pid = newId("p"), map = new Map();
  list.forEach(ph => map.set(ph.id, newId("f")));
  const fix = r => r && map.has(r.photoId) ? {...r, photoId:map.get(r.photoId)} : null;
  const cmap = new Map(), cards = (rec.cards || []).map(c => { const nid = newId("c"); cmap.set(c.id, nid); return {...c, id:nid, front:fix(c.front), back:fix(c.back)}; });
  const t = d.transaction(["projects","photos"], "readwrite");
  list.forEach(ph => t.objectStore("photos").put({...ph, id:map.get(ph.id), projectId:pid}));
  t.objectStore("projects").put({...rec, id:pid, name:newName || `${rec.name} — copia`, created:Date.now(), updated:Date.now(), cards, cover:cmap.get(rec.cover) || null,
    commonBack:fix(rec.commonBack), logo:fix(rec.logo), logo2:fix(rec.logo2)});
  await doneP(t);
  toast("Colección duplicada.");
  return pid;
}
async function renderProjectList(){
  const box = $("plist"); box.innerHTML = '<h3 class="ghead modehead">Luli\'s Photocards</h3>';
  let list = []; try { list = await listProjects(); } catch(_){}
  if (!list.length){ box.insertAdjacentHTML("beforeend", '<p class="muted" style="text-align:center">Todavía no hay colecciones guardadas.</p>'); await MFC.renderOtherProjects(box, "hojas"); return; }
  const gs = await listGroups().catch(() => []), gmap = new Map(gs.map(g => [g.id, g]));
  const gname = p => gmap.get(p.groupId)?.name || "";
  const aname = p => gmap.get(p.groupId)?.albums?.find(a => a.id === p.albumId)?.name || "";
  // cada grupo o artista con sus colecciones (también los que todavía no tienen); al final, las que no son de un grupo
  const order = [];
  gs.forEach(g => order.push({g, items: list.filter(p => p.groupId === g.id).sort((a, b) => aname(a).localeCompare(aname(b), "es", {sensitivity:"base"}) || b.updated - a.updated)}));
  const loose = list.filter(p => !gmap.has(p.groupId));
  if (loose.length) order.push({g:null, items:loose});
  order.forEach(({g, items}) => {
    const h = document.createElement("h3"); h.className = "ghead";
    const t = document.createElement("span"); t.textContent = g ? g.name : "Sin grupo"; h.appendChild(t);
    if (g){ const nb = document.createElement("button"); nb.className = "gnew"; nb.textContent = "+ Nueva"; nb.title = `Nueva colección de ${g.name}`; nb.setAttribute("aria-label", `Nueva colección de ${g.name}`);
      nb.onclick = () => { closeProjects(); openNC("new", g.id); }; h.appendChild(nb); }
    box.appendChild(h);
    if (!items.length){ const e = document.createElement("p"); e.className = "gempty"; e.textContent = "Todavía no hay colecciones."; box.appendChild(e); }
    items.forEach(p => addItem(p));
  });
  function addItem(p){
    const it = document.createElement("div"); it.className = "pitem" + (proj && p.id === proj.id ? " cur" : "");
    const cv = document.createElement("canvas"); projThumb(cv, p);
    const info = document.createElement("div"); info.className = "pinfo";
    const b = document.createElement("b"); b.textContent = p.name;
    const sm = document.createElement("small"); const k = p.cardCount ?? (p.cards || []).length;
    sm.textContent = `${aname(p) ? aname(p) + " · " : ""}${k} ${k === 1 ? "tarjeta" : "tarjetas"} · ${new Date(p.updated).toLocaleString("es", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"})}`;
    info.append(b, sm);
    const btns = document.createElement("div"); btns.className = "pbtns";
    const open = document.createElement("button"); open.className = "open";
    open.textContent = proj && p.id === proj.id ? "Abierta" : "Abrir";
    open.onclick = async () => { closeProjects(); await openProject(p.id); await setView("work"); };
    const dup = document.createElement("button"); dup.textContent = "Duplicar";
    dup.onclick = async () => { await duplicateProject(p.id); renderProjectList(); };
    const del = document.createElement("button"); del.textContent = "Eliminar";
    del.onclick = async () => {
      if (!del.dataset.armed){ del.dataset.armed = "1"; del.textContent = "¿Seguro?"; setTimeout(() => { delete del.dataset.armed; del.textContent = "Eliminar"; }, 3000); return; }
      const cur = proj && p.id === proj.id;
      if (cur) await saveProject(true);
      await keepDeleted(p.id);
      await deleteProject(p.id);
      if (cur){ proj = null; const rest = await listProjects(); if (rest.length) await openProject(rest[0].id); else await newProject(); }
      renderProjectList();
    };
    const more = document.createElement("button"); more.className = "pmore"; more.textContent = "⋯"; more.title = "Más acciones"; more.setAttribute("aria-label", `Más acciones para ${p.name}`); more.setAttribute("aria-expanded", "false");
    const extra = document.createElement("div"); extra.className = "pextra"; extra.hidden = true; extra.append(dup, del);
    more.onclick = () => { extra.hidden = !extra.hidden; more.setAttribute("aria-expanded", !extra.hidden); };
    btns.append(open, more);
    it.append(cv, info, btns, extra); box.appendChild(it);
  }
  await MFC.renderOtherProjects(box, "hojas");
}
