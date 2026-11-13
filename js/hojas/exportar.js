/* Hojas de fotos · exportar
   PDF e imágenes listas para imprimir. */

/* ---------- exportación ---------- */
async function pageCanvas(p){
  const hi = new Map();
  for (const sl of pageSlots(p)){
    if (hi.has(sl.id)) continue;
    const f = fullCache.get(sl.id);
    try { hi.set(sl.id, f || await createImageBitmap(sl.blob)); } catch(_){}
  }
  // 300 ppp: A4 vertical = 2480 × 3508 px
  const P = paper(p), c = document.createElement("canvas");
  c.width = Math.round(P.w/25.4*300); c.height = Math.round(P.h/25.4*300);
  render(c.getContext("2d"), c.width/P.w, p, false, hi);
  hi.forEach((b, id) => { if (fullCache.get(id) !== b) b.close(); });
  return c;
}
let downloads = null;
try { window.claude?.use?.("downloads").then(d => downloads = d).catch(() => {}); } catch(_){}
// Fuera de Claude (por ejemplo en GitHub Pages) se descarga con un enlace normal
function saveBlobLocal(blob, name){ MFC.saveBlobLocal(blob, name); } // está en common.js
async function offer(blob, name, previewCanvas){
  if (downloads){
    try { await downloads.save({filename:name, data:blob}); say("Archivo listo."); return; }
    catch(err){ if (err && err.code === "declined") return; }
  }
  if (!window.claude){ saveBlobLocal(blob, name); say("Archivo listo."); return; }
  $("overlayImg").src = previewCanvas.toDataURL("image/jpeg", 0.92);
  $("overlay").classList.add("on");
}
$("jpgBtn").onclick = async () => {
  if (!countOn(state.page)){ say("Esta hoja todavía no tiene fotos."); return; }
  try { await document.fonts.load("500 40px Caveat"); } catch(_){}
  const c = await pageCanvas(state.page);
  c.toBlob(b => offer(b, `hoja-${state.page+1}.jpg`, c), "image/jpeg", 0.95);
};
async function buildPdf(){
  try { await document.fonts.load("500 40px Caveat"); } catch(_){}
  const pages = [...Array(state.pages).keys()].filter(p => countOn(p) > 0);
  const P0 = paper(pages[0] || 0);
  const pdf = new window.jspdf.jsPDF({unit:"mm", format:[P0.w, P0.h], orientation:P0.w > P0.h ? "landscape" : "portrait"});
  let firstCanvas = null;
  try {
    for (let i = 0; i < pages.length; i++){
      statusLock = true; $("status").textContent = `Preparando hoja ${i+1} de ${pages.length}…`;
      await new Promise(r => setTimeout(r, 0));
      const c = await pageCanvas(pages[i]);
      const P = paper(pages[i]);
      if (i > 0) pdf.addPage([P.w, P.h], P.w > P.h ? "landscape" : "portrait");
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, P.w, P.h, undefined, "FAST");
      if (!firstCanvas) firstCanvas = c; else c.width = c.height = 0; // libera memoria (importante en iPhone)
    }
  } finally { statusLock = false; draw(); }
  return {blob: pdf.output("blob"), firstCanvas};
}
function pdfName(){
  const base = ((proj && proj.name) || "hojas-fotos").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-");
  return (base || "hojas-fotos") + ".pdf";
}
$("pdfBtn").onclick = async () => {
  if (!state.slots.some(Boolean)){ say("Agregá al menos una foto para descargar."); return; }
  if (!window.jspdf){ const c = await pageCanvas(state.page); c.toBlob(b => offer(b, `hoja-${state.page+1}.jpg`, c), "image/jpeg", 0.95); return; }
  const {blob, firstCanvas} = await buildPdf();
  offer(blob, pdfName(), firstCanvas);
};

/* compartir el PDF con las apps del teléfono (WhatsApp, mail, Drive…) */
const canShareFiles = (() => {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({files:[new File([""], "x.pdf", {type:"application/pdf"})]})); }
  catch(_){ return false; }
})();
$("sharePdfBtn").hidden = !canShareFiles;
let sharePending = null;
async function sharePdf(file){
  try {
    await navigator.share({files:[file], title:file.name});
    sharePending = null; $("shareReady").hidden = true;
  } catch(err){
    if (err && err.name === "AbortError"){ sharePending = null; $("shareReady").hidden = true; return; } // la persona cerró el menú
    // Si armar el PDF tardó, el navegador pide un toque nuevo antes de compartir
    if (err && err.name === "NotAllowedError"){ sharePending = file; $("shareReady").hidden = false; return; }
    say("No se pudo compartir. Probá con Descargar PDF.", 4000);
  }
}
$("sharePdfBtn").onclick = async () => {
  if (!state.slots.some(Boolean)){ say("Agregá al menos una foto para compartir."); return; }
  if (!window.jspdf){ say("No se pudo cargar el generador de PDF. Revisá la conexión."); return; }
  const {blob} = await buildPdf();
  await sharePdf(new File([blob], pdfName(), {type:"application/pdf"}));
};
$("shareReady").onclick = () => { if (sharePending) sharePdf(sharePending); };
$("overlayClose").onclick = () => $("overlay").classList.remove("on");
