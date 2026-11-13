/* Luli's Photocards · parte de atrás (pestaña Decorar)
   Diseños listos, colores, patrones, textos, logos (con tinte y contorno), tamaño y posición
   de logos y texto, y la imagen de dorso común para todas las tarjetas.
   scheduleGrid() redibuja la grilla un rato después de cada cambio, para no trabar al deslizar. */

/* ---------- dorso común ---------- */
function seg(el, items, get, set){
  el.innerHTML = "";
  items.forEach(it => {
    const b = document.createElement("button"); b.textContent = it.label;
    b.setAttribute("aria-pressed", get() === it.id);
    b.onclick = () => { set(it.id); renderAll(); };
    el.appendChild(b);
  });
}
function renderBackTab(){
  if (!backStart || !proj || backStart.pid !== proj.id) markBackStart();
  backButtons();
  seg($("backModeSeg"), [{id:"design", label:"Un diseño"}, {id:"image", label:"Una foto mía"}], () => state.backMode, v => state.backMode = v);
  seg($("fontSeg"), FONTS, () => state.font, v => state.font = v);
  renderPresets(); renderArtistDecor();
  if (!$("backCustom").hidden) renderPatterns();
  $("backDragHint").hidden = state.backMode !== "design" || !(state.logo || state.logo2 || state.backText || state.backText2);
  ["logo","logo2"].forEach(k => {
    const has = !!state[k];
    $(k+"Opts").hidden = !has; $(k+"Key").hidden = !has; $(k+"Del").hidden = !has;
    $(k+"Btn").textContent = has ? "Cambiar imagen" : "Agregar imagen";
    $(k+"TintColor").disabled = !state[k+"Tint"];
    $(k+"StrokeColor").disabled = !state[k+"Stroke"]; $(k+"StrokeW").disabled = !state[k+"Stroke"];
  });
  $("backImageOpts").hidden = state.backMode !== "image";
  $("backDesignOpts").hidden = state.backMode !== "design";
  $("backEditBtn").hidden = !state.commonBack;
  $("backImgBtn").textContent = state.commonBack ? "Cambiar imagen del dorso" : "Elegir imagen del dorso";
  const fake = {front:null, back:null};
  faceCanvas($("backPrev"), fake, "back", 0, $("backPrev").clientWidth || 260);
  syncPosSliders();
}
function renderPresets(){
  const box = $("presetGrid"), sz = size(), dpr = devicePixelRatio || 1;
  if (!box.children.length) PRESETS.forEach(p => {
    const b = document.createElement("button"); b.className = "preset"; b.dataset.p = p.id;
    b.innerHTML = `<canvas></canvas><span>${p.label}</span>`;
    b.onclick = () => { PRESET_KEYS.forEach(k => state[k] = p[k]); syncInputs(); renderBackTab(); scheduleGrid(); };
    box.appendChild(b);
  });
  const saved = {}; PRESET_KEYS.forEach(k => saved[k] = state[k]);
  [...box.children].forEach(b => {
    const p = PRESETS.find(x => x.id === b.dataset.p);
    b.setAttribute("aria-pressed", PRESET_KEYS.every(k => saved[k] === p[k]));
    const cv = b.querySelector("canvas"), W = Math.round(84*dpr), H = Math.round(W*sz.h/sz.w);
    if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    PRESET_KEYS.forEach(k => state[k] = p[k]);
    const R = {x:0, y:0, w:W, h:H};
    drawBackDecor(cv.getContext("2d"), R, R, p.pattern);
    Object.assign(state, saved);
  });
}
function setCustom(on){
  $("backCustom").hidden = !on; $("customBtn").setAttribute("aria-expanded", on);
  $("customBtn").textContent = on ? "Ocultar opciones" : "Personalizar";
  MFC.remember("lpc-personalizar", on ? "1" : "");
  renderBackTab();
}
$("customBtn").onclick = () => setCustom($("backCustom").hidden);
if (MFC.recall("lpc-personalizar") === "1"){ $("backCustom").hidden = false; $("customBtn").setAttribute("aria-expanded", "true"); $("customBtn").textContent = "Ocultar opciones"; }
$("backImgBtn").onclick = () => pickOne(ref => { state.commonBack = ref; state.backMode = "image"; });
$("backEditBtn").onclick = () => openEditor(-1, "back");
["backText","backText2"].forEach(k => $(k).addEventListener("input", e => { state[k] = e.target.value; renderBackTab(); scheduleGrid(); }));
["backColor","backTextColor","patternColor"].forEach(k => $(k).addEventListener("input", e => { state[k] = e.target.value; renderBackTab(); scheduleGrid(); }));
const scratchCtx = document.createElement("canvas").getContext("2d");
const POS_SLIDERS = {logo2Y:"logo2Pos", logoY:"logoPos", textY:"textPos"};
Object.entries(POS_SLIDERS).forEach(([id, key]) => $(id).addEventListener("input", e => { state[key] = parseFloat(e.target.value); renderBackTab(); scheduleGrid(); }));
function syncPosSliders(){
  const sz = size(), L = layoutDesign(scratchCtx, {x:0, y:0, w:550, h:550*sz.h/sz.w});
  Object.keys(POS_SLIDERS).forEach(id => { const el = $(id); if (document.activeElement === el) return; const it = L.items.find(i => i.slider === id); if (it) el.value = it.v; });
}
$("autoLayout").onclick = () => { state.logoPos = state.logo2Pos = state.textPos = null; renderBackTab(); scheduleGrid(); };
{
  const bp = $("backPrev"); let bdrag = null;
  const hitAt = e => {
    const b = bp.getBoundingClientRect(), C = {x:0, y:0, w:b.width, h:b.height};
    const L = layoutDesign(scratchCtx, C), x = e.clientX - b.left, y = e.clientY - b.top;
    const it = [...L.items].reverse().find(i => y >= i.y - 4 && y <= i.y + i.h + 4 && Math.abs(x - C.w/2) <= i.w/2 + 4);
    return {it, y, C};
  };
  bp.addEventListener("pointerdown", e => {
    if (state.backMode !== "design") return;
    const {it, y, C} = hitAt(e); if (!it) return;
    bdrag = {key:it.key, dy:y - it.y, h:it.h, C};
    bp.setPointerCapture(e.pointerId); bp.style.cursor = "grabbing";
  });
  bp.addEventListener("pointermove", e => {
    if (!bdrag){ if (state.backMode === "design") bp.style.cursor = hitAt(e).it ? "grab" : "default"; return; }
    const b = bp.getBoundingClientRect(), y = e.clientY - b.top, room = Math.max(1, bdrag.C.h - bdrag.h);
    state[bdrag.key] = clamp((y - bdrag.dy)/room, 0, 1);
    renderBackTab();
  });
  const end = () => { if (bdrag){ bdrag = null; bp.style.cursor = "grab"; scheduleGrid(); } };
  bp.addEventListener("pointerup", end); bp.addEventListener("pointercancel", end);
}
["patternAlpha","logoSize","logo2Size"].forEach(k => $(k).addEventListener("input", e => { state[k] = parseFloat(e.target.value); renderBackTab(); scheduleGrid(); }));
["frame","plate"].forEach(k => $(k).addEventListener("change", e => { state[k] = e.target.checked; renderBackTab(); scheduleGrid(); }));
function renderPatterns(){
  const box = $("patGrid"), sz = size(), dpr = devicePixelRatio || 1;
  if (!box.children.length) PATTERNS.forEach(pt => {
    const b = document.createElement("button"); b.className = "pat"; b.dataset.p = pt.id;
    b.innerHTML = `<canvas></canvas><span>${pt.label}</span>`;
    b.onclick = () => { state.pattern = pt.id; renderBackTab(); scheduleGrid(); };
    box.appendChild(b);
  });
  [...box.children].forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.p === state.pattern);
    const cv = b.querySelector("canvas"), W = Math.round(64*dpr), H = Math.round(W*sz.h/sz.w);
    if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    const R = {x:0, y:0, w:W, h:H};
    drawBackDecor(cv.getContext("2d"), R, R, b.dataset.p);
  });
}
async function loadLogo(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const id = newId("f"); addPhoto(id, c, blob, true, false, true);
    return {photoId:id, fx:.5, fy:.5, zoom:1, rot:0};
  } finally { URL.revokeObjectURL(url); }
}
let logoTarget = "logo";
["logo","logo2"].forEach(k => {
  $(k+"Btn").onclick = () => { logoTarget = k; $("fileLogo").click(); };
  $(k+"Del").onclick = () => { state[k] = null; renderBackTab(); scheduleGrid(); };
  $(k+"Key").onclick = () => { if (state[k]) openKey(state[k], nr => { state[k] = nr; renderBackTab(); scheduleGrid(); }); };
  $(k+"Tint").addEventListener("change", e => { state[k+"Tint"] = e.target.checked; renderBackTab(); scheduleGrid(); });
  $(k+"TintColor").addEventListener("input", e => { state[k+"TintColor"] = e.target.value; renderBackTab(); scheduleGrid(); });
  $(k+"Stroke").addEventListener("change", e => { state[k+"Stroke"] = e.target.checked; renderBackTab(); scheduleGrid(); });
  $(k+"StrokeColor").addEventListener("input", e => { state[k+"StrokeColor"] = e.target.value; renderBackTab(); scheduleGrid(); });
  $(k+"StrokeW").addEventListener("input", e => { state[k+"StrokeW"] = parseFloat(e.target.value); renderBackTab(); scheduleGrid(); });
});
$("fileLogo").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { state[logoTarget] = await loadLogo(f); } catch(_){ toast("No se pudo abrir esa imagen."); }
  renderBackTab(); scheduleGrid();
};
$("backNumber").onchange = e => { state.backNumber = e.target.checked; renderBackTab(); scheduleGrid(); };
let gridPending = false;
function scheduleGrid(){ if (gridPending) return; gridPending = true; requestAnimationFrame(() => { gridPending = false; renderGrid(); }); }
