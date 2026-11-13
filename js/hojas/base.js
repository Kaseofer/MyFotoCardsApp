/* Hojas de fotos · base
   Papeles, distribuciones (cuadrícula o tamaño fijo), estilos, el estado (`state`)
   y el Deshacer de esta herramienta. */

// Medidas en mm, siempre en vertical; la orientación horizontal las da vuelta
const PAPERS = [
  {id:"a4", w:210, h:297, label:"A4"},
  {id:"carta", w:215.9, h:279.4, label:"Carta"},
  {id:"foto", w:101.6, h:152.4, label:"Papel foto 10×15"}
];
const ORIENTS = [{id:"v", label:"Vertical"}, {id:"h", label:"Horizontal"}];
// Cuadrícula: c columnas × r filas que llenan la hoja · Tamaño fijo: fw × fh mm, entran las que quepan
const LAYOUTS = [
  {id:"8", c:2, r:4, label:"8"}, {id:"9", c:3, r:3, label:"9"}, {id:"12", c:3, r:4, label:"12"},
  {id:"15", c:3, r:5, label:"15"}, {id:"20", c:4, r:5, label:"20"}
];
const SIZES = [
  {id:"s13x18", fw:130, fh:180, label:"13×18"}, {id:"s10x15", fw:100, fh:150, label:"10×15"},
  {id:"s9x13", fw:90, fh:130, label:"9×13"}, {id:"s6x9", fw:60, fh:90, label:"6×9"},
  {id:"s4x4", fw:40, fh:40, label:"4×4 carnet"}
];
const ALL_LAYOUTS = [...LAYOUTS, ...SIZES];
// Forma de cada foto: automática (llenan el espacio), apaisadas 3:2 o verticales 2:3
const SHAPES = [{id:"auto", label:"Automática"}, {id:"h", label:"Apaisadas"}, {id:"v", label:"Verticales"}];
const AUTOCAP = [{id:"year", label:"Año"}, {id:"place", label:"Lugar"}, {id:"both", label:"Lugar y año"}, {id:"group", label:"Grupo y álbum"}];
const usesPlace = () => state.capAuto === "place" || state.capAuto === "both";
const LOW_DPI = 150; // por debajo de esto la foto impresa se puede ver pixelada
// Cada hoja tiene su propia orientación (state.orients[p]); state.orient es la que toman las hojas nuevas
function orientOf(p = state.page){ return state.orients[p] || state.orient; }
function paper(p = state.page){
  const k = PAPERS.find(k => k.id === state.paper) || PAPERS[0];
  return orientOf(p) === "h" ? {w:k.h, h:k.w} : {w:k.w, h:k.h};
}
const STYLES = [{id:"polaroid", label:"Polaroid"}, {id:"borde", label:"Borde fino"}, {id:"completa", label:"Sin marco"}];
const BGS = [{id:"#ffffff", label:"Blanco"}, {id:"#ececec", label:"Gris claro"}];
const POS = [
  {id:"br", label:"Abajo derecha"}, {id:"bl", label:"Abajo izquierda"}, {id:"bc", label:"Abajo centro"},
  {id:"tr", label:"Arriba derecha"}, {id:"tl", label:"Arriba izquierda"}, {id:"marco", label:"En el marco"}
];
const state = {paper:"a4", orient:"v", layout:"12", shape:"auto", style:"polaroid", bg:"#ffffff", margin:5, gap:3, cuts:true, captions:true, capPos:"br", capAuto:"year", groupId:null, albumId:null, groupLabel:"",
  orients:["v"], slots:[], pages:1, page:0, sel:-1, moving:-1, flash:[]};
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- deshacer ---------- */
const undoStack = [];
function pushUndo(){
  undoStack.push({slots: state.slots.map(sl => sl && {...sl}), pages: state.pages, page: state.page, orients: [...state.orients]});
  if (undoStack.length > 40) undoStack.shift();
  document.getElementById("undoBtn").disabled = false;
}
function undo(){
  const u = undoStack.pop();
  if (!u){ say("No hay nada para deshacer."); return; }
  state.slots = u.slots; state.pages = u.pages; state.orients = u.orients; fitPages();
  state.page = Math.min(u.page, state.pages-1); state.sel = -1; state.moving = -1;
  updateToolbar(); draw(); say("Listo, se deshizo el último cambio.");
}
function clearUndo(){ undoStack.length = 0; }

const $ = id => document.getElementById(id);
const preview = $("preview"), pctx = preview.getContext("2d");

/* ---------- datos ---------- */
// Las fotos están en una sola lista; cada hoja ocupa un tramo que empieza en pageStart(p)
const perPage = (p = state.page) => { const g = grid(p); return g.c*g.r; };
const slot = i => state.slots[i] || null;
function pageStart(p){ let i = 0; for (let q = 0; q < p; q++) i += perPage(q); return i; }
function pageOf(gi){ let i = 0; for (let q = 0; ; q++){ const n = perPage(q); if (gi < i + n || q > 9999) return q; i += n; } }
function lastFilled(){ for (let i = state.slots.length-1; i >= 0; i--) if (state.slots[i]) return i; return -1; }
function fitPages(){
  const need = lastFilled() + 1;
  let pages = Math.max(1, state.pages), cap = 0;
  for (let q = 0; q < pages; q++){ if (!state.orients[q]) state.orients[q] = state.orients[q-1] || state.orient; cap += perPage(q); }
  while (cap < need){ state.orients[pages] = state.orients[pages] || state.orients[pages-1] || state.orient; cap += perPage(pages); pages++; }
  state.pages = pages; state.orients.length = pages;
}
function countOn(p){ const a = pageStart(p), n = perPage(p); let k = 0; for (let i = a; i < a+n; i++) if (slot(i)) k++; return k; }

/* ---------- geometría ---------- */
// Devuelve columnas, filas, medida de cada espacio y desde dónde empieza (centrado)
function grid(p = state.page){
  const P = paper(p), m = state.margin, g = state.gap;
  const L = ALL_LAYOUTS.find(l => l.id === state.layout) || LAYOUTS[2];
  const AW = P.w - 2*m, AH = P.h - 2*m;
  if (!L.fw){
    if (state.shape === "auto"){
      let c = L.c, r = L.r;
      if (P.w > P.h) [c, r] = [r, c]; // en horizontal se dan vuelta filas y columnas
      return {c, r, w:(AW-(c-1)*g)/c, h:(AH-(r-1)*g)/r, x0:m, y0:m, fixed:false};
    }
    // Forma elegida: misma cantidad de fotos, con las filas y columnas que dejen las fotos más grandes
    const n = L.c*L.r, A = cellAspect(state.shape === "h" ? 3/2 : 2/3);
    let best = null;
    for (let c = 1; c <= n; c++){
      if (n % c) continue;
      const r = n / c, gw = (AW-(c-1)*g)/c, gh = (AH-(r-1)*g)/r;
      if (gw <= 0 || gh <= 0) continue;
      const w = Math.min(gw, gh*A), h = w/A;
      if (!best || w*h > best.w*best.h + 1e-9) best = {c, r, w, h};
    }
    const usedW = best.c*best.w + (best.c-1)*g, usedH = best.r*best.h + (best.r-1)*g;
    return {...best, x0:m + (AW-usedW)/2, y0:m + (AH-usedH)/2, fixed:false};
  }
  const fit = (w, h) => ({c:Math.floor((AW+g+1e-6)/(w+g)), r:Math.floor((AH+g+1e-6)/(h+g)), w, h});
  const a = fit(L.fw, L.fh), b = fit(L.fh, L.fw); // a: parada · b: acostada
  const square = L.fw === L.fh;
  let best = square || state.shape === "auto" ? (b.c*b.r > a.c*a.r ? b : a) : state.shape === "h" ? b : a, shrunk = false;
  if (!best.c || !best.r){
    // No entra ni una en tamaño real: una sola, lo más grande posible con esa proporción
    const k1 = Math.min(AW/L.fw, AH/L.fh), k2 = Math.min(AW/L.fh, AH/L.fw);
    const useB = square || state.shape === "auto" ? k2 > k1 : state.shape === "h";
    best = useB ? {c:1, r:1, w:L.fh*k2, h:L.fw*k2} : {c:1, r:1, w:L.fw*k1, h:L.fh*k1};
    shrunk = true;
  }
  const usedW = best.c*best.w + (best.c-1)*g, usedH = best.r*best.h + (best.r-1)*g;
  return {...best, x0:m + (AW-usedW)/2, y0:m + (AH-usedH)/2, fixed:true, shrunk, label:L.label};
}
// Proporción que tiene que tener el espacio para que la FOTO (sin el marco) quede con proporción R (ancho/alto).
// Sale de photoRect: polaroid deja 6 % de borde y 2,8 veces más abajo; borde fino 3,5 % parejo.
function cellAspect(R){
  if (state.style === "polaroid") return R >= 1 ? 0.772*R + 0.12 : 1 / (0.88/R + 0.228);
  if (state.style === "borde") return R >= 1 ? 0.93*R + 0.07 : 1 / (0.93/R + 0.07);
  return R;
}
function cells(p = state.page){
  const G = grid(p), g = state.gap, out = [];
  for (let j=0;j<G.r;j++) for (let i=0;i<G.c;i++) out.push({x:G.x0 + i*(G.w+g), y:G.y0 + j*(G.h+g), w:G.w, h:G.h});
  return out;
}
function photoRect(cell){
  const mn = Math.min(cell.w, cell.h);
  if (state.style === "polaroid"){ const b = mn*0.06; return {x:cell.x+b, y:cell.y+b, w:cell.w-2*b, h:cell.h-b-b*2.8}; }
  if (state.style === "borde"){ const b = mn*0.035; return {x:cell.x+b, y:cell.y+b, w:cell.w-2*b, h:cell.h-2*b}; }
  return {...cell};
}
function geom(sl, pr, s){
  const turned = (sl.rot||0) % 180 !== 0;
  const iw = turned ? sl.h : sl.w, ih = turned ? sl.w : sl.h;
  const pw = pr.w*s, ph = pr.h*s, sc = Math.max(pw/iw, ph/ih) * sl.zoom;
  const dw = iw*sc, dh = ih*sc;
  return {dw, dh, ex:dw-pw, ey:dh-ph, sc};
}
// Puntos por pulgada con los que va a salir impresa la foto (según su espacio y el zoom)
function dpiOf(sl, cell){ return 25.4 / geom(sl, photoRect(cell), 1).sc; }
function lowResOn(p){
  const a = pageStart(p), cs = cells(p); let k = 0;
  cs.forEach((cell, li) => { const sl = slot(a + li); if (sl && dpiOf(sl, cell) < LOW_DPI) k++; });
  return k;
}
