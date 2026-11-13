/* Hojas de fotos · imágenes y dibujo
   Fotos en memoria (miniatura siempre, completa solo para la hoja visible),
   el dibujo de cada hoja (marcos tipo polaroid, epígrafes, marcas de corte) y las miniaturas. */

/* ---------- imágenes en memoria ----------
   Cada foto guarda siempre una miniatura chica (sl.thumb). La versión completa
   solo se decodifica para la hoja visible y para exportar, así un proyecto con
   cientos de fotos no agota la memoria del teléfono. */
const FULL = 1600, THUMB = 360;
const fullCache = new Map(), fullLoading = new Set();
function pageSlots(p){ const a = pageStart(p), n = perPage(p), out = []; for (let i = a; i < a+n; i++){ const sl = slot(i); if (sl) out.push(sl); } return out; }
async function makeThumb(src){
  const k = Math.min(1, THUMB / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width*k)); c.height = Math.max(1, Math.round(src.height*k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const thumbBlob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
  const thumb = await createImageBitmap(c);
  c.width = c.height = 0;
  return {thumb, thumbBlob};
}
function wantFull(){
  for (const sl of pageSlots(state.page)){
    const b = fullCache.get(sl.id);
    if (b){ fullCache.delete(sl.id); fullCache.set(sl.id, b); continue; }
    if (fullLoading.has(sl.id)) continue;
    fullLoading.add(sl.id);
    createImageBitmap(sl.blob)
      .then(bmp => { fullCache.set(sl.id, bmp); trimFull(); draw("preview"); })
      .catch(() => {})
      .finally(() => fullLoading.delete(sl.id));
  }
}
function trimFull(){
  const keep = new Set(pageSlots(state.page).map(sl => sl.id)), cap = perPage() + 6;
  for (const [id, b] of fullCache){
    if (fullCache.size <= cap) break;
    if (!keep.has(id)){ b.close(); fullCache.delete(id); }
  }
}
function releaseImages(){
  fullCache.forEach(b => b.close()); fullCache.clear();
  state.slots.forEach(sl => { if (sl && sl.thumb && sl.thumb.close) sl.thumb.close(); });
}

/* ---------- dibujo ---------- */
// hi: Map opcional id → imagen completa (para exportar)
function render(ctx, s, page, ui, hi){
  const a = pageStart(page), cs = cells(page), P = paper(page);
  ctx.save();
  ctx.fillStyle = state.bg; ctx.fillRect(0,0,P.w*s,P.h*s);
  cs.forEach((cell, li) => {
    const gi = a + li, sl = slot(gi), pr = photoRect(cell);
    if (state.style !== "completa"){ ctx.fillStyle = "#ffffff"; ctx.fillRect(cell.x*s, cell.y*s, cell.w*s, cell.h*s); }
    if (sl){
      const g = geom(sl, pr, s);
      ctx.save();
      ctx.beginPath(); ctx.rect(pr.x*s, pr.y*s, pr.w*s, pr.h*s); ctx.clip();
      const x0 = pr.x*s - g.ex*sl.fx, y0 = pr.y*s - g.ey*sl.fy;
      ctx.translate(x0 + g.dw/2, y0 + g.dh/2);
      ctx.rotate((sl.rot||0) * Math.PI/180);
      let src = (hi && hi.get(sl.id)) || (ui === "full" && fullCache.get(sl.id)) || sl.thumb;
      // brillo, contraste y sombras: en pantalla con una versión mediana; al exportar, con la foto completa
      if (MFC.hasAdj(sl.adj)) src = src === sl.thumb ? MFC.adjusted(src, sl.adj, sl.id, {holder:sl}) : MFC.adjusted(src, sl.adj, sl.id, hi ? {} : {max:1000});
      const w = sl.w*g.sc, h = sl.h*g.sc;
      ctx.drawImage(src, -w/2, -h/2, w, h);
      ctx.restore();
      if (state.captions && sl.caption) drawCaption(ctx, s, sl, cell, pr);
      if (ui && dpiOf(sl, cell) < LOW_DPI) drawLowRes(ctx, s, pr); // solo en pantalla, nunca en lo impreso
    } else if (ui){
      ctx.fillStyle = "#f1eef6"; ctx.fillRect(pr.x*s, pr.y*s, pr.w*s, pr.h*s);
      ctx.strokeStyle = "#b9a6d4"; ctx.lineWidth = Math.max(1, 0.3*s); ctx.setLineDash([1.5*s, 1.2*s]);
      ctx.strokeRect(pr.x*s, pr.y*s, pr.w*s, pr.h*s); ctx.setLineDash([]);
      if (ui === "full"){
        ctx.fillStyle = "#8a74ad"; ctx.font = `600 ${Math.max(10, 4*s)}px Figtree, system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("+", (pr.x+pr.w/2)*s, (pr.y+pr.h/2)*s);
      }
    }
    if (state.cuts){ ctx.strokeStyle = "#c4c4c4"; ctx.lineWidth = Math.max(0.5, 0.12*s); ctx.strokeRect(cell.x*s, cell.y*s, cell.w*s, cell.h*s); }
    if (ui === "full"){
      if (state.flash.includes(gi)){ ctx.fillStyle = "rgba(107,63,160,.28)"; ctx.fillRect(cell.x*s, cell.y*s, cell.w*s, cell.h*s); }
      if (gi === state.moving){
        ctx.strokeStyle = "#6b3fa0"; ctx.lineWidth = Math.max(2, 0.9*s); ctx.setLineDash([2.5*s, 1.5*s]);
        ctx.strokeRect(cell.x*s, cell.y*s, cell.w*s, cell.h*s); ctx.setLineDash([]);
      } else if (gi === state.sel){
        ctx.strokeStyle = "#6b3fa0"; ctx.lineWidth = Math.max(2, 0.8*s);
        ctx.strokeRect(cell.x*s, cell.y*s, cell.w*s, cell.h*s);
      }
    }
  });
  ctx.restore();
}
function drawLowRes(ctx, s, pr){
  const r = Math.max(5, Math.min(pr.w, pr.h)*0.09*s), cx = pr.x*s + r*1.4, cy = pr.y*s + r*1.4;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = "#f59e0b"; ctx.fill();
  ctx.lineWidth = Math.max(1, r*0.18); ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = "#1d1300"; ctx.font = `800 ${r*1.3}px Figtree, system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", cx, cy + r*0.05);
  ctx.restore();
}
function drawCaption(ctx, s, sl, cell, pr){
  let pos = sl.pos || state.capPos;
  if (pos === "marco" && state.style !== "polaroid") pos = "br";
  if (pos === "marco"){
    const strip = cell.y + cell.h - (pr.y + pr.h), fam = 'Caveat, "Segoe Print", cursive';
    let size = strip*0.55*s; ctx.font = `500 ${size}px ${fam}`;
    while (size > 3 && ctx.measureText(sl.caption).width > pr.w*s*0.95){ size *= 0.92; ctx.font = `500 ${size}px ${fam}`; }
    ctx.fillStyle = "#3a3a3a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sl.caption, (cell.x+cell.w/2)*s, (pr.y+pr.h+strip/2)*s);
    return;
  }
  const ref = Math.min(pr.w, pr.h), pad = ref*0.05*s, fam = "Figtree, system-ui, sans-serif";
  let size = ref*0.1*s; ctx.font = `700 ${size}px ${fam}`;
  while (size > 3 && ctx.measureText(sl.caption).width > pr.w*s - 2*pad){ size *= 0.92; ctx.font = `700 ${size}px ${fam}`; }
  const v = pos[0], h = pos[1];
  ctx.textAlign = h === "r" ? "right" : h === "l" ? "left" : "center";
  ctx.textBaseline = v === "b" ? "bottom" : "top";
  const x = h === "r" ? (pr.x+pr.w)*s - pad : h === "l" ? pr.x*s + pad : (pr.x+pr.w/2)*s;
  const y = v === "b" ? (pr.y+pr.h)*s - pad : pr.y*s + pad;
  ctx.lineJoin = "round"; ctx.lineWidth = size*0.2; ctx.strokeStyle = "#000"; ctx.strokeText(sl.caption, x, y);
  ctx.fillStyle = "#fff"; ctx.fillText(sl.caption, x, y);
}

// mode: "preview" solo la hoja grande · "page" también su miniatura · sin valor todo
function draw(mode){
  const P = paper(), ratio = P.w/P.h;
  const css = `${P.w} / ${P.h}`;
  if (preview.style.aspectRatio !== css){
    preview.style.aspectRatio = css;
    preview.style.maxWidth = `min(${P.w > P.h ? 760 : 540}px, calc((100vh - 200px) * ${ratio.toFixed(4)}))`;
  }
  const dpr = window.devicePixelRatio || 1, cw = preview.clientWidth || 300;
  const W = Math.round(cw*dpr), H = Math.round(cw*dpr/ratio);
  if (preview.width !== W || preview.height !== H){ preview.width = W; preview.height = H; }
  render(pctx, W/P.w, state.page, "full");
  $("pnum").textContent = `Hoja ${state.page+1} de ${state.pages}`;
  syncOrientSeg();
  $("prevBtn").disabled = state.page === 0;
  $("nextBtn").disabled = state.page >= state.pages-1;
  $("movebar").classList.toggle("on", state.moving >= 0);
  if (!statusLock) $("status").textContent = statusText();
  $("undoBtn").disabled = !undoStack.length;
  if (mode !== "preview"){ scheduleThumbs(mode !== "page"); noteChange(); }
  wantFull();
}
function statusText(){
  const G = grid(), cm = v => (v/10).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  let size = G.fixed && !G.shrunk ? `fotos de ${G.label} cm`
    : G.shrunk ? `${G.label} cm no entra: se achicó a ${cm(G.w)} × ${cm(G.h)} cm`
    : (pr => `cada foto mide ${cm(pr.w)} × ${cm(pr.h)} cm`)(photoRect({x:0, y:0, w:G.w, h:G.h}));
  let t = `${countOn(state.page)} de ${perPage()} fotos en esta hoja · ${size}`;
  const low = lowResOn(state.page);
  if (low) t += ` · ⚠ ${low} ${low === 1 ? "foto puede salir pixelada" : "fotos pueden salir pixeladas"}`;
  return t;
}
let statusLock = false;
function say(msg, ms=2500){ statusLock = true; $("status").textContent = msg; clearTimeout(say.t); say.t = setTimeout(() => { statusLock = false; draw(); }, ms); }

/* ---------- miniaturas ---------- */
// 0 nada pendiente · 1 solo la hoja actual · 2 todas
let thumbsPending = 0;
function scheduleThumbs(all){
  const lvl = all ? 2 : 1;
  if (thumbsPending){ thumbsPending = Math.max(thumbsPending, lvl); return; }
  thumbsPending = lvl;
  requestAnimationFrame(() => {
    const only = thumbsPending === 1 ? state.page : -1; thumbsPending = 0;
    buildThumbs($("thumbs"), 160, only);
    if ($("overview").classList.contains("on")) buildThumbs($("ovGrid"), 260, only);
  });
}
function buildThumbs(container, px, only = -1){
  const dpr = window.devicePixelRatio || 1;
  while (container.children.length > state.pages) container.lastChild.remove();
  for (let p = 0; p < state.pages; p++){
    let b = container.children[p];
    if (!b){
      b = document.createElement("button"); b.className = "thumb";
      b.innerHTML = "<canvas></canvas><span></span>";
      b.onclick = () => { goTo(+b.dataset.p); if (container.id === "ovGrid") closeOverview(); };
      container.appendChild(b);
    }
    b.dataset.p = p;
    b.classList.toggle("cur", p === state.page);
    b.classList.toggle("target", state.moving >= 0 && p !== state.page);
    const k = countOn(p);
    b.querySelector("span").textContent = `Hoja ${p+1} · ${k} ${k === 1 ? "foto" : "fotos"}`;
    b.setAttribute("aria-label", `Ir a la hoja ${p+1}`);
    const P = paper(p), cv = b.querySelector("canvas"), W = Math.round(px*dpr), H = Math.round(W*P.h/P.w);
    cv.style.aspectRatio = `${P.w} / ${P.h}`;
    const fresh = cv.width !== W || cv.height !== H;
    if (fresh){ cv.width = W; cv.height = H; }
    if (fresh || only < 0 || p === only) render(cv.getContext("2d"), W/P.w, p, "thumb");
  }
  $("sheetsTitle").textContent = `Hojas (${state.pages})`;
}
function syncThumbScroll(){
  const t = $("thumbs").children[state.page];
  if (t) t.scrollIntoView({block:"nearest", inline:"nearest", behavior: reduceMotion ? "auto" : "smooth"});
}
