/* Luli's Photocards · pestaña Terminar
   Opciones de impresión (tamaño de tarjeta, papel, márgenes para cortar, marcas, dorsos)
   y renderAll(), que vuelve a dibujar todo lo que está a la vista después de un cambio grande.
   El PDF en sí se arma en descargas.js. */

/* ---------- imprimir ---------- */
function renderPrintTab(){
  seg($("paperSeg"), PAPERS, () => state.paper, v => { state.paper = v; state.page = 0; });
  seg($("sizeSeg"), SIZES, () => state.size, v => { state.size = v; state.page = 0; });
  const per = perSheet(), n = sheetCount();
  const szi = size();
  let info = `Cada tarjeta mide ${String(szi.w).replace(".", ",")} × ${szi.h} mm. Entran ${per} por hoja ${paper().label}.`;
  if (!state.shared){ state.shared = true; const alt = perSheet(); state.shared = false; if (alt > per) info += ` Con cortes compartidos entran ${alt}.`; }
  $("sizeInfo").textContent = info;
  $("printSummary").textContent = state.cards.length
    ? `${state.cards.length} ${state.cards.length === 1 ? "tarjeta" : "tarjetas"} de ${String(szi.w).replace(".", ",")} × ${szi.h} mm en hoja ${paper().label}: entran ${per} por hoja.`
    : `Tarjetas de ${String(szi.w).replace(".", ",")} × ${szi.h} mm en hoja ${paper().label}.`;
  state.page = Math.min(state.page, n-1);
  seg($("sideSeg"), [{id:"front", label:"Frente"}, {id:"back", label:"Parte de atrás"}], () => state.side, v => state.side = v);
  $("sideSeg").style.display = state.withBacks ? "" : "none";
  if (!state.withBacks) state.side = "front";
  $("pnum").textContent = `Hoja ${state.page+1} de ${n}`;
  $("prevBtn").disabled = state.page === 0; $("nextBtn").disabled = state.page >= n-1;
  const pages = state.withBacks ? n*2 : n;
  $("pdfInfo").textContent = state.cards.length
    ? `${state.cards.length} tarjetas en ${n} ${n === 1 ? "hoja" : "hojas"}. El PDF tiene ${pages} ${pages === 1 ? "página" : "páginas"}${state.withBacks ? ", alternando frente y dorso" : ""}.`
    : "Agregá fotos en «Mis fotos» para ver la hoja.";
  const low = state.cards.filter(c => c.front && dpiOf(c.front) < LOW_DPI).length;
  if (low){ const w = document.createElement("span"); w.className = "lowres"; w.textContent = ` ⚠ ${low} ${low === 1 ? "tarjeta puede verse borrosa" : "tarjetas pueden verse borrosas"} al imprimir (están marcadas con !). Se imprime igual.`; $("pdfInfo").appendChild(w); }
  const cv = $("sheet"), dpr = devicePixelRatio || 1, W = Math.round((cv.clientWidth || 360)*dpr), H = Math.round(W*paper().h/paper().w);
  cv.style.aspectRatio = `${paper().w}/${paper().h}`;
  if (cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
  renderSheet(cv.getContext("2d"), W/paper().w, state.page, state.side, "ui");
}
$("prevBtn").onclick = () => { state.page--; renderPrintTab(); };
$("sizeToggle").onclick = () => { const on = $("sizeBox").hidden; $("sizeBox").hidden = !on; $("sizeToggle").setAttribute("aria-expanded", on); $("sizeToggle").textContent = on ? "Ocultar tamaños" : "Cambiar tamaño"; };
$("nextBtn").onclick = () => { state.page++; renderPrintTab(); };
["withBacks","bleed","marks","rotBack","shared"].forEach(k => $(k).onchange = e => { state[k] = e.target.checked; renderAll(); });

function renderAll(){
  updateDock();
  if (state.tab === "col") renderGrid();
  if (state.tab === "back") renderBackTab();
  if (state.tab === "print") renderPrintTab();
}
window.addEventListener("resize", () => renderAll());
