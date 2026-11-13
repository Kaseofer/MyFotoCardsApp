/* Luli's Photocards · herramientas de imagen
   Recortar varias tarjetas (frente y dorso) de una sola imagen tipo collage,
   y quitar un color de fondo de un logo (lo vuelve transparente). */

/* ---------- recortar zonas de un collage ---------- */
const crop = {img:null, url:null, rects:[], sel:-1, lock:true, role:"front", same:true, sameSize:true, undo:[],
  fit:1, z:1, vx:0, vy:0, act:null, pan:false, pointers:new Map(), pinch:null};
const cropCv = $("cropCanvas");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cardRatio = () => size().h / size().w;
const ROLE_COL = {front:"#ff4fa3", back:"#8f6bff"};
async function refFromCanvas(src){
  const k = Math.min(1, 1500 / Math.max(src.width, src.height));
  let c = src;
  if (k < 1){ c = document.createElement("canvas"); c.width = Math.round(src.width*k); c.height = Math.round(src.height*k); c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); }
  const alpha = hasAlpha(c);
  const blob = await new Promise(r => alpha ? c.toBlob(r, "image/png") : c.toBlob(r, "image/jpeg", 0.92));
  const id = newId("f");
  addPhoto(id, c, blob, alpha);
  return {photoId:id, fx:.5, fy:.5, zoom:1, rot:0};
}
$("cropBtn").onclick = () => $("fileCollage").click();
$("fileCollage").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  if (crop.url) URL.revokeObjectURL(crop.url);
  crop.url = URL.createObjectURL(f);
  try { crop.img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = crop.url; }); }
  catch(_){ toast("No se pudo abrir esa imagen."); return; }
  Object.assign(crop, {rects:[], sel:-1, act:null, z:1, vx:0, vy:0, role:"front", pan:false, pinch:null, undo:[]});
  crop.pointers.clear();
  $("cropStart").value = 1;
  $("cropModal").classList.add("on");
  requestAnimationFrame(() => { crop.z = widthZoom(); crop.vy = 0; drawCrop(); });
};
function closeCrop(){
  $("cropModal").classList.remove("on");
  if (crop.url) URL.revokeObjectURL(crop.url);
  crop.url = null; crop.img = null; crop.rects = []; renderAll();
}
$("cropClose").onclick = closeCrop;
const corners = r => [[r.x, r.y], [r.x+r.w, r.y], [r.x, r.y+r.h], [r.x+r.w, r.y+r.h]];
function viewSize(){ const w = $("cropWrap"); return {VW:w.clientWidth || 320, VH:w.clientHeight || 360}; }
function baseScale(){ const {VW, VH} = viewSize(); return Math.min(VW/crop.img.naturalWidth, VH/crop.img.naturalHeight); }
function kScale(){ return baseScale()*crop.z; }
function widthZoom(){ const {VW} = viewSize(); return Math.max(1, (VW/crop.img.naturalWidth)/baseScale()); }
function clampView(){
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight, {VW, VH} = viewSize(), k = kScale();
  const vw = VW/k, vh = VH/k;
  crop.vx = iw <= vw ? (iw - vw)/2 : clamp(crop.vx, 0, iw - vw);
  crop.vy = ih <= vh ? (ih - vh)/2 : clamp(crop.vy, 0, ih - vh);
}
function roleSeg(el, get, set){
  el.innerHTML = "";
  [{id:"front", label:"Frentes"}, {id:"back", label:"Dorsos"}].forEach(it => {
    const b = document.createElement("button"); b.textContent = it.label; b.dataset.r = it.id;
    b.setAttribute("aria-pressed", get() === it.id);
    b.onclick = () => { set(it.id); drawCrop(); };
    el.appendChild(b);
  });
}
function drawCrop(){
  if (!crop.img) return;
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight;
  const {VW, VH} = viewSize(), dpr = devicePixelRatio || 1;
  const W = Math.round(VW*dpr), H = Math.round(VH*dpr);
  if (cropCv.width !== W || cropCv.height !== H){ cropCv.width = W; cropCv.height = H; }
  clampView();
  const ctx = cropCv.getContext("2d"), s = kScale()*dpr;
  const X = x => (x - crop.vx)*s, Y = y => (y - crop.vy)*s;
  ctx.fillStyle = "#120c18"; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(crop.img, X(0), Y(0), iw*s, ih*s);
  if (crop.rects.length){
    ctx.save(); ctx.fillStyle = "rgba(20,10,30,.5)";
    ctx.beginPath(); ctx.rect(X(0), Y(0), iw*s, ih*s);
    crop.rects.forEach(r => ctx.rect(X(r.x), Y(r.y), r.w*s, r.h*s));
    ctx.fill("evenodd"); ctx.restore();
  }
  const count = {front:0, back:0};
  crop.rects.forEach((r, i) => {
    const sel = i === crop.sel, col = ROLE_COL[r.role];
    count[r.role]++;
    ctx.strokeStyle = col; ctx.lineWidth = (sel ? 3.5 : 2)*dpr;
    ctx.strokeRect(X(r.x), Y(r.y), r.w*s, r.h*s);
    if (sel){ ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1*dpr; ctx.setLineDash([4*dpr, 4*dpr]); ctx.strokeRect(X(r.x), Y(r.y), r.w*s, r.h*s); ctx.setLineDash([]); }
    const label = (r.role === "front" ? "F" : "D") + count[r.role];
    const fs = 13*dpr, pad = 4*dpr;
    ctx.font = `800 ${fs}px "Bricolage Grotesque", sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = col; ctx.fillRect(X(r.x), Y(r.y), tw + pad*2, fs + pad*1.4);
    ctx.fillStyle = "#ffffff"; ctx.fillText(label, X(r.x) + pad, Y(r.y) + pad*0.7);
    if (sel){
      const dp = delPos(r), bx = X(dp.x), by = Y(dp.y), q = 4.5*dpr;
      ctx.fillStyle = "#c0262d"; ctx.beginPath(); ctx.arc(bx, by, 11*dpr, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.2*dpr; ctx.beginPath();
      ctx.moveTo(bx-q, by-q); ctx.lineTo(bx+q, by+q); ctx.moveTo(bx+q, by-q); ctx.lineTo(bx-q, by+q); ctx.stroke();
    }
    if (sel) corners(r).forEach(([cx, cy]) => {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = col; ctx.lineWidth = 2.5*dpr;
      ctx.beginPath(); ctx.arc(X(cx), Y(cy), 9*dpr, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    });
  });
  // controles
  roleSeg($("cropRoleSeg"), () => crop.role, v => crop.role = v);
  const selR = crop.rects[crop.sel];
  $("selTools").hidden = !selR;
  if (selR) roleSeg($("selRoleSeg"), () => selR.role, v => { snap(); selR.role = v; });
  $("zLbl").textContent = Math.round(crop.z*100) + "%";
  $("panBtn").setAttribute("aria-pressed", crop.pan);
  cropCv.style.cursor = crop.pan ? "grab" : "crosshair";
  const n = crop.rects.length;
  $("cropCount").textContent = n
    ? (crop.sel >= 0
        ? "Flechas: mover. Shift + flechas: angostar, ensanchar, achicar o agrandar el alto. Ctrl + flechas: pasos más grandes. Tab: siguiente zona."
        : "Tocá una zona para ajustarla. Con «Mismo tamaño» activado, un toque sobre la imagen agrega una zona del mismo tamaño que las otras.")
    : `Arrastrá sobre la imagen para marcar ${crop.role === "front" ? "cada frente" : "el dorso"}. En el celular, con dos dedos acercás y te movés. En la compu, la rueda desplaza y Ctrl + rueda hace zoom.`;
  // resumen
  const nf = count.front, nb = count.back, same = crop.same;
  let txt = "";
  if (!n) txt = "Todavía no hay zonas marcadas.";
  else {
    if (nf) txt += `Se van a crear ${nf} ${nf === 1 ? "tarjeta" : "tarjetas"}. `;
    if (!nb) txt += nf ? "Sin dorso marcado: van a usar el dorso de la colección." : "";
    else if (same) txt += `D1 queda como dorso de toda la colección${nb > 1 ? " (los demás dorsos marcados no se usan)" : ""}.`;
    else if (nf) txt += nb === nf ? "Cada tarjeta lleva su propio dorso, en orden: F1 con D1, F2 con D2, y así." : `Hay ${nf} frentes y ${nb} dorsos: se emparejan en orden y las que sobran quedan con el dorso de la colección.`;
    else txt += `Los ${nb} dorsos se asignan a tus tarjetas existentes, en orden.`;
  }
  $("cropSummary").textContent = txt;
  $("startRow").hidden = !(nb && !nf && !same);
  $("cropCreate").disabled = !n;
  $("undoBtn").disabled = !crop.undo.length;
  $("delTop").disabled = crop.sel < 0;
  $("cropCreate").textContent = nf ? "Crear tarjetas" : (nb ? "Aplicar dorsos" : "Crear tarjetas");
}
window.addEventListener("resize", () => { if (crop.img) drawCrop(); });

function ppi(){ return kScale(); }
function toImg(cx, cy){ const b = cropCv.getBoundingClientRect(), k = ppi(); return {x:crop.vx + (cx - b.left)/k, y:crop.vy + (cy - b.top)/k}; }
function zoomAt(nz, cx, cy){
  const p = toImg(cx, cy), b = cropCv.getBoundingClientRect();
  crop.z = clamp(nz, 1, 12);
  const k = ppi();
  crop.vx = p.x - (cx - b.left)/k; crop.vy = p.y - (cy - b.top)/k;
  drawCrop();
}
function zoomCenter(f){ const b = cropCv.getBoundingClientRect(); zoomAt(crop.z*f, b.left + b.width/2, b.top + b.height/2); }
$("zIn").onclick = () => zoomCenter(1.4);
$("zOut").onclick = () => zoomCenter(1/1.4);
$("zFit").onclick = () => { crop.z = 1; drawCrop(); };
$("zWidth").onclick = () => { crop.z = widthZoom(); crop.vy = 0; drawCrop(); };
$("panBtn").onclick = () => { crop.pan = !crop.pan; drawCrop(); };
cropCv.addEventListener("wheel", e => {
  if (!crop.img) return; e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(crop.z*Math.exp(-e.deltaY*0.0025), e.clientX, e.clientY);
  else { const k = kScale(); crop.vx += e.deltaX/k; crop.vy += e.deltaY/k; drawCrop(); }
}, {passive:false});

function dropNewIfAny(){
  if (crop.act && crop.act.isNew){ crop.rects.splice(crop.sel, 1); crop.sel = -1; }
  crop.act = null;
}
cropCv.addEventListener("pointerdown", e => {
  if (!crop.img) return;
  cropCv.setPointerCapture(e.pointerId);
  crop.pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (crop.pointers.size === 2){
    dropNewIfAny();
    const [a, b] = [...crop.pointers.values()], mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    crop.pinch = {d0:Math.hypot(a.x-b.x, a.y-b.y) || 1, z0:crop.z, anchor:toImg(mid.x, mid.y)};
    drawCrop(); return;
  }
  if (crop.pointers.size > 2) return;
  if (crop.pan){ crop.act = {type:"pan", lx:e.clientX, ly:e.clientY}; return; }
  const p = toImg(e.clientX, e.clientY), tol = 22/ppi();
  const cur = crop.rects[crop.sel];
  if (cur){
    const dp = delPos(cur);
    if (Math.hypot(dp.x - p.x, dp.y - p.y) < 16/ppi()){ crop.pointers.delete(e.pointerId); deleteSel(); return; }
  }
  snap();
  if (cur){
    const cs = corners(cur), ci = cs.findIndex(([x, y]) => Math.hypot(x - p.x, y - p.y) < tol);
    if (ci >= 0){ const [ax, ay] = cs[3 - ci]; crop.act = {type:"resize", ax, ay}; return; }
  }
  for (let i = crop.rects.length - 1; i >= 0; i--){
    const q = crop.rects[i];
    if (p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h){ crop.sel = i; crop.act = {type:"move", ox:p.x - q.x, oy:p.y - q.y}; drawCrop(); return; }
  }
  const tplSrc = crop.rects[crop.sel] || crop.rects[crop.rects.length - 1];
  const tpl = tplSrc ? {w:tplSrc.w, h:tplSrc.h} : null;
  crop.rects.push({x:p.x, y:p.y, w:0, h:0, role:crop.role});
  crop.sel = crop.rects.length - 1;
  crop.act = {type:"resize", ax:p.x, ay:p.y, isNew:true, tpl, px:p.x, py:p.y};
  drawCrop();
});
cropCv.addEventListener("pointermove", e => {
  if (!crop.pointers.has(e.pointerId)) return;
  crop.pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (crop.pinch && crop.pointers.size >= 2){
    const [a, b] = [...crop.pointers.values()], mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    const d = Math.hypot(a.x-b.x, a.y-b.y) || 1, box = cropCv.getBoundingClientRect();
    crop.z = clamp(crop.pinch.z0 * d / crop.pinch.d0, 1, 12);
    const k = ppi();
    crop.vx = crop.pinch.anchor.x - (mid.x - box.left)/k; crop.vy = crop.pinch.anchor.y - (mid.y - box.top)/k;
    drawCrop(); return;
  }
  if (!crop.act) return;
  if (crop.act.type === "pan"){
    const k = ppi();
    crop.vx -= (e.clientX - crop.act.lx)/k; crop.vy -= (e.clientY - crop.act.ly)/k;
    crop.act.lx = e.clientX; crop.act.ly = e.clientY; drawCrop(); return;
  }
  const r = crop.rects[crop.sel]; if (!r) return;
  const p = toImg(e.clientX, e.clientY), iw = crop.img.naturalWidth, ih = crop.img.naturalHeight;
  if (crop.act.type === "move"){
    r.x = clamp(p.x - crop.act.ox, 0, iw - r.w); r.y = clamp(p.y - crop.act.oy, 0, ih - r.h);
  } else {
    const {ax, ay} = crop.act, px = clamp(p.x, 0, iw), py = clamp(p.y, 0, ih);
    let w = Math.abs(px - ax), h = Math.abs(py - ay);
    const dx = px >= ax ? 1 : -1, dy = py >= ay ? 1 : -1;
    if (crop.lock){
      const k = cardRatio();
      if (h < w*k) h = w*k; else w = h/k;
      const mw = dx > 0 ? iw - ax : ax, mh = dy > 0 ? ih - ay : ay;
      if (w > mw){ w = mw; h = w*k; }
      if (h > mh){ h = mh; w = h/k; }
    }
    r.w = w; r.h = h; r.x = dx > 0 ? ax : ax - w; r.y = dy > 0 ? ay : ay - h;
    if (!crop.act.isNew) syncSizes(r);
  }
  drawCrop();
});
function endPointer(e){
  crop.pointers.delete(e.pointerId);
  if (crop.pinch){ if (crop.pointers.size < 2){ crop.pinch = null; crop.act = null; } return; }
  if (crop.act && crop.act.isNew){
    const r = crop.rects[crop.sel];
    if (r && Math.min(r.w, r.h)*ppi() < 14){
      const t = crop.act.tpl;
      if (crop.sameSize && t){
        const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight;
        r.w = t.w; r.h = t.h;
        r.x = clamp(crop.act.px - t.w/2, 0, iw - t.w); r.y = clamp(crop.act.py - t.h/2, 0, ih - t.h);
      } else { crop.rects.splice(crop.sel, 1); crop.sel = -1; }
    }
  }
  crop.act = null; drawCrop();
}
cropCv.addEventListener("pointerup", endPointer);
cropCv.addEventListener("pointercancel", endPointer);

$("cropLock").onchange = e => crop.lock = e.target.checked;
$("sameSize").onchange = e => { crop.sameSize = e.target.checked; const r = crop.rects[crop.sel]; if (r && crop.sameSize){ syncSizes(r); drawCrop(); } };
function syncSizes(src){
  if (!crop.sameSize || !src) return;
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight;
  crop.rects.forEach(r => {
    if (r === src) return;
    const cx = r.x + r.w/2, cy = r.y + r.h/2;
    r.w = Math.min(src.w, iw); r.h = Math.min(src.h, ih);
    r.x = clamp(cx - r.w/2, 0, iw - r.w); r.y = clamp(cy - r.h/2, 0, ih - r.h);
  });
}
function snap(){
  const st = JSON.stringify(crop.rects);
  if (crop.undo[crop.undo.length - 1] !== st){ crop.undo.push(st); if (crop.undo.length > 150) crop.undo.shift(); }
}
function undoCrop(){
  const cur = JSON.stringify(crop.rects);
  while (crop.undo.length){
    const st = crop.undo.pop();
    if (st !== cur){ crop.rects = JSON.parse(st); crop.sel = -1; drawCrop(); return; }
  }
  toast("No hay nada para deshacer."); drawCrop();
}
function deleteSel(){
  if (crop.sel < 0){ toast("Tocá primero la zona que querés borrar."); return; }
  snap(); crop.rects.splice(crop.sel, 1); crop.sel = -1; drawCrop();
}
function delPos(r){
  const k = kScale(), off = Math.min(26/k, r.w/3, r.h/3);
  return {x:r.x + r.w - off, y:r.y + off};
}
$("undoBtn").onclick = undoCrop;
$("delTop").onclick = deleteSel;
function moveSel(dx, dy){
  const r = crop.rects[crop.sel]; if (!r) return;
  snap();
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight;
  r.x = clamp(r.x + dx, 0, iw - r.w); r.y = clamp(r.y + dy, 0, ih - r.h);
  drawCrop();
}
function resizeSel(dw, dh){
  const r = crop.rects[crop.sel]; if (!r) return;
  snap();
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight, cx = r.x + r.w/2, cy = r.y + r.h/2;
  r.w = clamp(r.w + dw, 8, iw); r.h = clamp(r.h + dh, 8, ih);
  r.x = clamp(cx - r.w/2, 0, iw - r.w); r.y = clamp(cy - r.h/2, 0, ih - r.h);
  syncSizes(r); drawCrop();
}
function stepPx(big){ return Math.max(1, Math.round((big ? 10 : 1) * Math.max(1, 1.5/kScale()))); }
$("selTools").addEventListener("click", e => {
  const b = e.target.closest("button[data-n]"); if (!b) return;
  const st = stepPx(false)*2, dx = +b.dataset.dx*st, dy = +b.dataset.dy*st;
  if (b.dataset.n === "mv") moveSel(dx, dy); else resizeSel(dx, dy);
});
document.addEventListener("keydown", e => {
  if (!crop.img || !$("cropModal").classList.contains("on")) return;
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); undoCrop(); return; }
  if (e.key === "Tab" && crop.rects.length){
    e.preventDefault();
    const n = crop.rects.length;
    crop.sel = crop.sel < 0 ? 0 : (crop.sel + (e.shiftKey ? -1 : 1) + n) % n;
    drawCrop(); return;
  }
  if (e.key === "Escape"){ if (crop.sel >= 0){ crop.sel = -1; drawCrop(); } else closeCrop(); return; }
  if ((e.key === "Delete" || e.key === "Backspace") && crop.sel >= 0){ e.preventDefault(); deleteSel(); return; }
  const d = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[e.key];
  if (!d || crop.sel < 0) return;
  e.preventDefault();
  const st = stepPx(e.ctrlKey || e.metaKey || e.altKey);
  if (e.shiftKey) resizeSel(d[0]*st, d[1]*st); else moveSel(d[0]*st, d[1]*st);
});
$("sameBack").onchange = e => { crop.same = e.target.checked; drawCrop(); };
$("cropDel").onclick = deleteSel;
$("cropClear").onclick = () => { if (!crop.rects.length) return; snap(); crop.rects = []; crop.sel = -1; drawCrop(); toast("Zonas borradas. Podés recuperarlas con Deshacer."); };
$("gridApply").onclick = () => {
  if (!crop.img) return;
  const cols = clamp(Math.round(+$("gridCols").value || 1), 1, 12), rows = clamp(Math.round(+$("gridRows").value || 1), 1, 12);
  const iw = crop.img.naturalWidth, ih = crop.img.naturalHeight, cw = iw/cols, ch = ih/rows, k = cardRatio();
  snap();
  crop.rects = crop.rects.filter(r => r.role !== crop.role);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
    let w = cw*0.96, h = ch*0.96;
    if (crop.lock){ if (h/w > k) h = w*k; else w = h/k; }
    crop.rects.push({x:c*cw + (cw - w)/2, y:r*ch + (ch - h)/2, w, h, role:crop.role});
  }
  crop.sel = -1; drawCrop();
};
async function cropRefs(list){
  const out = [];
  for (const r of list){
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
    c.getContext("2d").drawImage(crop.img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    out.push(await refFromCanvas(c));
  }
  return out;
}
$("cropCreate").onclick = async () => {
  const fronts = crop.rects.filter(r => r.role === "front"), backs = crop.rects.filter(r => r.role === "back");
  const fRefs = await cropRefs(fronts), bRefs = await cropRefs(crop.same ? backs.slice(0, 1) : backs);
  let msg = "";
  if (fRefs.length){
    const made = fRefs.map(ref => ({id:newId("c"), front:ref, back:null}));
    state.cards.push(...made);
    msg = `${made.length} ${made.length === 1 ? "tarjeta creada" : "tarjetas creadas"}`;
    if (bRefs.length){
      if (crop.same){ state.commonBack = bRefs[0]; state.backMode = "image"; msg += " con el dorso de la colección"; }
      else { made.forEach((c, i) => { if (bRefs[i]) c.back = bRefs[i]; }); msg += " con sus dorsos"; }
    }
  } else if (bRefs.length){
    if (crop.same){ state.commonBack = bRefs[0]; state.backMode = "image"; msg = "Dorso de la colección actualizado"; }
    else {
      if (!state.cards.length){ toast("Primero creá los frentes; después asignás los dorsos.", 3500); return; }
      const start = clamp(Math.round(+$("cropStart").value || 1), 1, state.cards.length) - 1;
      let k = 0; bRefs.forEach((ref, i) => { const c = state.cards[start + i]; if (c){ c.back = ref; k++; } });
      msg = `${k} dorsos asignados desde la tarjeta #${start+1}`;
    }
  }
  closeCrop(); toast(msg + ".", 3000);
};

/* ---------- quitar un color de una imagen ---------- */
const ph0IsLogo = ref => !!ref && [state.logo, state.logo2, state.commonBack].some(r => r && r.photoId === ref.photoId);
const key = {work:null, ctx:null, base:null, history:[], onDone:null, ref:null};
async function openKey(ref, onDone){
  const ph = photos.get(ref.photoId); if (!ph) return;
  await ensureFull([ref.photoId]);
  const im = imgOf(ref.photoId);
  const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
  const ctx = c.getContext("2d", {willReadFrequently:true}); ctx.drawImage(im, 0, 0);
  Object.assign(key, {work:c, ctx, base:ctx.getImageData(0, 0, c.width, c.height), history:[], onDone, ref});
  $("keyModal").classList.add("on"); drawKey();
}
function closeKey(){ $("keyModal").classList.remove("on"); key.work = null; key.history = []; }
function drawKey(){
  const cv = $("keyCanvas");
  cv.width = key.work.width; cv.height = key.work.height;
  cv.getContext("2d").drawImage(key.work, 0, 0);
  $("keyUndo").disabled = !key.history.length;
}
function removeColorAt(px, py){
  const {work, ctx} = key, W = work.width, H = work.height;
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  const i0 = (py*W + px)*4;
  if (d[i0+3] === 0) return false;
  key.history.push(img); if (key.history.length > 15) key.history.shift();
  const out = new ImageData(new Uint8ClampedArray(d), W, H), o = out.data;
  const tr = d[i0], tg = d[i0+1], tb = d[i0+2], tol = +$("keyTol").value, soft = tol*1.6;
  const dist = i => Math.hypot(d[i]-tr, d[i+1]-tg, d[i+2]-tb);
  const fade = (i, dd) => { if (dd <= tol) o[i+3] = 0; else if (dd <= soft) o[i+3] = Math.min(o[i+3], Math.round(d[i+3]*(dd - tol)/(soft - tol))); };
  if ($("keyFlood").checked){
    const seen = new Uint8Array(W*H), stack = [py*W + px];
    seen[py*W + px] = 1;
    while (stack.length){
      const p = stack.pop(), i = p*4, dd = dist(i);
      if (d[i+3] === 0 || dd <= tol){
        fade(i, dd);
        const x = p % W, y = (p - x)/W;
        if (x > 0 && !seen[p-1]){ seen[p-1] = 1; stack.push(p-1); }
        if (x < W-1 && !seen[p+1]){ seen[p+1] = 1; stack.push(p+1); }
        if (y > 0 && !seen[p-W]){ seen[p-W] = 1; stack.push(p-W); }
        if (y < H-1 && !seen[p+W]){ seen[p+W] = 1; stack.push(p+W); }
      } else fade(i, dd); // borde: transparencia parcial
    }
  } else {
    for (let i = 0; i < d.length; i += 4) if (d[i+3]) fade(i, dist(i));
  }
  ctx.putImageData(out, 0, 0);
  return true;
}
$("keyCanvas").addEventListener("pointerdown", e => {
  if (!key.work) return;
  const b = e.currentTarget.getBoundingClientRect();
  const px = Math.floor((e.clientX - b.left)/b.width*key.work.width), py = Math.floor((e.clientY - b.top)/b.height*key.work.height);
  if (px < 0 || py < 0 || px >= key.work.width || py >= key.work.height) return;
  if (removeColorAt(px, py)) drawKey();
});
$("keyUndo").onclick = () => { const prev = key.history.pop(); if (prev){ key.ctx.putImageData(prev, 0, 0); drawKey(); } };
$("keyReset").onclick = () => { if (!key.work) return; key.ctx.putImageData(key.base, 0, 0); key.history = []; drawKey(); };
$("keyClose").onclick = closeKey;
$("keyApply").onclick = async () => {
  if (!key.work) return;
  const c = key.work, alpha = hasAlpha(c);
  const blob = await new Promise(r => alpha ? c.toBlob(r, "image/png") : c.toBlob(r, "image/jpeg", 0.92));
  const id = newId("f"); addPhoto(id, c, blob, alpha, false, ph0IsLogo(key.ref));
  const cb = key.onDone, nr = {...key.ref, photoId:id};
  closeKey(); cb && cb(nr); renderAll(); toast("Color quitado.");
};
$("swapColors").onclick = () => {
  [state.backColor, state.patternColor] = [state.patternColor, state.backColor];
  if (state.backTextColor.toLowerCase() === state.backColor.toLowerCase()){ state.backTextColor = state.patternColor; $("backTextColor").value = state.backTextColor; }
  $("backColor").value = state.backColor; $("patternColor").value = state.patternColor;
  renderBackTab(); scheduleGrid();
};
