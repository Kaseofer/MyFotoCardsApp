/* Luli's Photocards · PDF, descargar y compartir
   Arma el PDF con jsPDF (frente y dorso alineados para imprimir en doble faz),
   lo descarga o lo comparte (Web Share en el teléfono) y guarda imágenes de las hojas. */

/* ---------- descargas ---------- */
function saveBlobLocal(blob, name){ MFC.saveBlobLocal(blob, name); }
async function deliver(blob, name){ saveBlobLocal(blob, name); toast("Archivo listo."); return true; }
function pageImage(p, side, mode){
  const P = paper(), c = document.createElement("canvas");
  c.width = Math.round(P.w/25.4*300); c.height = Math.round(P.h/25.4*300);
  renderSheet(c.getContext("2d"), c.width/P.w, p, side, mode);
  return c.toDataURL("image/jpeg", 0.92);
}
// Imágenes que usa una hoja de un lado (para cargarlas completas solo mientras se arma esa página)
function sheetIds(p, side){
  const per = perSheet(), out = [];
  state.cards.slice(p*per, (p+1)*per).forEach(c => { const r = side === "front" ? c.front : c.back; if (r) out.push(r.photoId); });
  return out;
}
async function buildPdf(pages){
  const P = paper();
  const pdf = new window.jspdf.jsPDF({unit:"mm", format:[P.w, P.h], orientation:"portrait"});
  try {
    for (let i = 0; i < pages.length; i++){
      toast(`Preparando página ${i+1} de ${pages.length}…`, 60000);
      await new Promise(r => setTimeout(r, 0));
      if (i > 0) pdf.addPage([P.w, P.h], "portrait");
      const [p, side, mode] = pages[i];
      if (mode !== "test") await ensureFull(sheetIds(p, side));
      pdf.addImage(pageImage(p, side, mode), "JPEG", 0, 0, P.w, P.h);
      releaseFull(); // así nunca hay más de una hoja de fotos completas en memoria
    }
  } finally { if (ed) renderEditor(); }
  return pdf.output("blob");
}
function pdfName(){ return (MFC.safeName(proj?.name, "photocards")) + ".pdf"; }
async function makePdf(){
  if (!state.cards.length){ toast("Primero agregá fotos."); return null; }
  if (!window.jspdf){ toast("No se pudo cargar el generador de PDF. Revisá la conexión."); return null; }
  try { await Promise.all(['800 40px "Bricolage Grotesque"', '400 40px "Bricolage Grotesque"', '700 40px "Playfair Display"', '400 40px "Playfair Display"', '700 40px "Caveat"', '500 40px "Caveat"'].map(f => document.fonts.load(f))); } catch(_){}
  const pages = [];
  for (let p = 0; p < sheetCount(); p++){ pages.push([p, "front", "print"]); if (state.withBacks) pages.push([p, "back", "print"]); }
  return await buildPdf(pages);
}
$("pdfBtn").onclick = async () => { const blob = await makePdf(); if (blob) deliver(blob, pdfName()); };
/* compartir el PDF con las apps del teléfono (WhatsApp, mail, Drive…) */
var shareCache;
function canShareFiles(){
  if (shareCache === undefined){
    try { shareCache = !!(navigator.share && navigator.canShare && navigator.canShare({files:[new File([""], "x.pdf", {type:"application/pdf"})]})); }
    catch(_){ shareCache = false; }
  }
  return shareCache;
}
updateDock();
let sharePending = null;
async function sharePdf(file){
  try {
    await navigator.share({files:[file], title:file.name});
    sharePending = null; $("shareReady").hidden = true;
  } catch(err){
    if (err && err.name === "AbortError"){ sharePending = null; $("shareReady").hidden = true; return; }
    // si armar el PDF tardó, el navegador pide un toque nuevo antes de compartir
    if (err && err.name === "NotAllowedError"){ sharePending = file; $("shareReady").hidden = false; toast("El PDF está listo: tocá «compartirlo» en Imprimir.", 3500); return; }
    toast("No se pudo compartir. Probá con Descargar PDF.", 3500);
  }
}
$("sharePdfBtn").onclick = async () => { const blob = await makePdf(); if (blob) await sharePdf(new File([blob], pdfName(), {type:"application/pdf"})); };
$("shareReady").onclick = () => { if (sharePending) sharePdf(sharePending); };
$("testBtn").onclick = async () => {
  if (!window.jspdf){ toast("No se pudo cargar el generador de PDF."); return; }
  deliver(await buildPdf([[0, "front", "test"], [0, "back", "test"]]), "hoja-de-prueba-photocards.pdf");
};
