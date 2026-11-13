/* Luli's Photocards · la colección
   Cargar fotos (loadImage las achica a 1500 px), las pestañas Mis fotos / Decorar / Terminar,
   la grilla de tarjetas con sus botones (dar vuelta, editar, ⋯, borrar), selección y
   ordenar arrastrando. También «Deshacer / Volver a como estaba» de Decorar. */

/* ---------- carga de imágenes ---------- */
async function loadImage(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1500 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const alpha = /png|webp|gif/i.test(file.type || file.name) && hasAlpha(c);
    const blob = await new Promise(r => alpha ? c.toBlob(r, "image/png") : c.toBlob(r, "image/jpeg", 0.9));
    const id = newId("f");
    addPhoto(id, c, blob, alpha);
    return {photoId:id, fx:.5, fy:.5, zoom:1, rot:0};
  } finally { URL.revokeObjectURL(url); }
}
const isImage = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name);
async function addFronts(list){
  const files = [...list].filter(isImage).sort((a,b) => a.name.localeCompare(b.name, "es", {numeric:true}));
  if (!files.length){ toast("No encontré imágenes."); return; }
  let ok = 0;
  for (let i = 0; i < files.length; i++){
    toast(`Cargando ${i+1} de ${files.length}…`, 60000);
    try { state.cards.push({id:newId("c"), front: await loadImage(files[i]), back:null}); ok++; } catch(_){}
    await new Promise(r => setTimeout(r, 0));
  }
  renderAll();
  toast(`${ok} ${ok === 1 ? "tarjeta agregada" : "tarjetas agregadas"}.`);
}
function pickFronts(){ $("fileMulti").click(); }
$("addBtn").onclick = pickFronts; $("dockAdd").onclick = pickFronts; $("heroAdd").onclick = pickFronts;
/* «Más opciones»: lo que no hace falta para la primera tarjeta queda guardado acá */
const LS_MORE = "lpc-mas-opciones";
function setMore(on){ $("moreTools").hidden = !on; $("moreBtn").setAttribute("aria-expanded", on); MFC.remember(LS_MORE, on ? "1" : ""); }
$("moreBtn").onclick = () => setMore($("moreTools").hidden);
if (MFC.recall(LS_MORE) === "1") setMore(true);
$("folderBtn").onclick = () => $("fileFolder").click();
$("fileMulti").onchange = e => addFronts(e.target.files).finally(() => e.target.value = "");
$("fileFolder").onchange = e => addFronts(e.target.files).finally(() => e.target.value = "");
let onePick = null;
function pickOne(cb){ onePick = cb; $("fileOne").click(); }
$("fileOne").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f || !onePick) return;
  try { const ref = await loadImage(f); onePick(ref); } catch(_){ toast("No se pudo abrir esa imagen."); }
  onePick = null; renderAll();
};

/* ---------- pestañas ---------- */
/* Decorar: lo que se cambia acá se puede deshacer de a un paso o volver todo a como estaba al entrar */
const BACK_KEYS = ["backMode","backColor","backTextColor","backText","backText2","backNumber","pattern","patternColor","patternAlpha","frame","plate","font","logoSize","logo2Size","logoPos","logo2Pos","textPos","logoTint","logoTintColor","logo2Tint","logo2TintColor","logoStroke","logoStrokeColor","logoStrokeW","logo2Stroke","logo2StrokeColor","logo2StrokeW","logo","logo2","commonBack"];
const backSig = () => JSON.stringify(BACK_KEYS.map(k => state[k] ?? null));
let backStart = null; // {pid, sig, vals}
function markBackStart(){
  if (!proj) return;
  backStart = {pid:proj.id, sig:backSig(), vals:JSON.parse(JSON.stringify(Object.fromEntries(BACK_KEYS.map(k => [k, state[k] ?? null]))))};
  backButtons();
}
function backButtons(){
  if (!$("backUndo")) return;
  const changed = !!backStart && proj && backStart.pid === proj.id && backSig() !== backStart.sig;
  $("backRevert").disabled = !changed;
  $("backUndo").disabled = !changed;
}
$("backUndo").onclick = () => { undo(); backButtons(); };
$("backRevert").onclick = () => {
  if (!backStart || !proj || backStart.pid !== proj.id) return;
  Object.assign(state, JSON.parse(JSON.stringify(backStart.vals)));
  syncInputs(); renderBackTab(); scheduleGrid(); backButtons();
  toast("Listo: la parte de atrás volvió a como estaba.");
};
function setTab(tab){
  if (tab === "back" && state.tab !== "back") markBackStart();
  state.tab = tab;
  document.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === tab));
  ["col","back","print"].forEach(t => $("tab-"+t).hidden = t !== state.tab);
  renderAll();
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
$("goPrintBtn").onclick = () => { setTab("print"); window.scrollTo({top:0, behavior:reduceMotion ? "auto" : "smooth"}); };
/* la barra de abajo muestra la acción que corresponde a este momento:
   sin tarjetas, elegir fotos; con tarjetas, preparar la impresión; en Imprimir, el PDF */
function updateDock(){
  const has = state.cards.length > 0, printing = state.tab === "print";
  $("dockAdd").textContent = has ? "Agregar fotos" : "Elegí tus fotos";
  $("dockAdd").classList.toggle("primary", !has);
  $("goPrintBtn").hidden = !has || printing;
  $("pdfBtn").hidden = !has || !printing;
  $("sharePdfBtn").hidden = !canShareFiles() || !has || !printing;
}

/* ---------- colección ---------- */
function faceCanvas(cv, card, side, idx, widthPx){
  const sz = size(), dpr = devicePixelRatio || 1;
  const W = Math.round(widthPx*dpr), H = Math.round(W*sz.h/sz.w);
  if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
  const ctx = cv.getContext("2d"), R = {x:0, y:0, w:W, h:H};
  ctx.clearRect(0, 0, W, H);
  drawFace(ctx, card, side, R, R, idx);
}
function renderGrid(){
  const grid = $("grid"), sz = size();
  const has = state.cards.length > 0;
  $("emptyCol").hidden = has;
  $("addBtn").hidden = !has; $("flipAllBtn").hidden = !has; $("sortModeBtn").hidden = !has && !sorting;
  $("flipAllBtn").textContent = state.allFlipped ? "Ver el frente" : "Ver la parte de atrás";
  updateSelBar();
  while (grid.children.length > state.cards.length) grid.lastChild.remove();
  state.cards.forEach((card, i) => {
    let el = grid.children[i];
    if (!el){
      el = document.createElement("div"); el.className = "pc";
      el.innerHTML = '<button class="pc-del" aria-label="Borrar tarjeta">×</button><span class="pc-check" aria-hidden="true">✓</span><button class="pc-flip" aria-label="Dar vuelta"><div class="pc-inner"><canvas class="f"></canvas><canvas class="b"></canvas></div></button><div class="pc-meta"><span></span><span class="pc-acts"><button class="pc-edit">Editar</button><button class="pc-more" aria-label="Más acciones de esta tarjeta" aria-haspopup="menu" title="Duplicar, mover o eliminar">⋯</button></span></div>';
      el.querySelector(".pc-flip").onclick = () => {
        if (Date.now() - lastDragEnd < 350) return;
        if (state.selecting){
          const id = state.cards[+el.dataset.i].id;
          if (state.picked.has(id)) state.picked.delete(id); else state.picked.add(id);
          renderGrid();
        } else el.classList.toggle("flipped");
      };
      const del = el.querySelector(".pc-del");
      del.onclick = () => {
        if (!del.classList.contains("armed")){
          del.classList.add("armed"); del.textContent = "¿Borrar?";
          clearTimeout(del._t); del._t = setTimeout(() => { del.classList.remove("armed"); del.textContent = "×"; }, 3000);
          return;
        }
        clearTimeout(del._t); del.classList.remove("armed"); del.textContent = "×";
        deleteCards(new Set([state.cards[+el.dataset.i].id]));
      };
      el.querySelector(".pc-edit").onclick = () => openEditor(+el.dataset.i, el.classList.contains("flipped") ? "back" : "front");
      el.querySelector(".pc-more").onclick = e => openCardMenu(+el.dataset.i, e.currentTarget);
      grid.appendChild(el);
    }
    el.dataset.i = i;
    el.classList.toggle("flipped", state.allFlipped);
    el.classList.toggle("selmode", state.selecting);
    el.classList.toggle("picked", state.selecting && state.picked.has(card.id));
    el.querySelector(".pc-inner").style.aspectRatio = `${sz.w}/${sz.h}`;
    const low = card.front && dpiOf(card.front) < LOW_DPI, meta = el.querySelector(".pc-meta span");
    meta.textContent = `#${i+1}${card.back ? " · dorso propio" : ""}`;
    if (low){ const w = document.createElement("span"); w.className = "lowres"; w.textContent = " · ⚠ puede verse borrosa"; w.title = `Sale impresa a ${Math.round(dpiOf(card.front))} ppp: se puede ver pixelada`; meta.appendChild(w); }
    const w = el.clientWidth || 140;
    faceCanvas(el.querySelector("canvas.f"), card, "front", i, w);
    faceCanvas(el.querySelector("canvas.b"), card, "back", i, w);
  });
}
/* acciones de la tarjeta (fuera del editor, así «Cancelar» del editor solo toca la imagen) */
let menuIdx = -1, menuFrom = null;
function openCardMenu(i, btn){
  const m = $("cardMenu"); menuIdx = i; menuFrom = btn;
  m.querySelector('[data-c="left"]').disabled = i === 0;
  m.querySelector('[data-c="right"]').disabled = i >= state.cards.length - 1;
  const del = m.querySelector('[data-c="del"]'); delete del.dataset.armed; del.textContent = "Eliminar";
  m.hidden = false;
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
  m.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  btn.setAttribute("aria-expanded", "true");
  m.querySelector("button:not(:disabled)").focus();
}
function closeCardMenu(back){
  const m = $("cardMenu"); if (m.hidden) return;
  m.hidden = true; if (menuFrom){ menuFrom.setAttribute("aria-expanded", "false"); if (back) menuFrom.focus(); }
  menuIdx = -1; menuFrom = null;
}
$("cardMenu").addEventListener("click", e => {
  const b = e.target.closest("[data-c]"); if (!b || menuIdx < 0) return;
  const i = menuIdx, cards = state.cards, c = b.dataset.c;
  if (c === "del" && !b.dataset.armed){ b.dataset.armed = "1"; b.textContent = "¿Seguro? Tocá de nuevo"; return; }
  closeCardMenu(false);
  if (c === "dup"){ const copy = r => r ? {...r} : null; cards.splice(i+1, 0, {id:newId("c"), front:copy(cards[i].front), back:copy(cards[i].back)}); renderGrid(); toast("Tarjeta duplicada."); }
  if (c === "left" && i > 0){ [cards[i-1], cards[i]] = [cards[i], cards[i-1]]; renderGrid(); toast(`Tarjeta movida al lugar #${i}.`); }
  if (c === "right" && i < cards.length-1){ [cards[i+1], cards[i]] = [cards[i], cards[i+1]]; renderGrid(); toast(`Tarjeta movida al lugar #${i+2}.`); }
  if (c === "del") deleteCards(new Set([cards[i].id]));
});
document.addEventListener("pointerdown", e => { if (!$("cardMenu").hidden && !e.target.closest("#cardMenu") && !e.target.closest(".pc-more")) closeCardMenu(false); });
window.addEventListener("scroll", () => closeCardMenu(false), {passive:true});
$("flipAllBtn").onclick = () => { state.allFlipped = !state.allFlipped; renderGrid(); };
function updateSelBar(){
  $("selBar").hidden = !state.selecting;
  $("selModeBtn").hidden = state.selecting || !state.cards.length;
  const k = state.picked.size;
  $("selCount").textContent = k ? `${k} ${k === 1 ? "seleccionada" : "seleccionadas"}` : "Tocá las tarjetas para elegirlas";
  $("selDelete").disabled = !k;
  $("selAll").textContent = k === state.cards.length && k ? "Quitar selección" : "Seleccionar todas";
}
function deleteCards(ids){
  const removed = [];
  state.cards = state.cards.filter((c, i) => { if (ids.has(c.id)){ removed.push({c, i}); return false; } return true; });
  if (!removed.length) return;
  lastDeleted = removed;
  state.picked.clear(); state.selecting = false;
  renderAll();
  toast(`${removed.length} ${removed.length === 1 ? "tarjeta borrada" : "tarjetas borradas"}. Podés recuperarlas con Deshacer.`, 3500);
}
$("selModeBtn").onclick = () => { setSorting(false); state.selecting = true; state.picked.clear(); renderGrid(); };
$("selCancel").onclick = () => { state.selecting = false; state.picked.clear(); renderGrid(); };
$("selAll").onclick = () => {
  if (state.picked.size === state.cards.length) state.picked.clear();
  else state.cards.forEach(c => state.picked.add(c.id));
  renderGrid();
};
$("selDelete").onclick = () => deleteCards(new Set(state.picked));

/* ---------- ordenar arrastrando ----------
   Con mouse se puede arrastrar siempre; en el teléfono, después de tocar «Ordenar»
   (así el dedo sigue sirviendo para desplazar la página). */
let lastDragEnd = 0, sorting = false, sdrag = null;
function setSorting(on){
  sorting = on;
  $("grid").classList.toggle("sorting", on);
  $("sortModeBtn").setAttribute("aria-pressed", on);
  $("sortModeBtn").textContent = on ? "Listo" : "Ordenar";
  $("sortHint").hidden = !on;
  if (on){ state.allFlipped = false; state.selecting = false; state.picked.clear(); renderGrid(); }
}
$("sortModeBtn").onclick = () => setSorting(!sorting);
function dropTarget(x, y){
  const kids = [...$("grid").querySelectorAll(":scope > .pc")];
  let best = null, bd = Infinity;
  kids.forEach((el, i) => {
    const r = el.querySelector(".pc-flip").getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const d = Math.hypot((x - cx)/r.width, (y - cy)/r.height*0.6);
    if (d < bd){ bd = d; best = {i, r, after: x > cx}; }
  });
  return best ? {idx: best.i + (best.after ? 1 : 0), r:best.r, after:best.after} : null;
}
function showIndicator(t){
  const grid = $("grid"); let ind = grid.querySelector(".drop-ind");
  if (!t){ if (ind) ind.remove(); return; }
  if (!ind){ ind = document.createElement("div"); ind.className = "drop-ind"; grid.appendChild(ind); }
  const g = grid.getBoundingClientRect();
  ind.style.left = ((t.after ? t.r.right + 7 : t.r.left - 7) - g.left - 2.5) + "px";
  ind.style.top = (t.r.top - g.top) + "px";
  ind.style.height = t.r.height + "px";
}
$("grid").addEventListener("pointerdown", e => {
  const btn = e.target.closest(".pc-flip");
  if (!btn || state.selecting || e.button > 0) return;
  if (e.pointerType !== "mouse" && !sorting) return;
  const el = btn.closest(".pc");
  sdrag = {i:+el.dataset.i, el, x:e.clientX, y:e.clientY, active:false, target:null};
  if (sorting) btn.setPointerCapture(e.pointerId);
});
window.addEventListener("pointermove", e => {
  if (!sdrag) return;
  if (!sdrag.active){
    if (Math.hypot(e.clientX - sdrag.x, e.clientY - sdrag.y) < 6) return;
    sdrag.active = true;
    const src = sdrag.el.querySelector("canvas.f"), r = src.getBoundingClientRect();
    const gh = document.createElement("canvas"); gh.className = "drag-ghost";
    gh.width = src.width; gh.height = src.height; gh.getContext("2d").drawImage(src, 0, 0);
    gh.style.width = r.width*0.85 + "px"; gh.style.height = r.height*0.85 + "px";
    document.body.appendChild(gh);
    sdrag.ghost = gh; sdrag.gw = r.width*0.85; sdrag.gh = r.height*0.85;
    sdrag.el.classList.add("dragging");
  }
  e.preventDefault();
  sdrag.ghost.style.left = (e.clientX - sdrag.gw/2) + "px";
  sdrag.ghost.style.top = (e.clientY - sdrag.gh/2) + "px";
  sdrag.target = dropTarget(e.clientX, e.clientY);
  showIndicator(sdrag.target);
  if (e.clientY < 70) window.scrollBy(0, -14);
  else if (e.clientY > window.innerHeight - 110) window.scrollBy(0, 14);
}, {passive:false});
function endSort(){
  if (!sdrag) return;
  const d = sdrag; sdrag = null;
  if (!d.active) return;
  lastDragEnd = Date.now();
  d.ghost.remove(); d.el.classList.remove("dragging"); showIndicator(null);
  if (!d.target) return;
  let to = d.target.idx; const from = d.i;
  if (to > from) to--;
  if (to === from) return;
  const [card] = state.cards.splice(from, 1);
  state.cards.splice(to, 0, card);
  renderGrid();
  toast(`Tarjeta movida al lugar #${to+1}.`);
}
window.addEventListener("pointerup", endSort);
window.addEventListener("pointercancel", () => { if (sdrag && sdrag.active){ sdrag.ghost.remove(); sdrag.el.classList.remove("dragging"); showIndicator(null); } sdrag = null; });
