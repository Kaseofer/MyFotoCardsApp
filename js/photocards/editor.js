/* Luli's Photocards · editor de una tarjeta
   Mover, hacer zoom (también con dos dedos) y girar la foto de una tarjeta, ajustes de color,
   dorso propio, «Más herramientas», Deshacer y Cancelar (vuelve la tarjeta a como estaba). */

/* ---------- editor ---------- */
let ed = null; // {idx, side}  idx -1 = dorso común
function edRef(){
  if (ed.idx < 0) return state.commonBack;
  const card = state.cards[ed.idx];
  return ed.side === "front" ? card.front : card.back;
}
function openEditor(idx, side){
  const s = edSnap(idx);
  ed = {idx, side, orig:s, cur:s, hist:[], pend:null, t:0}; $("editor").classList.add("on"); renderEditor();
}
/* Deshacer del editor: un paso por cada cambio (un arrastre o un pellizco cuenta como uno solo) */
function edTrack(){
  const s = edSnap(ed.idx);
  if (s === ed.cur) return;
  if (ed.pend === null) ed.pend = ed.cur;
  ed.cur = s;
  clearTimeout(ed.t);
  const e0 = ed;
  ed.t = setTimeout(() => { if (e0.pend !== null){ e0.hist.push(e0.pend); if (e0.hist.length > 60) e0.hist.shift(); e0.pend = null; } edButtons(); }, 450);
}
function edRestore(snap){
  const o = JSON.parse(snap);
  if (ed.idx < 0) state.commonBack = o.common;
  else { const c = state.cards[ed.idx]; c.front = o.front; c.back = o.back; }
  ed.cur = snap; adjUI.sync(); scheduleGrid(); renderEditor();
}
function edUndo(){
  if (!ed) return;
  clearTimeout(ed.t);
  const target = ed.pend !== null ? ed.pend : ed.hist.pop();
  ed.pend = null;
  if (!target){ toast("No hay nada para deshacer en esta tarjeta."); edButtons(); return; }
  edRestore(target);
}
function edButtons(){
  if (!ed) return;
  $("edUndo").disabled = ed.pend === null && !ed.hist.length;
}
function edCancel(){
  if (!ed) return;
  clearTimeout(ed.t);
  const changed = edChanged();
  if (changed) edRestore(ed.orig);
  closeEditor();
  if (changed) toast("Cancelado: la tarjeta quedó como estaba.");
}
$("edUndo").onclick = edUndo;
$("edMoreBtn").onclick = () => { const on = $("edMoreBtn").getAttribute("aria-expanded") !== "true"; $("edMoreBtn").setAttribute("aria-expanded", on); $("edMoreBtn").textContent = on ? "Menos herramientas" : "Más herramientas"; renderEditor(); };
$("edCancel").onclick = edCancel;
// cómo estaba la tarjeta (o el dorso común) al abrir el editor, para poder volver atrás
function edSnap(idx){
  const c = idx < 0 ? null : state.cards[idx];
  return JSON.stringify(idx < 0 ? {common:state.commonBack} : {id:c.id, front:c.front, back:c.back});
}
function edChanged(){ return !!ed && ed.idx < state.cards.length && edSnap(ed.idx) !== ed.orig; }
function closeEditor(){ if (ed) clearTimeout(ed.t); $("editor").classList.remove("on"); ed = null; releaseFull(); renderAll(); }
$("edClose").onclick = closeEditor;
$("editor").addEventListener("click", e => { if (e.target.id === "editor") closeEditor(); });
function renderEditor(){
  if (!ed) return;
  const common = ed.idx < 0;
  $("edTitle").textContent = common ? "Parte de atrás de todas" : `Tarjeta #${ed.idx+1}`;
  $("edSideSeg").style.display = common ? "none" : "";
  if (!common) seg($("edSideSeg"), [{id:"front", label:"Frente"}, {id:"back", label:"Atrás"}], () => ed.side, v => { ed.side = v; renderEditor(); });
  const card = common ? null : state.cards[ed.idx];
  const choice = $("edBackChoice");
  if (!common && ed.side === "back"){
    choice.style.display = "";
    seg(choice, [{id:"common", label:"La de todas"}, {id:"own", label:"Una propia (firma, etc.)"}],
      () => card.back ? "own" : "common",
      v => { if (v === "common"){ card.back = null; renderEditor(); } else pickOne(ref => { card.back = ref; renderEditor(); }); });
  } else choice.style.display = "none";
  const ref = edRef();
  $("edMoreBtn").parentElement.style.display = ref ? "" : "none";
  $("edMore").hidden = !ref || $("edMoreBtn").getAttribute("aria-expanded") !== "true";
  $("edGrid").classList.toggle("more", !$("edMore").hidden);
  edTrack(); edButtons();
  $("edZoom").style.display = ref ? "" : "none";
  $("edHint").hidden = !ref;
  $("edHint").textContent = matchMedia("(pointer: coarse)").matches ? "Mové la foto con el dedo. Con dos dedos, o con + y −, la agrandás o achicás." : "Arrastrá la foto para moverla. Con + y −, o con la rueda del mouse, la agrandás o achicás.";
  const cv = $("edCanvas"), sz = size(), dpr = devicePixelRatio || 1;
  cv.style.aspectRatio = `${sz.w}/${sz.h}`;
  const W = Math.round((cv.clientWidth || 250)*dpr), H = Math.round(W*sz.h/sz.w);
  if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
  const ctx = cv.getContext("2d"), R = {x:0, y:0, w:W, h:H};
  ctx.clearRect(0,0,W,H);
  if (common) drawRef(ctx, state.commonBack, R); else drawFace(ctx, card, ed.side, R, R, ed.idx);
  $("adjDet").hidden = !ref; adjUI.sync();
  const d = ref ? dpiOf(ref) : Infinity;
  $("edRes").textContent = d < LOW_DPI ? "⚠ Puede verse borrosa al imprimir. Probá achicarla o usar una foto más grande." : "";
  $("edRes").title = isFinite(d) ? `${Math.round(d)} ppp al imprimir (conviene 150 o más)` : "";
  $("edRes").classList.toggle("lowres", d < LOW_DPI);
  const miss = [ref, common ? null : card.front, common ? null : card.back].filter(Boolean).map(r => r.photoId).filter(needsFull);
  if (miss.length) ensureFull(miss).then(() => { if (ed) renderEditor(); });
}
document.querySelectorAll("#editor .tools").forEach(t => t.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"), act = b && b.dataset.act; if (!act || !ed) return;
  const ref = edRef(), cards = state.cards, i = ed.idx;
  if (act === "change"){
    pickOne(nr => {
      if (i < 0) state.commonBack = nr;
      else if (ed.side === "front") cards[i].front = nr; else cards[i].back = nr;
      renderEditor();
    });
    return;
  }
  if (act === "key" && ref){
    openKey(ref, nr => {
      if (i < 0) state.commonBack = nr;
      else if (ed.side === "front") cards[i].front = nr; else cards[i].back = nr;
      renderEditor();
    });
    return;
  }
  if (act === "rotate" && ref){ ref.rot = ((ref.rot||0) + 90) % 360; ref.fx = .5; ref.fy = .5; }
  if (act === "zin" && ref) ref.zoom = Math.min(4, (ref.zoom||1)*1.15);
  if (act === "zout" && ref) ref.zoom = Math.max(0.3, (ref.zoom||1)/1.15);
  if (act === "reset" && ref){ ref.zoom = 1; ref.fx = .5; ref.fy = .5; }
  renderEditor();
}));
/* brillo, contraste y sombras de la imagen que se está editando */
const adjUI = MFC.adjustPanel($("adjBox"), {
  get: () => (ed && edRef()) ? edRef().adj || null : null,
  set: a => { const r = ed && edRef(); if (r){ r.adj = a; renderEditor(); } },
  end: () => scheduleGrid(),
  reset: () => { const r = ed && edRef(); if (r){ r.adj = null; renderEditor(); scheduleGrid(); } },
  all: () => {
    const r = ed && edRef(); if (!r) return;
    if (ed.idx < 0){ toast("El dorso de la colección ya es uno solo para todas."); return; }
    const side = ed.side; let k = 0;
    state.cards.forEach(c => { const o = side === "front" ? c.front : c.back; if (o){ o.adj = r.adj ? {...r.adj} : null; k++; } });
    renderEditor(); scheduleGrid();
    toast(r.adj ? `Mismo ajuste en ${k} ${side === "front" ? "frentes" : "dorsos propios"}.` : `Ajustes quitados de ${k} ${side === "front" ? "frentes" : "dorsos propios"}.`);
  }
});
let drag = null, pinch = null;
const edCv = $("edCanvas"), fingers = new Map();
const ZMIN = 0.3, ZMAX = 4, clampZ = z => Math.min(ZMAX, Math.max(ZMIN, z));
const span = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
edCv.addEventListener("pointerdown", e => {
  if (!ed || !edRef()) return;
  fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  try { edCv.setPointerCapture(e.pointerId); } catch(_){}
  if (fingers.size === 2){ drag = null; pinch = {d:span(), z:edRef().zoom || 1}; }
  else if (fingers.size === 1) drag = {x:e.clientX, y:e.clientY};
});
edCv.addEventListener("pointermove", e => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  const ref = edRef(); if (!ref) return;
  if (pinch && fingers.size >= 2){ ref.zoom = clampZ(pinch.z * span() / pinch.d); renderEditor(); return; }
  if (!drag) return;
  const r = edCv.getBoundingClientRect(), g = geom(ref, r.width, r.height);
  if (Math.abs(g.ex) > 0.5) ref.fx = Math.min(1, Math.max(0, ref.fx - (e.clientX-drag.x)/g.ex));
  if (Math.abs(g.ey) > 0.5) ref.fy = Math.min(1, Math.max(0, ref.fy - (e.clientY-drag.y)/g.ey));
  drag = {x:e.clientX, y:e.clientY}; renderEditor();
});
const lift = e => {
  fingers.delete(e.pointerId);
  if (fingers.size < 2) pinch = null;
  // al levantar un dedo de los dos se sigue arrastrando con el otro, sin saltos
  if (fingers.size === 1){ const [p] = fingers.values(); drag = {x:p.x, y:p.y}; } else drag = null;
};
edCv.addEventListener("pointerup", lift);
edCv.addEventListener("pointercancel", lift);
edCv.addEventListener("wheel", e => {
  const ref = ed && edRef(); if (!ref) return;
  e.preventDefault();
  ref.zoom = clampZ((ref.zoom || 1) * Math.exp(-e.deltaY * 0.0015)); renderEditor();
}, {passive:false});
// Safari del iPhone: que el pellizco sobre la tarjeta no agrande la página entera
["gesturestart", "gesturechange"].forEach(t => document.addEventListener(t, e => { if (e.target && e.target.closest && e.target.closest("#edCanvas")) e.preventDefault(); }, {passive:false}));
