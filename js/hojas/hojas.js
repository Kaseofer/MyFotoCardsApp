/* Hojas de fotos · hojas y controles
   Pasar de hoja, vista general, agregar/quitar hojas, los controles de la barra lateral,
   cargar fotos (incluye HEIC con heic2any) y el texto automático (año, lugar, grupo). */

/* ---------- navegación con animación ---------- */
function goTo(p){
  p = Math.max(0, Math.min(state.pages-1, p));
  if (p === state.page){ draw(); return; }
  const dir = p > state.page ? 1 : -1;
  if (state.moving < 0) state.sel = -1;
  state.page = p; updateToolbar(); draw(); syncThumbScroll();
  if (!reduceMotion && preview.animate){
    preview.animate([{transform:`translateX(${dir*70}px) rotate(${dir*1.5}deg)`, opacity:0}, {transform:"none", opacity:1}],
      {duration:300, easing:"cubic-bezier(.2,.8,.2,1)"});
  }
}
$("undoBtn").onclick = undo;
$("prevBtn").onclick = () => goTo(state.page-1);
$("nextBtn").onclick = () => goTo(state.page+1);
document.addEventListener("keydown", e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); undo(); return; }
  if (e.key === "ArrowRight") goTo(state.page+1);
  if (e.key === "ArrowLeft") goTo(state.page-1);
  if (e.key === "Escape"){ if (state.moving >= 0) cancelMove(); else closeOverview(); }
});

/* ---------- vista general ---------- */
function openOverview(){ $("overview").classList.add("on"); buildThumbs($("ovGrid"), 260); }
function closeOverview(){ $("overview").classList.remove("on"); }
$("ovBtn").onclick = openOverview;
$("ovClose").onclick = closeOverview;

/* ---------- hojas ---------- */
$("addPageBtn").onclick = () => {
  pushUndo();
  state.orients[state.pages] = orientOf(state.pages-1); state.pages++; // la nueva sale como la última
  goTo(state.pages-1); say("Hoja nueva agregada.");
};
let delArmed = false, delTimer = 0;
$("delPageBtn").onclick = () => {
  const k = countOn(state.page);
  clearTimeout(delTimer);
  if (k > 0 && !delArmed){
    delArmed = true; $("delPageBtn").textContent = `Tocá de nuevo para borrar (${k} fotos)`;
    delTimer = setTimeout(() => { delArmed = false; $("delPageBtn").textContent = "Eliminar esta hoja"; }, 3000);
    return;
  }
  delArmed = false; $("delPageBtn").textContent = "Eliminar esta hoja";
  pushUndo();
  state.slots.splice(pageStart(state.page), perPage(state.page));
  if (state.pages > 1) state.orients.splice(state.page, 1);
  state.pages = Math.max(1, state.pages-1);
  state.page = Math.min(state.page, state.pages-1);
  state.sel = -1; state.moving = -1; fitPages(); updateToolbar(); draw();
};

/* ---------- controles ---------- */
function seg(el, items, key){
  el.innerHTML = "";
  items.forEach(it => {
    const b = document.createElement("button");
    b.textContent = it.label; b.setAttribute("aria-pressed", state[key] === it.id);
    b.onclick = () => {
      if (state[key] === it.id) return;
      relayout(() => { state[key] = it.id; });
      if (key === "capAuto"){ applyAutoCaptions(); resolvePlaces(); }
      buildUI(); draw();
    };
    el.appendChild(b);
  });
}
// Si el cambio hace que entren otra cantidad de fotos por hoja, se reparten de nuevo
// manteniendo a la vista la primera foto de la hoja actual
function pageCounts(){ const out = []; for (let q = 0; q < state.pages; q++) out.push(perPage(q)); return out.join(","); }
function relayout(apply){
  const before = pageCounts(), first = pageStart(state.page);
  apply();
  if (pageCounts() === before) return;
  state.pages = 1; fitPages(); // cada hoja conserva su orientación
  state.page = Math.min(pageOf(first), state.pages-1);
  state.sel = -1; state.moving = -1;
}
// Orientación: cambia solo la hoja que se está viendo
function setPageOrient(o, all){
  if (all ? state.orients.every(x => x === o) : orientOf() === o) return;
  pushUndo();
  relayout(() => {
    if (all) state.orients = state.orients.map(() => o); else state.orients[state.page] = o;
    state.orient = o; // las hojas nuevas salen así
  });
  buildUI(); draw();
}
function syncOrientSeg(){
  const o = orientOf();
  $("orientSeg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.id === o));
  const mixed = state.orients.some(x => x !== o);
  $("orientAll").hidden = !mixed;
  $("orientHint").textContent = state.pages > 1 ? `Solo cambia la hoja ${state.page+1}.` : "";
}
function buildUI(){
  seg($("paperSeg"), PAPERS, "paper");
  $("orientSeg").innerHTML = "";
  ORIENTS.forEach(it => {
    const b = document.createElement("button"); b.textContent = it.label; b.dataset.id = it.id;
    b.onclick = () => setPageOrient(it.id, false);
    $("orientSeg").appendChild(b);
  });
  syncOrientSeg();
  seg($("layoutSeg"), LAYOUTS, "layout"); seg($("sizeSeg"), SIZES, "layout"); seg($("shapeSeg"), SHAPES, "shape");
  $("shapeHint").textContent = state.shape === "h" ? "Más anchas que altas (3:2, como salen de la cámara), aunque la hoja esté parada."
    : state.shape === "v" ? "Más altas que anchas (2:3), aunque la hoja esté acostada."
    : "Las fotos ocupan todo el espacio disponible.";
  seg($("styleSeg"), STYLES, "style");
  seg($("bgSeg"), BGS, "bg"); seg($("posSeg"), POS, "capPos"); seg($("autoSeg"), AUTOCAP, "capAuto");
  $("placeHint").hidden = !usesPlace();
  $("groupRow").hidden = state.capAuto !== "group";
  if (state.capAuto === "group") fillGroupSel();
  $("marginOut").textContent = state.margin + " mm"; $("gapOut").textContent = state.gap + " mm";
  updateToolbar();
}
// Grupo y álbum de la biblioteca de Luli's Photocards
let groupsCache = [];
async function fillGroupSel(){
  groupsCache = await MFC.listGroups();
  const gs = $("grpSel"), as = $("albSel");
  gs.innerHTML = '<option value="">Elegí un grupo</option>';
  groupsCache.forEach(g => { const o = document.createElement("option"); o.value = g.id; o.textContent = g.name; gs.appendChild(o); });
  gs.value = groupsCache.some(g => g.id === state.groupId) ? state.groupId : "";
  const g = groupsCache.find(x => x.id === gs.value);
  as.innerHTML = '<option value="">Sin álbum</option>';
  (g ? g.albums : []).forEach(a => { const o = document.createElement("option"); o.value = a.id; o.textContent = a.name; as.appendChild(o); });
  as.value = g && g.albums.some(a => a.id === state.albumId) ? state.albumId : "";
  as.disabled = !g;
}
function pickGroup(){
  const g = groupsCache.find(x => x.id === $("grpSel").value) || null, a = g && g.albums.find(x => x.id === $("albSel").value) || null;
  state.groupId = g ? g.id : null; state.albumId = a ? a.id : null;
  state.groupLabel = g ? (a ? `${g.name} · ${a.name}` : g.name) : "";
  applyAutoCaptions(); fillGroupSel(); draw();
}
$("grpSel").onchange = () => { $("albSel").value = ""; pickGroup(); };
$("albSel").onchange = pickGroup;
["margin","gap"].forEach(k => $(k).oninput = e => { relayout(() => { state[k] = parseFloat(e.target.value); }); buildUI(); draw(); });
$("orientAll").onclick = () => { setPageOrient(orientOf(), true); say("Todas las hojas quedaron " + (orientOf() === "h" ? "horizontales." : "verticales.")); };
$("cuts").onchange = e => { state.cuts = e.target.checked; draw(); };
$("captions").onchange = e => { state.captions = e.target.checked; updateToolbar(); draw(); };

/* ---------- carga de fotos ---------- */
// Lee del EXIF la fecha en que se sacó la foto y, si la tiene, la ubicación GPS
async function readExif(file){
  try {
    const v = new DataView(await file.slice(0, 256*1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return {date:null, gps:null};
    let o = 2;
    while (o < v.byteLength - 10){
      const mk = v.getUint16(o), len = v.getUint16(o+2);
      if (mk === 0xFFE1 && v.getUint32(o+4) === 0x45786966) return parseTiff(v, o+10);
      if ((mk & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch(_){}
  return {date:null, gps:null};
}
function parseTiff(v, t){
  const le = v.getUint16(t) === 0x4949;
  const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ifd = p => { const n = u16(p), tags = {}; for (let i=0;i<n;i++){ const e = p+2+i*12; tags[u16(e)] = {count:u32(e+4), val:e+8}; } return tags; };
  const str = tag => { const off = tag.count > 4 ? t + u32(tag.val) : tag.val; let s = ""; for (let i=0;i<tag.count;i++){ const c = v.getUint8(off+i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const ifd0 = ifd(t + u32(t+4));
  let d = null;
  if (ifd0[0x8769]){ const ex = ifd(t + u32(ifd0[0x8769].val)); if (ex[0x9003]) d = str(ex[0x9003]); }
  if (!d && ifd0[0x0132]) d = str(ifd0[0x0132]);
  const date = d && /^\d{4}:\d{2}:\d{2}/.test(d) && !d.startsWith("0000") ? d : null;
  let gps = null;
  try {
    if (ifd0[0x8825]){
      const G = ifd(t + u32(ifd0[0x8825].val));
      // grados, minutos y segundos guardados como 3 fracciones
      const dms = tag => { const off = t + u32(tag.val); let r = 0; for (let i = 0; i < 3; i++){ const den = u32(off+i*8+4); r += (den ? u32(off+i*8)/den : 0) / Math.pow(60, i); } return r; };
      const ref = tag => String.fromCharCode(v.getUint8(tag.val));
      if (G[2] && G[4]){
        let lat = dms(G[2]), lon = dms(G[4]);
        if (G[1] && ref(G[1]) === "S") lat = -lat;
        if (G[3] && ref(G[3]) === "W") lon = -lon;
        if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) gps = {lat:+lat.toFixed(5), lon:+lon.toFixed(5)};
      }
    }
  } catch(_){}
  return {date, gps};
}

/* ---------- texto automático: año, lugar o ambos ---------- */
function autoText(sl){
  const year = sl.date ? sl.date.slice(0,4) : "", place = sl.place || "";
  if (state.capAuto === "place") return place || year;
  if (state.capAuto === "both") return [place, year].filter(Boolean).join(" ");
  if (state.capAuto === "group") return state.groupLabel || "";
  return year;
}
// Actualiza el texto de las fotos que no fueron escritas a mano
function applyAutoCaptions(){ state.slots.forEach(sl => { if (sl && sl.autoCap !== false) sl.caption = autoText(sl); }); }

// Nombre del lugar a partir de las coordenadas (OpenStreetMap / Nominatim).
// Se pide de a una por segundo como exige su política de uso y se recuerda por zona (~1 km).
const placeCache = new Map();
let geoRunning = false;
const geoKey = g => g.lat.toFixed(2) + "," + g.lon.toFixed(2);
async function reverseGeocode(g){
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=${g.lat}&lon=${g.lon}`;
  const res = await fetch(u, {headers:{"Accept":"application/json"}});
  if (!res.ok) throw new Error("geo " + res.status);
  const j = await res.json(), a = j.address || {};
  return a.city || a.town || a.village || a.municipality || a.county || a.state || "";
}
async function resolvePlaces(){
  if (geoRunning || !usesPlace()) return;
  const todo = state.slots.filter(sl => sl && sl.gps && sl.place == null);
  if (!todo.length) return;
  geoRunning = true;
  let asked = 0, failed = false;
  const keys = [...new Set(todo.map(sl => geoKey(sl.gps)))];
  try {
    for (let i = 0; i < keys.length; i++){
      if (!usesPlace()) break;
      const k = keys[i];
      let name = placeCache.get(k);
      if (name === undefined){
        if (!navigator.onLine){ failed = true; break; }
        statusLock = true; $("status").textContent = `Buscando lugares… ${i+1} de ${keys.length}`;
        if (asked++) await new Promise(r => setTimeout(r, 1100));
        const sample = todo.find(sl => geoKey(sl.gps) === k);
        try { name = await reverseGeocode(sample.gps); } catch(_){ failed = true; break; }
        placeCache.set(k, name);
      }
      state.slots.forEach(sl => {
        if (sl && sl.gps && sl.place == null && geoKey(sl.gps) === k){ sl.place = name; if (sl.autoCap !== false) sl.caption = autoText(sl); }
      });
      draw("page");
    }
  } finally {
    geoRunning = false; statusLock = false; updateToolbar(); draw();
    if (failed) say("No se pudieron buscar algunos lugares (¿sin conexión?). Se reintenta al cargar más fotos o al volver a elegir Lugar.", 5000);
  }
  // si mientras tanto se cargaron más fotos con GPS, seguir con esas
  if (!failed && state.slots.some(sl => sl && sl.gps && sl.place == null)) resolvePlaces();
}
const isHeic = f => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
// Las fotos HEIC del iPhone solo las abre Safari: en el resto se convierten con heic2any (se descarga solo si hace falta)
let heicLib = null;
function loadHeicLib(){
  if (!heicLib) heicLib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    s.onload = () => window.heic2any ? res(window.heic2any) : rej(new Error("heic2any"));
    s.onerror = () => { heicLib = null; rej(new Error("heic2any")); };
    document.head.appendChild(s);
  });
  return heicLib;
}
async function toImage(blob){
  const url = URL.createObjectURL(blob);
  try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  finally { URL.revokeObjectURL(url); }
}
async function loadFile(file){
  const {date, gps} = await readExif(file);
  let img;
  try { img = await toImage(file); }
  catch(err){
    if (!isHeic(file)) throw err;
    const heic2any = await loadHeicLib();
    let jpg = await heic2any({blob:file, toType:"image/jpeg", quality:0.92});
    if (Array.isArray(jpg)) jpg = jpg[0];
    img = await toImage(jpg);
  }
  const k = Math.min(1, FULL / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth*k)); c.height = Math.max(1, Math.round(img.naturalHeight*k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("toBlob");
  const {thumb, thumbBlob} = await makeThumb(c);
  const w = c.width, h = c.height;
  c.width = c.height = 0; // libera la memoria del canvas grande enseguida
  const sl = {id:newId("f"), blob, thumb, thumbBlob, w, h, fx:.5, fy:.5, zoom:1, rot:0, date, gps, place:null, autoCap:true, caption:"", pos:null, name:file.name};
  sl.caption = autoText(sl);
  return sl;
}
const isImage = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
let loadingFiles = false;
async function addFiles(fileList){
  if (loadingFiles){ say("Esperá a que termine la carga anterior."); return; }
  const files = [...fileList].filter(isImage).sort((a,b) => a.name.localeCompare(b.name, "es", {numeric:true}));
  if (!files.length){ say("No encontré imágenes para cargar."); return; }
  loadingFiles = true;
  const loaded = []; let fail = 0;
  try {
    for (let i = 0; i < files.length; i++){
      statusLock = true; $("status").textContent = `Cargando ${i+1} de ${files.length}…`;
      try { loaded.push(await loadFile(files[i])); } catch(_){ fail++; }
      await new Promise(r => setTimeout(r, 0));
    }
  } finally { loadingFiles = false; statusLock = false; }
  if (!loaded.length){ say("No se pudo abrir ninguna de esas imágenes.", 4000); draw(); return; }
  loaded.sort((a,b) => (a.date || "9999").localeCompare(b.date || "9999"));
  pushUndo();
  let i = 0;
  for (const sl of loaded){
    while (state.slots[i]) i++;
    state.slots[i] = sl;
  }
  fitPages();
  draw();
  say(`Listo: ${loaded.length} ${loaded.length === 1 ? "foto" : "fotos"} en ${state.pages} ${state.pages === 1 ? "hoja" : "hojas"}${fail ? ` (${fail} no se pudieron abrir)` : ""}.`, 4000);
  setTimeout(resolvePlaces, 2500); // deja leer el aviso antes de mostrar "Buscando lugares…"
}
$("folderBtn").onclick = () => $("fileFolder").click();
$("addBtn").onclick = () => $("fileMulti").click();
$("fileFolder").onchange = e => { const f = e.target.files; addFiles(f).finally(() => e.target.value = ""); };
$("fileMulti").onchange = e => { const f = e.target.files; addFiles(f).finally(() => e.target.value = ""); };
let targetIndex = -1;
$("fileOne").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f || targetIndex < 0) return;
  const at = targetIndex;
  try { const sl = await loadFile(f); pushUndo(); state.slots[at] = sl; state.sel = at; fitPages(); resolvePlaces(); } catch(_){ say("No se pudo abrir esa imagen."); }
  updateToolbar(); draw();
};
$("sortBtn").onclick = () => {
  const all = state.slots.filter(Boolean);
  if (!all.length){ say("Primero cargá algunas fotos."); return; }
  pushUndo();
  all.sort((a,b) => (a.date || "9999").localeCompare(b.date || "9999"));
  state.slots = all; state.pages = 1; fitPages(); state.sel = -1; state.moving = -1;
  updateToolbar(); draw(); say("Fotos ordenadas de la más antigua a la más nueva.");
};
let clearArmed = false, clearTimer = 0;
$("clearBtn").onclick = () => {
  clearTimeout(clearTimer);
  if (!clearArmed && state.slots.some(Boolean)){
    clearArmed = true; $("clearBtn").textContent = "Tocá de nuevo para vaciar todo";
    clearTimer = setTimeout(() => { clearArmed = false; $("clearBtn").textContent = "Vaciar todo"; }, 3000); return;
  }
  clearArmed = false; $("clearBtn").textContent = "Vaciar todo";
  if (state.slots.some(Boolean)) pushUndo();
  state.orients = [orientOf()];
  state.slots = []; state.pages = 1; state.page = 0; state.sel = -1; state.moving = -1; updateToolbar(); draw();
};
