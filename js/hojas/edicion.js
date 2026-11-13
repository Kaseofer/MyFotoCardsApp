/* Hojas de fotos · editar en la hoja
   Mover e intercambiar fotos, la barra de la foto elegida y los toques/arrastres sobre la hoja. */

/* ---------- mover / intercambiar ---------- */
function cancelMove(){ state.moving = -1; updateToolbar(); draw(); }
$("moveCancel").onclick = cancelMove;
function doSwap(to){
  const from = state.moving;
  const a = slot(from), b = slot(to);
  pushUndo();
  state.slots[to] = a; state.slots[from] = b;
  state.moving = -1; state.sel = to;
  const fromPage = pageOf(from) + 1;
  state.flash = [to];
  updateToolbar(); draw();
  setTimeout(() => { state.flash = []; draw(); }, 500);
  say(b ? `Intercambiada con la foto de la hoja ${fromPage}.` : "Foto movida.");
}

/* ---------- barra de la foto ---------- */
function fmtDate(d){ const m = d.match(/^(\d{4}):(\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; }
function updateToolbar(){
  const s = state.moving < 0 && state.sel >= 0 ? slot(state.sel) : null;
  $("toolbar").classList.toggle("on", !!s);
  // Con una foto elegida, arrastrar sobre la hoja la encuadra; si no, el dedo desplaza la página
  preview.classList.toggle("grab", !!s);
  if (!s) return;
  const cap = $("caption");
  if (document.activeElement !== cap) cap.value = s.caption || "";
  cap.parentElement.style.display = state.captions ? "" : "none";
  $("capPosOne").value = s.pos || "";
  const lines = [s.date ? "Fecha guardada en la foto: " + fmtDate(s.date) : "Esta foto no tiene fecha guardada (pasa seguido con fotos de WhatsApp o capturas)."];
  if (s.place) lines.push("Lugar: " + s.place);
  else if (s.gps && usesPlace()) lines.push("Buscando el lugar…");
  else if (!s.gps && usesPlace()) lines.push("Esta foto no tiene ubicación guardada.");
  $("dateInfo").textContent = lines.join(" · ");
  adjUI.sync();
  // resolución con la que va a salir impresa
  const li = state.sel - pageStart(state.page), cell = cells()[li];
  const ri = $("resInfo");
  if (cell){
    const dpi = Math.round(dpiOf(s, cell)), low = dpi < LOW_DPI;
    ri.textContent = low
      ? `⚠ Calidad de impresión baja (${dpi} ppp): se puede ver pixelada. ${s.zoom > 1 ? "Alejala, usá" : "Usá"} un tamaño más chico o una foto con más resolución.`
      : `Calidad de impresión: ${dpi >= 250 ? "muy buena" : "buena"} (${dpi} ppp).`;
    ri.classList.toggle("warn", low);
  } else ri.textContent = "";
}
/* brillo, contraste y sombras de la foto elegida */
const adjUI = MFC.adjustPanel($("adjBox"), {
  get: () => slot(state.sel)?.adj || null,
  begin: () => pushUndo(),
  set: a => { const s = slot(state.sel); if (s){ s.adj = a; draw("page"); } },
  end: () => draw(),
  reset: () => { const s = slot(state.sel); if (s && s.adj){ pushUndo(); s.adj = null; draw(); } },
  all: () => {
    const s = slot(state.sel); if (!s) return;
    pushUndo();
    let k = 0; state.slots.forEach(o => { if (o){ o.adj = s.adj ? {...s.adj} : null; k++; } });
    draw(); say(s.adj ? `Mismo brillo, contraste y sombras en las ${k} fotos.` : `Se quitaron los ajustes de las ${k} fotos.`);
  }
});
$("caption").addEventListener("focus", () => { if (slot(state.sel)) pushUndo(); });
$("caption").addEventListener("input", e => { const s = slot(state.sel); if (s){ s.caption = e.target.value; s.autoCap = false; draw("page"); } });
$("capPosOne").addEventListener("change", e => { const s = slot(state.sel); if (s){ pushUndo(); s.pos = e.target.value || null; draw("page"); } });
$("toolbar").onclick = e => {
  const act = e.target.dataset.act; if (!act) return;
  const s = slot(state.sel); if (!s) return;
  if (act === "move"){ state.moving = state.sel; updateToolbar(); draw(); return; }
  if (act === "change"){ targetIndex = state.sel; $("fileOne").click(); return; }
  pushUndo();
  if (act === "rotate"){ s.rot = ((s.rot||0) + 90) % 360; s.fx = .5; s.fy = .5; }
  if (act === "zin") s.zoom = Math.min(4, s.zoom*1.15);
  if (act === "zout") s.zoom = Math.max(1, s.zoom/1.15);
  if (act === "reset"){ s.zoom = 1; s.fx = .5; s.fy = .5; }
  if (act === "remove"){ state.slots[state.sel] = null; state.sel = -1; }
  updateToolbar(); draw();
};

/* ---------- toque y arrastre en la hoja ---------- */
let drag = null;
function hit(ev){
  const r = preview.getBoundingClientRect();
  const P = paper(), mx = (ev.clientX - r.left) / r.width * P.w, my = (ev.clientY - r.top) / r.height * P.h;
  const li = cells().findIndex(c => mx >= c.x && mx <= c.x+c.w && my >= c.y && my <= c.y+c.h);
  return li < 0 ? -1 : pageStart(state.page) + li;
}
preview.addEventListener("pointerdown", ev => {
  const gi = hit(ev);
  if (gi < 0){ if (state.moving < 0){ state.sel = -1; updateToolbar(); draw(); } return; }
  drag = {gi, x:ev.clientX, y:ev.clientY, moved:false};
  try { preview.setPointerCapture(ev.pointerId); } catch(_){}
});
preview.addEventListener("pointermove", ev => {
  if (!drag || state.moving >= 0) return;
  // En pantallas táctiles solo se encuadra la foto ya elegida; con el mouse, cualquiera
  if (ev.pointerType !== "mouse" && drag.gi !== state.sel) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  const sl = slot(drag.gi); if (!sl) return;
  if (!drag.moved) pushUndo();
  drag.moved = true;
  state.sel = drag.gi;
  const r = preview.getBoundingClientRect(), s = r.width / paper().w;
  const g = geom(sl, photoRect(cells()[drag.gi - pageStart(state.page)]), s);
  if (g.ex > 0) sl.fx = Math.min(1, Math.max(0, sl.fx - dx/g.ex));
  if (g.ey > 0) sl.fy = Math.min(1, Math.max(0, sl.fy - dy/g.ey));
  drag.x = ev.clientX; drag.y = ev.clientY;
  updateToolbar(); draw("page");
});
preview.addEventListener("pointerup", () => {
  if (drag && !drag.moved){
    const gi = drag.gi;
    if (state.moving >= 0){ if (gi !== state.moving) doSwap(gi); else cancelMove(); }
    else if (!slot(gi)){ targetIndex = gi; $("fileOne").click(); }
    else { state.sel = (state.sel === gi ? -1 : gi); updateToolbar(); draw(); }
  }
  drag = null;
});
preview.addEventListener("pointercancel", () => drag = null);
