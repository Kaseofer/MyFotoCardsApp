/* Luli's Photocards · base
   Medidas de papel y de tarjeta, el estado de la colección abierta (`state`),
   las fotos en memoria (`photos`: miniatura + Blob, y la imagen completa solo cuando hace falta)
   y utilidades chicas que usan todos los demás archivos: $, toast, newId, size, dpiOf. */

// Medidas en mm (siempre vertical)
const PAPERS = [{id:"a4", w:210, h:297, label:"A4"}, {id:"carta", w:215.9, h:279.4, label:"Carta"}];
const paper = () => PAPERS.find(p => p.id === state.paper) || PAPERS[0];
const LOW_DPI = 150; // por debajo de esto la foto impresa se puede ver pixelada
const SIZES = [
  {id:"std", w:55, h:85, label:"Estándar 55×85 mm"},
  {id:"big", w:63, h:88, label:"Póker 63×88 mm"},
  {id:"naipe", w:61.5, h:95, label:"Naipe español 61,5×95 mm"},
  {id:"mini", w:44, h:68, label:"Mini 44×68 mm"}
];
const state = {
  paper:"a4", size:"std", shared:false, bleed:true, marks:true, withBacks:true, rotBack:false,
  backMode:"design", backColor:"#f6d3e4", backTextColor:"#5b2140", backText:"", backText2:"", backNumber:true,
  pattern:"naipe", patternColor:"#5b2140", patternAlpha:0.55, frame:true, plate:true, font:"Bricolage Grotesque", logoSize:0.5, logo:null,
  logo2:null, logo2Size:0.4, logoPos:null, logo2Pos:null, textPos:null, logoTint:false, logoTintColor:"#ffffff", logo2Tint:false, logo2TintColor:"#ffffff",
  logoStroke:false, logoStrokeColor:"#000000", logoStrokeW:0.025, logo2Stroke:false, logo2StrokeColor:"#000000", logo2StrokeW:0.025,
  commonBack:null, cards:[], tab:"col", side:"front", page:0, allFlipped:false,
  selecting:false, picked:new Set()
};
let lastDeleted = null;
// id -> {src: miniatura (o la imagen completa en logos y dorso común), blob, saved, alpha, w, h: tamaño real}
const photos = new Map();
const THUMB = 560, FULL_CAP = 40;
const fullCache = new Map(); // id -> imagen completa decodificada (se usa al imprimir y en el editor)
const fullLoading = new Set(), fullFailed = new Set();
function thumbOf(src){
  const k = Math.min(1, THUMB / Math.max(src.width, src.height));
  if (k >= 1) return src;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width*k)); c.height = Math.max(1, Math.round(src.height*k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function addPhoto(id, src, blob, alpha, saved = false, keepFull = false){
  photos.set(id, {src: keepFull ? src : thumbOf(src), blob, saved, alpha, w:src.width, h:src.height});
}
const imgOf = id => fullCache.get(id) || photos.get(id).src;
const needsFull = id => { const ph = photos.get(id); return !!ph && ph.src.width < ph.w && !fullCache.has(id) && !fullLoading.has(id) && !fullFailed.has(id); };
async function ensureFull(ids){
  for (const id of new Set(ids)){
    if (!id || !needsFull(id)) { if (fullCache.has(id)){ const b = fullCache.get(id); fullCache.delete(id); fullCache.set(id, b); } continue; }
    fullLoading.add(id);
    try { fullCache.set(id, await MFC.decode(photos.get(id).blob)); } catch(_){ fullFailed.add(id); }
    fullLoading.delete(id);
    while (fullCache.size > FULL_CAP){ const [k, b] = fullCache.entries().next().value; fullCache.delete(k); b.close && b.close(); }
  }
}
function releaseFull(){ fullCache.forEach(b => b.close && b.close()); fullCache.clear(); }
// Resolución con la que sale impresa una imagen (puntos por pulgada)
function dpiOf(ref){
  const ph = ref && photos.get(ref.photoId); if (!ph) return Infinity;
  const sz = size(), b = state.bleed ? 1.5 : 0, turned = (ref.rot||0) % 180 !== 0;
  const iw = turned ? ph.h : ph.w, ih = turned ? ph.w : ph.h;
  const mmPerPx = Math.max((sz.w + 2*b)/iw, (sz.h + 2*b)/ih) * (ref.zoom||1);
  return 25.4 / mmPerPx;
}
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function newId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function toast(msg, ms=2400){ const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), ms); }
const size = () => SIZES.find(s => s.id === state.size);
