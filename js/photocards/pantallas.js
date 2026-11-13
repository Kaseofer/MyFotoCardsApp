/* Luli's Photocards · pantallas y arranque
   Las tres pantallas: Mis artistas → un artista → la colección (setView usa el historial
   del navegador, así el botón Atrás del teléfono funciona), los menús ⋯ de colección y
   de artista, la ventana de artista, fotos compartidas desde la galería y el arranque
   de la app (qué se abre primero, nube, service worker). Es el último archivo que se carga. */

/* ---------- inicio ---------- */
syncInputs(); renderAll();
try { document.fonts.ready.then(() => renderAll()); ['700 40px "Playfair Display"', '700 40px "Caveat"'].forEach(f => document.fonts.load(f).then(() => renderAll()).catch(() => {})); } catch(_){}
/* ---------- pantallas: Mis artistas → un artista → la colección ---------- */
const START = (() => {
  const q = new URLSearchParams(location.search), h = location.hash;
  if (q.has("compartidas") || q.has("p") || q.get("vista") === "coleccion") return {v:"work"};
  if (/^#artista-/.test(h)) return {v:"artist", g:decodeURIComponent(h.slice(9))};
  if (/^#coleccion$/.test(h)) return {v:"work"};
  return {v:"home"};
})();
let view = START.v, viewG = START.g || null;
function showOnly(v){
  document.body.dataset.view = v;
  $("homeView").hidden = v !== "home"; $("artistView").hidden = v !== "artist"; $("workView").hidden = v !== "work";
  $("appTitle").hidden = v !== "home"; $("navBack").hidden = v === "home";
}
showOnly(view);
const dbP = () => new Promise(r => { const k = () => (proj && !opening) ? r() : setTimeout(k, 50); k(); });
async function setView(v, g, how = "push"){
  if (view === "work" && v !== "work") { try { await saveProject(); } catch(_){} closeCardMenu(false); }
  view = v; viewG = v === "artist" ? g : null;
  const st = {v, g:viewG, root: how === "root" || (how === "replace" && history.state?.root)};
  const url = location.pathname + location.search.replace(/[?&]vista=coleccion/, "").replace(/^&/, "?") + (v === "artist" ? "#artista-" + encodeURIComponent(g) : v === "work" ? "#coleccion" : "");
  try { if (how === "push") history.pushState(st, "", url); else history.replaceState(st, "", url); } catch(_){}
  showOnly(v); window.scrollTo(0, 0);
  await renderView();
}
async function renderView(){
  if (view === "home") await renderHome();
  else if (view === "artist") await renderArtist(viewG);
  else { await updateBack(); renderAll(); }
}
async function updateBack(){
  const b = $("navBack");
  if (view === "artist"){ b.textContent = "← Mis artistas"; b.setAttribute("aria-label", "Volver a Mis artistas"); return; }
  const g = proj && proj.groupId ? await getGroup(proj.groupId).catch(() => null) : null;
  b.textContent = g ? `← ${g.name}` : "← Mis artistas";
  b.setAttribute("aria-label", g ? `Volver a las colecciones de ${g.name}` : "Volver a Mis artistas");
}
$("navBack").onclick = async () => {
  let parent = {v:"home"};
  if (view === "work" && proj && proj.groupId && await getGroup(proj.groupId).catch(() => null)) parent = {v:"artist", g:proj.groupId};
  const prev = history.state;
  // si se llegó desde la pantalla de arriba, volver en el historial (así el botón «atrás» del teléfono también anda)
  if (prev && !prev.root && prev.v === view) history.back();
  else await setView(parent.v, parent.g, parent.v === "home" ? "root" : "replace");
};
window.addEventListener("popstate", async e => {
  const st = e.state || {v:"home"};
  if (st.v === view && st.g === viewG) return;
  if (view === "work") { try { await saveProject(); } catch(_){} }
  view = st.v; viewG = st.g || null; showOnly(view); await renderView();
});
const normKey = t => norm(t).replace(/[\s\-_.·'’]/g, "");
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function initialOf(name){ return ((name || "?").trim()[0] || "?").toLocaleUpperCase("es"); }
function colorOf(name){ let h = 0; for (const ch of name || "") h = (h*31 + ch.charCodeAt(0)) % 360; return `hsl(${h},55%,48%)`; }
async function paintAvatar(el, g){
  el.innerHTML = ""; el.textContent = initialOf(g.name); el.style.background = colorOf(g.name);
  const id = g.photoId; if (!id) return;
  try {
    const blob = await getLib(id); if (!blob) return;
    const bmp = await createImageBitmap(blob), cv = document.createElement("canvas"), S = 192;
    cv.width = cv.height = S; const x = cv.getContext("2d"), k = Math.max(S/bmp.width, S/bmp.height);
    x.drawImage(bmp, (S - bmp.width*k)/2, (S - bmp.height*k)/2, bmp.width*k, bmp.height*k); bmp.close && bmp.close();
    el.textContent = ""; el.style.background = "#fff"; el.appendChild(cv);
  } catch(_){}
}
function notice(el, text, label, fn){
  const n = $(el); n.querySelector("span").textContent = text;
  const b = n.querySelector("button"); b.hidden = !label; b.textContent = label || "";
  b.onclick = async () => { n.hidden = true; await fn(); };
  n.hidden = false; clearTimeout(n._t); n._t = setTimeout(() => n.hidden = true, 12000);
}
async function libraryData(){
  await dbP();
  const [gs, list] = await Promise.all([listGroups().catch(() => []), listProjects().catch(() => [])]);
  return {gs, list, gmap:new Map(gs.map(g => [g.id, g]))};
}
const cardsOf = p => (proj && p.id === proj.id) ? state.cards.length : (p.cardCount ?? (p.cards || []).length);
async function renderHome(){
  const {gs, list, gmap} = await libraryData(); if (view !== "home") return;
  const q = normKey($("artistSearch").value);
  const grid = $("artistGrid"); grid.innerHTML = "";
  $("homeEmpty").hidden = gs.length > 0; $("searchRow").hidden = gs.length === 0; grid.hidden = gs.length === 0;
  const shown = gs.filter(g => !q || normKey(g.name).includes(q));
  shown.forEach(g => {
    const n = list.filter(p => p.groupId === g.id).length;
    const b = document.createElement("button"); b.className = "artcard"; b.dataset.g = g.id;
    const av = document.createElement("span"); av.className = "avatar"; av.setAttribute("aria-hidden", "true"); paintAvatar(av, g);
    const nm = document.createElement("b"); nm.textContent = g.name;
    const sm = document.createElement("small"); sm.textContent = plural(n, "colección", "colecciones");
    b.append(av, nm, sm); b.setAttribute("aria-label", `${g.name}, ${sm.textContent}`);
    b.onclick = () => setView("artist", g.id);
    grid.appendChild(b);
  });
  const typed = $("artistSearch").value.trim();
  const add = document.createElement("button"); add.className = "artcard add"; add.id = "addArtistCard";
  add.innerHTML = '<span class="plus" aria-hidden="true">＋</span><span></span>';
  add.lastChild.textContent = q && !shown.length ? `Agregar «${typed}»` : "Agregar artista o grupo";
  add.onclick = () => openArtistDialog(null, q && !shown.length ? typed : "");
  grid.appendChild(add);
  // colecciones de antes, sin artista (las vacías no se muestran)
  const loose = list.filter(p => !gmap.has(p.groupId) && cardsOf(p) > 0);
  $("looseSec").hidden = !loose.length;
  const box = $("looseList"); box.innerHTML = "";
  loose.forEach(p => box.appendChild(colItem(p, true)));
}
$("artistSearch").addEventListener("input", () => renderHome());
$("homeAddArtist").onclick = () => openArtistDialog(null, "");
async function renderArtist(gid){
  const {list, gmap} = await libraryData(); if (view !== "artist") return;
  const g = gmap.get(gid);
  if (!g){ await setView("home", null, "root"); return; }
  const mine = list.filter(p => p.groupId === g.id).sort((a, b) => b.updated - a.updated);
  paintAvatar($("artAvatar"), g);
  $("artName").textContent = g.name; $("artCount").textContent = plural(mine.length, "colección", "colecciones");
  updateBack();
  const box = $("colList"); box.innerHTML = "";
  mine.forEach(p => box.appendChild(colItem(p, false)));
  $("colEmpty").hidden = mine.length > 0;
}
function colItem(p, loose){
  const it = document.createElement("div"); it.className = "colitem"; it.dataset.p = p.id;
  const open = document.createElement("button"); open.className = "colopen";
  const cv = document.createElement("canvas"); projThumb(cv, p);
  const tx = document.createElement("span"), b = document.createElement("b"), sm = document.createElement("small");
  b.textContent = p.name; sm.textContent = plural(cardsOf(p), "tarjeta", "tarjetas");
  tx.append(b, sm); open.append(cv, tx);
  open.setAttribute("aria-label", `Abrir ${p.name}, ${sm.textContent}`);
  open.onclick = () => openCollection(p.id);
  it.appendChild(open);
  if (loose){ const pk = document.createElement("button"); pk.className = "pickbtn"; pk.textContent = "Elegir artista"; pk.onclick = () => moveToArtist(p, "Elegir artista"); it.appendChild(pk); }
  const more = document.createElement("button"); more.className = "pmorebtn"; more.textContent = "⋯"; more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-label", `Más acciones de ${p.name}`);
  more.onclick = () => popMenu(more, [
    {label:"Cambiar nombre", fn:() => renameCollection(p)},
    {label:"Cambiar portada", fn:() => chooseCover(p), off: cardsOf(p) === 0},
    {label:"Duplicar colección", fn:() => duplicateCollection(p)},
    {label: loose ? "Elegir artista" : "Mover a otro artista", fn:() => moveToArtist(p, loose ? "Elegir artista" : "Mover a otro artista")},
    {label:"Eliminar", danger:true, confirm:true, fn:() => deleteCollection(p)}
  ]);
  it.appendChild(more);
  return it;
}
async function openCollection(id){
  if (!proj || proj.id !== id){ await saveProject(); await openProject(id); }
  await setView("work");
}
/* cambia datos de una colección sin abrirla (o, si está abierta, en memoria y guardando) */
async function updateMeta(id, ch){
  if (proj && proj.id === id){ Object.assign(proj, ch); syncInputs(); updateClassChip(); await saveProject(true); return; }
  const d = await db(), t = d.transaction("projects", "readwrite"), st = t.objectStore("projects");
  const rec = await reqP(st.get(id)); if (!rec) return;
  st.put({...rec, ...ch, updated:Date.now()}); await doneP(t);
}
const refresh = () => renderView();
function askName(title, value, okLabel = "Guardar"){
  return new Promise(res => {
    $("nameTitle").textContent = title; $("nameIn").value = value; $("nameOk").textContent = okLabel;
    const done = v => { $("nameModal").classList.remove("on"); $("nameOk").onclick = $("nameCancel").onclick = null; $("nameIn").onkeydown = null; res(v); };
    $("nameOk").onclick = () => { const v = $("nameIn").value.trim(); if (!v){ $("nameIn").focus(); return; } done(v); };
    $("nameCancel").onclick = () => done(null);
    $("nameIn").onkeydown = e => { if (e.key === "Enter") $("nameOk").click(); };
    $("nameModal").classList.add("on");
  });
}
async function renameCollection(p){
  const v = await askName("Cambiar nombre", p.name); if (!v || v === p.name) return;
  await updateMeta(p.id, {name:v}); await refresh(); toast("Nombre cambiado.");
}
async function duplicateCollection(p){
  if (proj && p.id === proj.id) await saveProject(true);
  const v = await askName("Duplicar colección", `${p.name} — copia`, "Duplicar"); if (!v) return;
  await duplicateProject(p.id, v); await refresh();
}
async function deleteCollection(p){
  const cur = proj && p.id === proj.id;
  if (cur) await saveProject(true);
  await keepDeleted(p.id); await deleteProject(p.id);
  if (cur){ proj = null; const rest = await listProjects(); if (rest.length) await openProject(rest[0].id); else await newProject(); }
  await refresh();
  notice(view === "home" ? "homeNotice" : "artNotice", `Eliminaste «${p.name}».`, "Recuperarla", async () => { await recoverDeleted(); await refresh(); });
}
async function moveToArtist(p, title){
  const g = await pickArtist(title, p.groupId); if (!g || g.id === p.groupId) return;
  const old = p.groupId || null, oldA = p.albumId || null;
  await updateMeta(p.id, {groupId:g.id, albumId:null}); await refresh();
  notice(view === "home" ? "homeNotice" : "artNotice", `«${p.name}» ahora está en ${g.name}.`, "Deshacer", async () => { await updateMeta(p.id, {groupId:old, albumId:oldA}); await refresh(); toast("Listo, volvió a como estaba."); });
}
/* elegir un artista: buscar entre los que hay o crear uno */
function pickArtist(title, currentId){
  return new Promise(async res => {
    const gs = await listGroups().catch(() => []);
    $("pickTitle").textContent = title || "Elegir artista"; $("pickSearch").value = "";
    const done = g => { $("pickModal").classList.remove("on"); $("pickCancel").onclick = null; res(g); };
    const draw = () => {
      const q = normKey($("pickSearch").value), typed = $("pickSearch").value.trim(), box = $("pickList"); box.innerHTML = "";
      const shown = gs.filter(g => !q || normKey(g.name).includes(q));
      shown.forEach(g => {
        const b = document.createElement("button"); const av = document.createElement("span"); av.className = "avatar"; paintAvatar(av, g);
        const t = document.createElement("span"); t.textContent = g.name + (g.id === currentId ? " (ahora está acá)" : "");
        b.append(av, t); b.setAttribute("aria-current", g.id === currentId); b.onclick = () => done(g); box.appendChild(b);
      });
      if (typed && !gs.some(g => normKey(g.name) === q)){
        const c = document.createElement("button"); c.className = "create"; c.textContent = `＋ Crear «${typed}»`;
        c.onclick = async () => { const g = {id:newId("g"), name:typed, logoId:null, albums:[], photoId:null, kind:null, created:Date.now()}; await putGroup(g); done(g); };
        box.appendChild(c);
      }
      if (!box.children.length){ const p = document.createElement("p"); p.className = "muted"; p.style.margin = "0"; p.textContent = "Escribí el nombre para crearlo."; box.appendChild(p); }
    };
    $("pickSearch").oninput = draw; draw();
    $("pickCancel").onclick = () => done(null);
    $("pickModal").classList.add("on");
  });
}
/* portada: una de sus tarjetas */
async function chooseCover(p){
  if (proj && p.id === proj.id) await saveProject(true);
  const d = await db(), rec = await reqP(d.transaction("projects").objectStore("projects").get(p.id)); if (!rec) return;
  const grid = $("coverGrid"); grid.innerHTML = "";
  const close = () => $("coverModal").classList.remove("on");
  $("coverCancel").onclick = close;
  (rec.cards || []).filter(c => c.front).slice(0, 120).forEach(async c => {
    const b = document.createElement("button"); b.setAttribute("aria-current", c.id === rec.cover); b.setAttribute("aria-label", "Usar esta tarjeta de portada");
    const cv = document.createElement("canvas"); b.appendChild(cv); grid.appendChild(b);
    b.onclick = async () => { close(); await updateMeta(p.id, {cover:c.id}); await refresh(); toast("Portada cambiada."); };
    try {
      const ph = await reqP((await db()).transaction("photos").objectStore("photos").get(c.front.photoId)); if (!ph) return;
      const bmp = await MFC.decode(MFC.blobOf(ph)), W = 160, H = Math.round(W*size().h/size().w);
      cv.width = W; cv.height = H; const x = cv.getContext("2d"), k = Math.max(W/bmp.width, H/bmp.height);
      x.drawImage(bmp, (W - bmp.width*k)/2, (H - bmp.height*k)/2, bmp.width*k, bmp.height*k); bmp.close && bmp.close();
    } catch(_){}
  });
  $("coverModal").classList.add("on");
}
/* menú «⋯» de una colección o de un artista */
let popFrom = null;
function popMenu(btn, items){
  const m = $("popMenu"); m.innerHTML = ""; popFrom = btn;
  items.forEach(it => {
    const b = document.createElement("button"); b.setAttribute("role", "menuitem"); b.textContent = it.label; b.disabled = !!it.off;
    if (it.danger) b.className = "danger";
    b.onclick = () => {
      if (it.confirm && !b.dataset.armed){ b.dataset.armed = "1"; b.textContent = "¿Seguro? Tocá de nuevo"; return; }
      closePop(false); it.fn();
    };
    m.appendChild(b);
  });
  m.hidden = false;
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
  m.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";
  btn.setAttribute("aria-expanded", "true");
  m.querySelector("button:not(:disabled)")?.focus();
}
function closePop(back){
  const m = $("popMenu"); if (m.hidden) return;
  m.hidden = true; if (popFrom){ popFrom.setAttribute("aria-expanded", "false"); if (back) popFrom.focus(); } popFrom = null;
}
document.addEventListener("pointerdown", e => { if (!$("popMenu").hidden && !e.target.closest("#popMenu") && e.target !== popFrom) closePop(false); });
window.addEventListener("scroll", () => closePop(false), {passive:true});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("popMenu").hidden){ e.preventDefault(); e.stopImmediatePropagation(); closePop(true); } }, true);
/* agregar o cambiar un artista */
const KINDS = [{id:"artista", label:"Artista"}, {id:"grupo", label:"Grupo"}, {id:"otro", label:"Otro"}];
let artEdit = null, artPhoto = undefined, artKind = null, artAllowDup = false, artGroups = [];
async function openArtistDialog(g, name){
  artEdit = g; artPhoto = undefined; artKind = g ? g.kind || null : null; artAllowDup = false;
  artGroups = await listGroups().catch(() => []);
  $("artModalTitle").textContent = g ? "Cambiar artista o grupo" : "Agregar artista o grupo";
  $("artOk").textContent = g ? "Guardar" : "Crear";
  $("artNameIn").value = g ? g.name : (name || "");
  $("artKindBox").open = !!artKind;
  await artPreview(); artDraw();
  $("artModal").classList.add("on");
}
async function artPreview(){
  const el = $("artPhotoPrev"), name = $("artNameIn").value.trim() || "?";
  if (artPhoto instanceof Blob){
    const bmp = await createImageBitmap(artPhoto), cv = document.createElement("canvas"); cv.width = cv.height = 96;
    const x = cv.getContext("2d"), k = Math.max(96/bmp.width, 96/bmp.height); x.drawImage(bmp, (96 - bmp.width*k)/2, (96 - bmp.height*k)/2, bmp.width*k, bmp.height*k);
    el.innerHTML = ""; el.style.background = "#fff"; el.appendChild(cv);
  } else await paintAvatar(el, {name, photoId: artPhoto === null ? null : artEdit?.photoId});
  $("artPhotoDel").hidden = !(artPhoto instanceof Blob || (artPhoto === undefined && artEdit?.photoId));
  $("artPhotoBtn").textContent = $("artPhotoDel").hidden ? "Elegir foto" : "Cambiar foto";
}
function artDraw(){
  const v = $("artNameIn").value.trim(), k = normKey(v);
  const match = k ? artGroups.find(x => normKey(x.name) === k && x.id !== artEdit?.id) : null;
  $("artDup").hidden = !match || artAllowDup;
  if (match){ $("artDupText").textContent = `Ya tenés a ${match.name}. ¿Querés abrirlo?`; $("artDupOpen").textContent = `Abrir ${match.name}`; $("artDupOpen").onclick = () => { $("artModal").classList.remove("on"); setView("artist", match.id); }; }
  $("artOk").disabled = !v || (!!match && !artAllowDup);
  seg($("artKindSeg"), KINDS, () => artKind, v2 => { artKind = artKind === v2 ? null : v2; artDraw(); });
  [...$("artKindSeg").children].forEach(b => b.onclick = () => { const id = KINDS.find(x => x.label === b.textContent).id; artKind = artKind === id ? null : id; artDraw(); });
}
$("artNameIn").addEventListener("input", () => { artAllowDup = false; artDraw(); if (!(artPhoto instanceof Blob)) artPreview(); });
$("artNameIn").addEventListener("keydown", e => { if (e.key === "Enter" && !$("artOk").disabled) $("artOk").click(); });
$("artDupNew").onclick = () => { artAllowDup = true; artDraw(); $("artNameIn").focus(); };
$("artPhotoBtn").onclick = () => $("fileArtist").click();
$("artPhotoDel").onclick = () => { artPhoto = null; artPreview(); };
$("fileArtist").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const bmp = await createImageBitmap(f), k = Math.min(1, 480 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    artPhoto = await new Promise(r => c.toBlob(r, "image/jpeg", 0.88)); await artPreview();
  } catch(_){ toast("No se pudo abrir esa imagen."); }
};
$("artCancel").onclick = () => $("artModal").classList.remove("on");
$("artOk").onclick = async () => {
  const name = $("artNameIn").value.trim(); if (!name) return;
  let photoId = artEdit ? artEdit.photoId || null : null;
  if (artPhoto instanceof Blob) photoId = await putLib(artPhoto); else if (artPhoto === null) photoId = null;
  $("artModal").classList.remove("on");
  if (artEdit){
    const g = await getGroup(artEdit.id); if (!g) return;
    g.name = name; g.photoId = photoId; g.kind = artKind; await putGroup(g);
    await refresh(); updateClassChip(); toast("Guardado.");
  } else {
    const g = {id:newId("g"), name, logoId:null, albums:[], photoId, kind:artKind, created:Date.now()};
    await putGroup(g); await setView("artist", g.id); toast(`Listo: ${name} está en Mis artistas.`);
  }
};
$("artMenuBtn").onclick = async () => {
  const g = await getGroup(viewG); if (!g) return;
  const n = (await listProjects()).filter(p => p.groupId === g.id).length;
  popMenu($("artMenuBtn"), [
    {label:"Cambiar nombre o foto", fn:() => openArtistDialog(g)},
    {label: n ? "Eliminar (primero mové sus colecciones)" : "Eliminar", danger:true, confirm:true, off: n > 0, fn: async () => {
      const d = await db(), t = d.transaction("groups", "readwrite"); t.objectStore("groups").delete(g.id); await doneP(t);
      await setView("home", null, "root"); toast(`${g.name} se quitó de Mis artistas.`);
    }}
  ]);
};
$("artNewCol").onclick = () => openNC("new", viewG);
$("hojasLink2").addEventListener("click", async e => { e.preventDefault(); try { await saveProject(); } catch(_){} location.href = "hojas.html"; });
/* Decorar: el nombre y la imagen del artista se agregan solo si se pide */
async function renderArtistDecor(){
  const box = $("artistDecor"), g = proj && proj.groupId ? await getGroup(proj.groupId).catch(() => null) : null;
  box.hidden = !g; if (!g) return;
  $("decorName").textContent = `Agregar el nombre de ${g.name}`;
  $("decorName").onclick = () => { state.backMode = "design"; state.backText = g.name; syncInputs(); renderBackTab(); scheduleGrid(); toast(`Listo: dice ${g.name} en la parte de atrás.`); };
  const img = g.logoId || g.photoId;
  $("decorImg").hidden = !img; $("decorImg").textContent = `Agregar la imagen de ${g.name}`;
  $("decorImg").onclick = async () => { const r = await libToRef(img); if (!r) return; state.backMode = "design"; state.logo2 = r; renderBackTab(); scheduleGrid(); toast("Imagen agregada en la parte de atrás."); };
}

// fotos compartidas desde la galería: si lo último que se usó fue Hojas de fotos, van allá
const toHojas = (() => { const q = new URLSearchParams(location.search); return q.has("compartidas") && !q.has("nuevo") && MFC.recall("mfc-modo") === "hojas"; })();
if (toHojas) location.replace("hojas.html" + location.search);
else MFC.initModeNav("cards", () => saveProject());
$("hojasLink").addEventListener("click", async e => { e.preventDefault(); try { await saveProject(); } catch(_){} location.href = "hojas.html"; });
setSaveState("saving"); // mientras abre la última colección
(async () => {
  if (toHojas) return;
  try { await navigator.storage?.persist?.(); } catch(_){}
  const wantId = new URLSearchParams(location.search).get("p");
  const shared = await MFC.takeShared(); // fotos compartidas desde la galería o pasadas desde Hojas de fotos
  if (wantId) history.replaceState(null, "", location.pathname);
  try {
    const list = await listProjects(), last = MFC.recall(LS_LAST);
    const pick = list.find(p => p.id === wantId) || list.find(p => p.id === last) || list[0];
    if (shared && shared.name){
      await newProject();
      proj.name = shared.name;
      if (shared.groupId){
        const g = (await listGroups()).find(x => x.id === shared.groupId), a = g && g.albums.find(x => x.id === shared.albumId);
        if (g){ proj.groupId = g.id; proj.albumId = a ? a.id : null; await applyGroup(g, a); }
      }
      syncInputs(); updateClassChip();
    } else if (pick) await openProject(pick.id); else await newProject();
  } catch(_){
    dbOk = false; opening = false; proj = {id:newId("p"), name:"Colección 1", created:Date.now()};
    syncInputs(); showSaveInfo();
  }
  if (shared){
    if (shared.files.length) await addFronts(shared.files);
    else toast("No llegaron fotos. Probá compartirlas de nuevo.", 4000);
  }
  try { history.replaceState({v:view, g:viewG, root:true}, "", location.href.replace(/[?&]vista=coleccion/, "")); } catch(_){}
  await renderView();
  MFC.cloud.init({mount: $("cloudMount"), flush: () => saveProject(), onRemoteChange: async ({changed, removed, groups}) => {
    if (proj && removed.includes(proj.id)){
      proj = null; const list = await listProjects();
      if (list.length) await openProject(list[0].id); else await newProject();
    } else if (proj && !opening && changed.includes(proj.id) && JSON.stringify(record()) === lastSig) await openProject(proj.id);
    if ($("projModal").classList.contains("on")) renderProjectList();
    if (groups){ updateClassChip(); if ($("groupsModal").classList.contains("on")) renderGroups(); }
    if (view !== "work") renderView(); else updateBack();
  }});
})();
const swAllowed = location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname);
if ("serviceWorker" in navigator && swAllowed){ try { navigator.serviceWorker.register("sw.js").catch(() => {}); } catch(_){} }
