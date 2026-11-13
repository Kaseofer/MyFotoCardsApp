/* Luli's Photocards · dibujo
   Cómo entran las tarjetas en la hoja (grid) y cómo se dibuja cada cara:
   el frente (foto con zoom, giro y ajustes de color) y la parte de atrás (diseños, patrones,
   logos con tinte o contorno, textos). drawFace() dibuja una tarjeta en cualquier canvas;
   renderSheet() arma la vista de la hoja completa. */

/* ---------- geometría de la hoja ---------- */
function grid(){
  const sz = size(), b = state.bleed ? 1.5 : 0, g = state.shared ? 0 : (state.bleed ? 3 : 2), mm = state.shared ? 5 : 7;
  const cols = Math.max(1, Math.floor((paper().w - 2*mm + g) / (sz.w + g)));
  const rows = Math.max(1, Math.floor((paper().h - 2*mm + g) / (sz.h + g)));
  const W = cols*sz.w + (cols-1)*g, H = rows*sz.h + (rows-1)*g;
  const x0 = (paper().w - W)/2, y0 = (paper().h - H)/2, cells = [];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) cells.push({c, r, x:x0 + c*(sz.w+g), y:y0 + r*(sz.h+g), w:sz.w, h:sz.h});
  return {cols, rows, cells, b, g, x0, y0, W, H};
}
const perSheet = () => grid().cells.length;
const sheetCount = () => Math.max(1, Math.ceil(state.cards.length / perSheet()));

/* ---------- dibujo de caras ---------- */
function geom(ref, rw, rh){
  let src = imgOf(ref.photoId);
  if (MFC.hasAdj(ref.adj)){ const ph = photos.get(ref.photoId); src = src === ph.src ? MFC.adjusted(src, ref.adj, ref.photoId, {holder:ph}) : MFC.adjusted(src, ref.adj, ref.photoId); }
  const turned = (ref.rot||0) % 180 !== 0;
  const iw = turned ? src.height : src.width, ih = turned ? src.width : src.height;
  const sc = Math.max(rw/iw, rh/ih) * (ref.zoom||1);
  const dw = iw*sc, dh = ih*sc;
  return {src, dw, dh, ex:dw-rw, ey:dh-rh, sc};
}
function drawRef(ctx, ref, R){
  if (!ref || !photos.get(ref.photoId)){ ctx.fillStyle = "#efe9f5"; ctx.fillRect(R.x, R.y, R.w, R.h); return; }
  const g = geom(ref, R.w, R.h);
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.translate(R.x - g.ex*ref.fx + g.dw/2, R.y - g.ey*ref.fy + g.dh/2);
  ctx.rotate((ref.rot||0) * Math.PI/180);
  const w = g.src.width*g.sc, h = g.src.height*g.sc;
  ctx.drawImage(g.src, -w/2, -h/2, w, h);
  ctx.restore();
}
const FONTS = [
  {id:"Bricolage Grotesque", label:"Moderna", w1:800, w2:400},
  {id:"Playfair Display", label:"Elegante", w1:700, w2:400},
  {id:"Caveat", label:"Manuscrita", w1:700, w2:500}
];
const PATTERNS = [
  {id:"naipe", label:"Naipe"}, {id:"rombos", label:"Rombos"}, {id:"diagonales", label:"Diagonales"},
  {id:"lunares", label:"Lunares"}, {id:"corazones", label:"Corazones"}, {id:"estrellas", label:"Estrellas"}, {id:"confeti", label:"Confeti"},
  {id:"ondas", label:"Ondas"}, {id:"none", label:"Liso"}
];
// diseños listos para la parte de atrás: un toque y queda armada
const PRESETS = [
  {id:"corazones", label:"Corazones", pattern:"corazones", backColor:"#ffd6e7", patternColor:"#e0457b", backTextColor:"#7a1240", patternAlpha:0.6, frame:true, font:"Caveat"},
  {id:"estrellas", label:"Estrellas", pattern:"estrellas", backColor:"#1f2a6b", patternColor:"#ffd84d", backTextColor:"#ffffff", patternAlpha:0.85, frame:true, font:"Bricolage Grotesque"},
  {id:"colores", label:"Colores", pattern:"confeti", backColor:"#fffaf0", patternColor:"#7c5cff", backTextColor:"#3b2a80", patternAlpha:0.9, frame:false, font:"Bricolage Grotesque"},
  {id:"lunares", label:"Lunares", pattern:"lunares", backColor:"#d9f2ff", patternColor:"#2b7bb9", backTextColor:"#0d3c61", patternAlpha:0.55, frame:true, font:"Bricolage Grotesque"},
  {id:"ondas", label:"Ondas", pattern:"ondas", backColor:"#e3f6e8", patternColor:"#2f9e5b", backTextColor:"#145a32", patternAlpha:0.6, frame:true, font:"Bricolage Grotesque"},
  {id:"clasico", label:"Clásico", pattern:"naipe", backColor:"#f6d3e4", patternColor:"#5b2140", backTextColor:"#5b2140", patternAlpha:0.55, frame:true, font:"Bricolage Grotesque"}
];
const PRESET_KEYS = ["pattern","backColor","patternColor","backTextColor","patternAlpha","frame","font"];
function fitFont(ctx, text, weight, size, maxW, fam){
  fam = fam || "Bricolage Grotesque";
  const f = sz => `${weight} ${sz}px "${fam}", system-ui, sans-serif`;
  ctx.font = f(size);
  while (size > 3 && ctx.measureText(text).width > maxW){ size *= 0.92; ctx.font = f(size); }
  return size;
}
function rrect(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath(); ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}
function lattice(ctx, A, step, both){
  ctx.beginPath();
  for (let t = -A.h; t <= A.w + A.h; t += step){
    ctx.moveTo(A.x + t, A.y); ctx.lineTo(A.x + t - A.h, A.y + A.h);
    if (both){ ctx.moveTo(A.x + t - A.h, A.y); ctx.lineTo(A.x + t, A.y + A.h); }
  }
  ctx.stroke();
}
function heart(ctx, x, y, s){
  ctx.beginPath(); ctx.moveTo(x, y + s*0.9);
  ctx.bezierCurveTo(x - s*1.6, y - s*0.2, x - s*0.6, y - s*1.4, x, y - s*0.5);
  ctx.bezierCurveTo(x + s*0.6, y - s*1.4, x + s*1.6, y - s*0.2, x, y + s*0.9);
  ctx.fill();
}
function star(ctx, x, y, s){
  ctx.beginPath();
  for (let i = 0; i < 10; i++){ const r = i % 2 ? s*0.45 : s, a = -Math.PI/2 + i*Math.PI/5; ctx.lineTo(x + r*Math.cos(a), y + r*Math.sin(a)); }
  ctx.closePath(); ctx.fill();
}
// Fondo + patrón + marco
function drawBackDecor(ctx, R, C, pattern){
  const u = C.w/55, col = state.patternColor, a = state.patternAlpha;
  ctx.save();
  ctx.fillStyle = state.backColor; ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = a;
  ctx.lineWidth = Math.max(0.5, 0.28*u);
  if (pattern === "naipe"){
    const m = 3.4*u, A = {x:C.x+m, y:C.y+m, w:C.w-2*m, h:C.h-2*m};
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.lineWidth = Math.max(0.4, 0.22*u); lattice(ctx, A, 2.4*u, true);
    ctx.globalAlpha = a*0.9;
    for (let y = A.y; y <= A.y + A.h + 2.4*u; y += 2.4*u) for (let x = A.x; x <= A.x + A.w + 2.4*u; x += 2.4*u){ ctx.beginPath(); ctx.arc(x, y, 0.32*u, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = Math.min(1, a + 0.3);
    ctx.lineWidth = Math.max(0.6, 0.5*u); ctx.strokeRect(A.x, A.y, A.w, A.h);
    const m2 = 0.9*u; ctx.lineWidth = Math.max(0.4, 0.22*u);
    ctx.strokeRect(A.x - m2, A.y - m2, A.w + 2*m2, A.h + 2*m2);
    ctx.strokeRect(A.x + m2, A.y + m2, A.w - 2*m2, A.h - 2*m2);
    const dia = (x, y, d) => { ctx.beginPath(); ctx.moveTo(x, y-d); ctx.lineTo(x+d, y); ctx.lineTo(x, y+d); ctx.lineTo(x-d, y); ctx.closePath(); ctx.fill(); };
    [[A.x, A.y], [A.x+A.w, A.y], [A.x, A.y+A.h], [A.x+A.w, A.y+A.h]].forEach(([x, y]) => dia(x, y, 1.7*u));
    [[A.x+A.w/2, A.y], [A.x+A.w/2, A.y+A.h], [A.x, A.y+A.h/2], [A.x+A.w, A.y+A.h/2]].forEach(([x, y]) => dia(x, y, 1.1*u));
  } else if (pattern === "rombos"){
    ctx.lineWidth = Math.max(0.5, 0.35*u); lattice(ctx, R, 6*u, true);
    const st = 6*u, b1 = R.x - R.h, b2 = R.x - 2*R.h, n = Math.ceil((R.w + 3*R.h)/st) + 2;
    for (let k1 = 0; k1 < n; k1++) for (let k2 = 0; k2 < n; k2++){
      const c1 = b1 + (k1 + .5)*st, c2 = b2 + (k2 + .5)*st, x = (c1 + c2)/2, y = R.y + (c1 - c2)/2;
      if (x < R.x - st || x > R.x + R.w + st || y < R.y - st || y > R.y + R.h + st) continue;
      ctx.beginPath(); ctx.moveTo(x, y - 1.1*u); ctx.lineTo(x + 0.8*u, y); ctx.lineTo(x, y + 1.1*u); ctx.lineTo(x - 0.8*u, y); ctx.closePath(); ctx.fill();
    }
  } else if (pattern === "diagonales"){
    ctx.lineWidth = Math.max(0.5, 0.45*u); lattice(ctx, R, 2.6*u, false);
  } else if (pattern === "lunares"){
    const st = 4.2*u; let row = 0;
    for (let y = R.y; y <= R.y + R.h + st; y += st, row++) for (let x = R.x + (row % 2 ? st/2 : 0); x <= R.x + R.w + st; x += st){ ctx.beginPath(); ctx.arc(x, y, 0.8*u, 0, Math.PI*2); ctx.fill(); }
  } else if (pattern === "estrellas"){
    const st = 7.5*u; let row = 0;
    for (let y = R.y; y <= R.y + R.h + st; y += st*0.8, row++) for (let x = R.x + (row % 2 ? st/2 : 0); x <= R.x + R.w + st; x += st) star(ctx, x, y, (row + Math.round(x/st)) % 3 ? 1.5*u : 0.9*u);
  } else if (pattern === "confeti"){
    // confeti de colores fijos: no usa el color de los dibujos
    const COLS = ["#ff5d8f", "#ffb627", "#3ec1d3", "#7c5cff", "#4caf50", "#ff7a00"], st = 5*u; let row = 0, k = 0;
    for (let y = R.y; y <= R.y + R.h + st; y += st*0.8, row++) for (let x = R.x + (row % 2 ? st/2 : 0); x <= R.x + R.w + st; x += st, k++){
      ctx.fillStyle = COLS[(k*7 + row*3) % COLS.length];
      const s = (k + row) % 3;
      if (s === 0){ ctx.beginPath(); ctx.arc(x, y, 0.9*u, 0, Math.PI*2); ctx.fill(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(((k*37 + row*11) % 180) * Math.PI/180); ctx.fillRect(-1.3*u, -0.45*u, 2.6*u, 0.9*u); ctx.restore(); }
    }
    ctx.fillStyle = col;
  } else if (pattern === "corazones"){
    const st = 7*u; let row = 0;
    for (let y = R.y; y <= R.y + R.h + st; y += st*0.75, row++) for (let x = R.x + (row % 2 ? st/2 : 0); x <= R.x + R.w + st; x += st) heart(ctx, x, y, 1.5*u);
  } else if (pattern === "ondas"){
    ctx.lineWidth = Math.max(0.5, 0.35*u);
    const st = 3*u, wl = 7*u, amp = 0.9*u;
    ctx.beginPath();
    for (let y = R.y; y <= R.y + R.h + st; y += st){
      for (let x = R.x; x <= R.x + R.w + 0.5*u; x += 0.5*u){
        const yy = y + Math.sin((x - R.x)/wl*Math.PI*2)*amp;
        if (x === R.x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
  }
  if (state.frame){
    ctx.globalAlpha = Math.min(1, a + 0.35);
    ctx.lineWidth = Math.max(0.5, 0.3*u);
    const m = pattern === "naipe" ? 1.5*u : 2.6*u;
    rrect(ctx, C.x + m, C.y + m, C.w - 2*m, C.h - 2*m, 2.2*u); ctx.stroke();
  }
  ctx.restore();
}
const tintCache = new Map();
function tinted(src, id, color){
  const k = id + "|" + color;
  let c = tintCache.get(k);
  if (!c){
    c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d"); x.drawImage(src, 0, 0);
    x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    tintCache.set(k, c);
  }
  return c;
}
const outlineCache = new Map();
function outlined(src, key, color, frac){
  const t = Math.max(1, Math.round(Math.max(src.width, src.height)*frac));
  const k = `${key}|${color}|${t}`;
  let c = outlineCache.get(k);
  if (!c){
    c = document.createElement("canvas"); c.width = src.width + 2*t; c.height = src.height + 2*t;
    const x = c.getContext("2d");
    const sil = document.createElement("canvas"); sil.width = src.width; sil.height = src.height;
    const sx = sil.getContext("2d"); sx.drawImage(src, 0, 0); sx.globalCompositeOperation = "source-in"; sx.fillStyle = color; sx.fillRect(0, 0, sil.width, sil.height);
    const steps = 32;
    for (let r = t; r > 0; r -= Math.max(1, t/3)) for (let i = 0; i < steps; i++){
      const a = i/steps*Math.PI*2; x.drawImage(sil, t + Math.cos(a)*r, t + Math.sin(a)*r);
    }
    x.drawImage(src, t, t);
    if (outlineCache.size > 30) outlineCache.clear();
    outlineCache.set(k, c);
  }
  return c;
}
// Calcula dónde va cada elemento del dorso. Posición null = automática (apilado y centrado);
// un número de 0 a 1 = desde arriba de todo hasta abajo de todo.
function layoutDesign(ctx, C){
  const u = C.w/55, maxW = C.w*0.72, gap = 2.2*u;
  const F = FONTS.find(f => f.id === state.font) || FONTS[0];
  const t1 = state.backText.trim(), t2 = state.backText2.trim();
  const items = [];
  const addLogo = k => {
    const ref = state[k], ph = ref && photos.get(ref.photoId);
    if (!ph) return;
    let src = state[k+"Tint"] ? tinted(ph.src, ref.photoId + "|" + ph.src.width, state[k+"TintColor"]) : ph.src;
    if (state[k+"Stroke"]) src = outlined(src, ref.photoId + (state[k+"Tint"] ? state[k+"TintColor"] : ""), state[k+"StrokeColor"], state[k+"StrokeW"]);
    let w = C.w*state[k+"Size"], h = w*src.height/src.width;
    if (h > C.h*0.6){ h = C.h*0.6; w = h*src.width/src.height; }
    items.push({type:"logo", key:k+"Pos", slider:k+"Y", src, w, h});
  };
  addLogo("logo2"); addLogo("logo");
  let s1 = 0, s2 = 0, tw = 0;
  if (t1){ s1 = fitFont(ctx, t1, F.w1, C.w*0.14, maxW, F.id); tw = Math.max(tw, ctx.measureText(t1).width); }
  if (t2){ s2 = fitFont(ctx, t2, F.w2, C.w*0.085, maxW, F.id); tw = Math.max(tw, ctx.measureText(t2).width); }
  if (t1 || t2){
    const h = (t1 ? s1*1.15 : 0) + (t2 ? s2*1.25 : 0) + (t1 && t2 ? gap*0.4 : 0);
    items.push({type:"text", key:"textPos", slider:"textY", w:Math.min(C.w*0.86, tw + 7*u), h});
  }
  let total = items.reduce((a, it) => a + it.h, 0) + gap*Math.max(0, items.length - 1);
  let y = C.y + C.h/2 - total/2 - (state.backNumber ? 1.5*u : 0);
  items.forEach(it => { it.y = y; y += it.h + gap; });
  items.forEach(it => {
    const v = state[it.key], room = Math.max(0, C.h - it.h);
    if (v !== null && v !== undefined) it.y = C.y + v*room;
    it.v = room ? clamp((it.y - C.y)/room, 0, 1) : 0;
  });
  return {items, F, t1, t2, s1, s2, tw, u, maxW, gap};
}
function drawDesign(ctx, R, C, idx){
  drawBackDecor(ctx, R, C, state.pattern);
  const L = layoutDesign(ctx, C), {F, t1, t2, s1, s2, u, maxW, gap} = L, cx = C.x + C.w/2;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const T = L.items.find(it => it.type === "text");
  if (T && state.plate && state.pattern !== "none"){
    ctx.save();
    ctx.fillStyle = state.backColor; rrect(ctx, cx - T.w/2, T.y - 1.75*u, T.w, T.h + 3.5*u, 1.6*u); ctx.fill();
    ctx.strokeStyle = state.patternColor; ctx.globalAlpha = Math.min(1, state.patternAlpha + 0.35);
    ctx.lineWidth = Math.max(0.5, 0.3*u); ctx.stroke();
    ctx.restore();
  }
  L.items.forEach(it => { if (it.type === "logo") ctx.drawImage(it.src, cx - it.w/2, it.y, it.w, it.h); });
  if (T){
    ctx.fillStyle = state.backTextColor;
    let y = T.y;
    if (t1){ fitFont(ctx, t1, F.w1, s1, maxW, F.id); ctx.fillText(t1, cx, y + s1*1.15/2); y += s1*1.15 + gap*0.4; }
    if (t2){ fitFont(ctx, t2, F.w2, s2, maxW, F.id); ctx.fillText(t2, cx, y + s2*1.25/2); }
  }
  if (state.backNumber && idx >= 0){
    const n = Math.max(state.cards.length, idx+1), pad = String(n).length < 2 ? 2 : String(n).length;
    const lbl = `${String(idx+1).padStart(pad,"0")}/${String(n).padStart(pad,"0")}`;
    const ns = fitFont(ctx, lbl, 600, C.w*0.06, maxW);
    const ny = C.y + C.h - (state.pattern === "naipe" ? 7.2*u : 5.5*u);
    if (state.pattern !== "none"){
      const w = ctx.measureText(lbl).width + 3*u;
      ctx.save(); ctx.fillStyle = state.backColor; rrect(ctx, cx - w/2, ny - ns*0.75, w, ns*1.5, ns*0.5); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = state.backTextColor; ctx.fillText(lbl, cx, ny);
  }
}
// Detecta si la imagen tiene partes transparentes
function hasAlpha(c){
  try {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
  } catch(_){}
  return false;
}
const isAlpha = ref => !!(ref && photos.get(ref.photoId) && photos.get(ref.photoId).alpha);
// R = área a pintar (con sangrado), C = área de corte
function drawFace(ctx, card, side, R, C, idx){
  if (side === "front"){
    if (isAlpha(card.front) || (card.front && card.front.zoom < 1)){ ctx.fillStyle = "#ffffff"; ctx.fillRect(R.x, R.y, R.w, R.h); }
    return drawRef(ctx, card.front, R);
  }
  const ref = card.back || (state.backMode === "image" ? state.commonBack : null);
  if (ref){
    // un dorso PNG transparente se apoya sobre el diseño (color y patrón)
    if (isAlpha(ref) || ref.zoom < 1) drawBackDecor(ctx, R, C, state.pattern);
    return drawRef(ctx, ref, R);
  }
  drawDesign(ctx, R, C, idx);
}

/* ---------- hoja completa ---------- */
function renderSheet(ctx, s, page, side, mode){
  const G = grid(), per = G.cells.length;
  ctx.save();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, paper().w*s, paper().h*s);
  if (side === "back" && state.rotBack){ ctx.translate(paper().w*s, paper().h*s); ctx.rotate(Math.PI); }
  G.cells.forEach((cell, k) => {
    const idx = page*per + k, card = state.cards[idx];
    // en el dorso, las columnas se espejan para que coincidan al dar vuelta la hoja
    const x = side === "back" ? paper().w - cell.x - cell.w : cell.x, y = cell.y;
    const C = {x:x*s, y:y*s, w:cell.w*s, h:cell.h*s};
    // con cortes compartidos, el sangrado va solo en los bordes exteriores de la grilla
    const eL = G.g > 0 || Math.abs(x - G.x0) < 0.01 ? G.b : 0, eR = G.g > 0 || Math.abs(x + cell.w - (G.x0 + G.W)) < 0.01 ? G.b : 0;
    const eT = G.g > 0 || Math.abs(y - G.y0) < 0.01 ? G.b : 0, eB = G.g > 0 || Math.abs(y + cell.h - (G.y0 + G.H)) < 0.01 ? G.b : 0;
    // ajustado a píxeles enteros para que no queden líneas finas entre tarjetas pegadas
    const rx0 = Math.floor((x-eL)*s), ry0 = Math.floor((y-eT)*s), rx1 = Math.ceil((x+cell.w+eR)*s), ry1 = Math.ceil((y+cell.h+eB)*s);
    const R = {x:rx0, y:ry0, w:rx1 - rx0, h:ry1 - ry0};
    if (mode === "test"){
      ctx.strokeStyle = "#000"; ctx.lineWidth = 0.3*s; ctx.strokeRect(C.x, C.y, C.w, C.h);
      ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `800 ${cell.w*0.35*s}px "Bricolage Grotesque", sans-serif`;
      ctx.fillText(String(k+1), C.x + C.w/2, C.y + C.h/2);
      ctx.font = `600 ${cell.w*0.09*s}px "Bricolage Grotesque", sans-serif`;
      ctx.fillText(side === "front" ? "FRENTE" : "DORSO", C.x + C.w/2, C.y + C.h*0.78);
      ctx.beginPath(); ctx.moveTo(C.x + C.w/2, C.y + C.h*0.12); ctx.lineTo(C.x + C.w/2 - C.w*0.08, C.y + C.h*0.2); ctx.lineTo(C.x + C.w/2 + C.w*0.08, C.y + C.h*0.2); ctx.closePath(); ctx.fill();
      return;
    }
    if (card){
      ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
      drawFace(ctx, card, side, R, C, idx);
      ctx.restore();
      if (mode === "ui" && side === "front" && card.front && dpiOf(card.front) < LOW_DPI){
        // aviso solo en pantalla, nunca en el PDF
        const r = 3.2*s, cx = C.x + C.w - r - 1.5*s, cy = C.y + r + 1.5*s;
        ctx.fillStyle = "#e8a317"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#1d2433"; ctx.font = `800 ${r*1.4}px "Figtree", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", cx, cy + r*0.05);
      }
    } else if (mode === "ui"){
      ctx.strokeStyle = "#d9cde6"; ctx.lineWidth = Math.max(1, 0.3*s); ctx.setLineDash([1.5*s, 1.2*s]);
      ctx.strokeRect(C.x, C.y, C.w, C.h); ctx.setLineDash([]);
    }
  });
  if (state.marks || mode === "test"){
    ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(0.6, 0.15*s);
    const xs = new Set(), ys = new Set();
    G.cells.forEach(c => { const x = side === "back" ? paper().w - c.x - c.w : c.x; xs.add(x); xs.add(x + c.w); ys.add(c.y); ys.add(c.y + c.h); });
    const top = G.y0, bot = G.y0 + G.H, left = G.x0, right = G.x0 + G.W, gapM = Math.max(1.5, G.b + 0.5);
    const len = clamp(Math.min(G.x0, G.y0) - gapM - 0.5, 1.5, 4);
    ctx.beginPath();
    xs.forEach(x => { ctx.moveTo(x*s, (top-gapM)*s); ctx.lineTo(x*s, (top-gapM-len)*s); ctx.moveTo(x*s, (bot+gapM)*s); ctx.lineTo(x*s, (bot+gapM+len)*s); });
    ys.forEach(y => { ctx.moveTo((left-gapM)*s, y*s); ctx.lineTo((left-gapM-len)*s, y*s); ctx.moveTo((right+gapM)*s, y*s); ctx.lineTo((right+gapM+len)*s, y*s); });
    ctx.stroke();
  }
  ctx.restore();
}
