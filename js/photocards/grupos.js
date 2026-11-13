/* Luli's Photocards · artistas, álbumes y ventanas de colección
   Artistas/grupos y álbumes con sus logos (guardados en «libphotos»), la ventana
   «Nueva colección» (primero se elige el artista), la ventana «Mis tarjetas»
   y la copia de seguridad / importación de una colección. */

/* ---------- grupos, álbumes y clasificación ---------- */
const byName = (a, b) => a.name.localeCompare(b.name, "es", {sensitivity:"base"});
async function listGroups(){ const d = await db(); return (await reqP(d.transaction("groups").objectStore("groups").getAll())).sort(byName).map(g => ({...g, albums:(g.albums || []).sort(byName)})); }
async function getGroup(id){ const d = await db(); return await reqP(d.transaction("groups").objectStore("groups").get(id)); }
async function putGroup(g){ const d = await db(), t = d.transaction("groups", "readwrite"); t.objectStore("groups").put(g); await doneP(t); }
async function putLib(blob){ const id = newId("l"), r = await MFC.packRec({id, blob}), d = await db(), t = d.transaction("libphotos", "readwrite"); t.objectStore("libphotos").put(r); await doneP(t); return id; }
async function getLib(id){ if (!id) return null; const d = await db(); const r = await reqP(d.transaction("libphotos").objectStore("libphotos").get(id)); return MFC.blobOf(r); }
async function delLib(ids){ ids = ids.filter(Boolean); if (!ids.length) return; const d = await db(), t = d.transaction("libphotos", "readwrite"); ids.forEach(id => t.objectStore("libphotos").delete(id)); await doneP(t); }
async function fileToPng(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
async function libThumb(cv, id){
  const dpr = devicePixelRatio || 1, W = Math.round(cv.clientWidth*dpr || 44*dpr);
  cv.width = W; cv.height = W;
  const blob = await getLib(id).catch(() => null); if (!blob) return;
  const bmp = await createImageBitmap(blob), sc = Math.min(W/bmp.width, W/bmp.height)*0.9;
  cv.getContext("2d").drawImage(bmp, (W - bmp.width*sc)/2, (W - bmp.height*sc)/2, bmp.width*sc, bmp.height*sc);
}
async function libToRef(id){
  const blob = await getLib(id); if (!blob) return null;
  const pid = newId("f"); addPhoto(pid, await createImageBitmap(blob), blob, true, false, true);
  return {photoId:pid, fx:.5, fy:.5, zoom:1, rot:0};
}
function armed(btn, label, fn){
  btn.onclick = async () => {
    if (!btn.dataset.armed){ btn.dataset.armed = "1"; btn.textContent = "¿Seguro?"; setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000); return; }
    await fn();
  };
}
let libTarget = null;
$("fileLib").onchange = async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f || !libTarget) return;
  try {
    const g = await getGroup(libTarget.gid); if (!g) return;
    const id = await putLib(await fileToPng(f));
    if (libTarget.aid){ const a = g.albums.find(x => x.id === libTarget.aid); await delLib([a.logoId]); a.logoId = id; }
    else { await delLib([g.logoId]); g.logoId = id; }
    await putGroup(g); renderGroups();
  } catch(_){ toast("No se pudo abrir esa imagen."); }
};
function logoButtons(row, g, a){
  const has = a ? a.logoId : g.logoId;
  const up = document.createElement("button"); up.textContent = has ? "Cambiar logo" : "Agregar logo";
  up.onclick = () => { libTarget = {gid:g.id, aid:a ? a.id : null}; $("fileLib").click(); };
  row.appendChild(up);
  if (has){
    const rm = document.createElement("button"); rm.textContent = "Quitar logo";
    rm.onclick = async () => { const gg = await getGroup(g.id); if (a){ const aa = gg.albums.find(x => x.id === a.id); await delLib([aa.logoId]); aa.logoId = null; } else { await delLib([gg.logoId]); gg.logoId = null; } await putGroup(gg); renderGroups(); };
    row.appendChild(rm);
  }
}
async function renderGroups(){
  const box = $("glist"); box.innerHTML = "";
  const gs = await listGroups().catch(() => []);
  if (!gs.length){ box.innerHTML = '<p class="muted" style="text-align:center">Todavía no hay grupos. Escribí el nombre arriba y tocá «Agregar grupo».</p>'; return; }
  gs.forEach(g => {
    const card = document.createElement("div"); card.className = "gcard";
    const row = document.createElement("div"); row.className = "grow main";
    const cv = document.createElement("canvas"); row.appendChild(cv);
    const inp = document.createElement("input"); inp.value = g.name; inp.setAttribute("aria-label", "Nombre del grupo");
    inp.onchange = async () => { const gg = await getGroup(g.id); gg.name = inp.value.trim() || gg.name; await putGroup(gg); updateClassChip(); };
    row.appendChild(inp);
    logoButtons(row, g, null);
    const del = document.createElement("button"); del.textContent = "Eliminar grupo";
    armed(del, "Eliminar grupo", async () => {
      const d = await db(), t = d.transaction("groups", "readwrite"); t.objectStore("groups").delete(g.id); await doneP(t);
      await delLib([g.logoId, ...g.albums.map(a => a.logoId)]); renderGroups(); updateClassChip();
    });
    row.appendChild(del);
    card.appendChild(row);
    requestAnimationFrame(() => libThumb(cv, g.logoId));
    const al = document.createElement("div"); al.className = "albums";
    g.albums.forEach(a => {
      const r = document.createElement("div"); r.className = "grow";
      const c2 = document.createElement("canvas"); r.appendChild(c2);
      const ai = document.createElement("input"); ai.value = a.name; ai.setAttribute("aria-label", "Nombre del álbum o set");
      ai.onchange = async () => { const gg = await getGroup(g.id), aa = gg.albums.find(x => x.id === a.id); aa.name = ai.value.trim() || aa.name; await putGroup(gg); updateClassChip(); };
      r.appendChild(ai);
      logoButtons(r, g, a);
      const x = document.createElement("button"); x.textContent = "Eliminar";
      armed(x, "Eliminar", async () => { const gg = await getGroup(g.id); gg.albums = gg.albums.filter(y => y.id !== a.id); await putGroup(gg); await delLib([a.logoId]); renderGroups(); });
      r.appendChild(x);
      al.appendChild(r);
      requestAnimationFrame(() => libThumb(c2, a.logoId));
    });
    const addRow = document.createElement("div"); addRow.className = "grow";
    const na = document.createElement("input"); na.placeholder = "Nuevo álbum o set"; na.maxLength = 40;
    const nb = document.createElement("button"); nb.textContent = "Agregar álbum o set";
    const addAlbum = async () => { const name = na.value.trim(); if (!name) { na.focus(); return; } const gg = await getGroup(g.id); gg.albums = gg.albums || []; gg.albums.push({id:newId("a"), name, logoId:null}); await putGroup(gg); renderGroups(); };
    nb.onclick = addAlbum; na.onkeydown = e => { if (e.key === "Enter") addAlbum(); };
    addRow.append(na, nb); al.appendChild(addRow);
    card.appendChild(al);
    box.appendChild(card);
  });
}
async function addGroup(){
  const name = $("newGroupName").value.trim(); if (!name){ $("newGroupName").focus(); return; }
  await putGroup({id:newId("g"), name, logoId:null, albums:[]});
  $("newGroupName").value = ""; renderGroups();
}
$("addGroupBtn").onclick = addGroup;
$("newGroupName").onkeydown = e => { if (e.key === "Enter") addGroup(); };
function openGroups(){ $("groupsModal").classList.add("on"); renderGroups(); }
$("groupsBtn").onclick = openGroups;
$("groupsClose").onclick = async () => { $("groupsModal").classList.remove("on"); if ($("ncModal").classList.contains("on")) await fillNC(); updateClassChip(); };

async function updateClassChip(){
  const chip = $("classBtn"); if (!proj) return;
  let txt = "Elegir grupo o artista";
  try {
    const g = proj.groupId && await getGroup(proj.groupId);
    if (g){ const a = (g.albums || []).find(x => x.id === proj.albumId); txt = a ? `${g.name} · ${a.name}` : g.name; }
  } catch(_){}
  chip.textContent = txt; chip.classList.toggle("set", txt !== "Elegir grupo o artista");
}
$("classBtn").onclick = () => openNC("edit");

let ncMode = "new", ncGroups = [];
/* El grupo o artista se elige tocándolo o se escribe: si no existe, se crea al guardar */
const norm = t => (t || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
let ncProjects = [];
const ncFind = () => { const t = norm($("ncArtist").value); return t ? ncGroups.find(g => norm(g.name) === t) || null : null; };
const ncAlbumFind = g => { const t = norm($("ncAlbumIn").value); return g && t ? (g.albums || []).find(a => norm(a.name) === t) || null : null; };
const ncOthers = g => g ? ncProjects.filter(p => p.groupId === g.id && (ncMode === "new" || p.id !== proj?.id)).length : 0;
async function fillNC(selG, selA){
  ncGroups = await listGroups().catch(() => []);
  if (selG !== undefined){
    const g = ncGroups.find(x => x.id === selG);
    $("ncArtist").value = g ? g.name : "";
    $("ncAlbumIn").value = g && selA ? (g.albums.find(a => a.id === selA)?.name || "") : "";
  }
  const dl = $("ncArtistList"); dl.innerHTML = "";
  ncGroups.forEach(g => { const o = document.createElement("option"); o.value = g.name; dl.appendChild(o); });
  ncUpdate();
}
function ncUpdate(){
  const g = ncFind(), typed = $("ncArtist").value.trim();
  const box = $("ncChips"); box.innerHTML = "";
  ncGroups.slice(0, 12).forEach(x => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = x.name; b.setAttribute("aria-pressed", g === x);
    b.onclick = () => { $("ncArtist").value = x.name; $("ncAlbumIn").value = ""; ncUpdate(); };
    box.appendChild(b);
  });
  const n = ncOthers(g);
  $("ncArtistHint").textContent = g ? (n ? `Ya tenés ${n} ${n === 1 ? "colección" : "colecciones"} de ${g.name}. Esta va a ser otra más.` : `Primera colección de ${g.name}.`)
    : typed ? `«${typed}» es nuevo: se va a guardar como grupo o artista.` : "Si no es de un grupo, dejalo vacío.";
  const al = $("ncAlbumList"); al.innerHTML = "";
  (g?.albums || []).forEach(a => { const o = document.createElement("option"); o.value = a.name; al.appendChild(o); });
  suggestName();
}
function suggestName(){
  const n = $("ncName"); if (n.dataset.touched || ncPreset) return;
  const artist = $("ncArtist").value.trim(), album = $("ncAlbumIn").value.trim(), g = ncFind();
  if (!artist){ if (ncMode === "new") n.value = n.dataset.def || ""; return; }
  if (album){ n.value = `${g ? g.name : artist} – ${album}`; return; }
  const k = ncOthers(g);
  n.value = k ? `${g.name} ${k + 1}` : (g ? g.name : artist);
}
$("ncArtist").addEventListener("input", ncUpdate);
$("ncAlbumIn").addEventListener("input", suggestName);
$("ncName").oninput = () => { $("ncName").dataset.touched = "1"; };
async function openNC(mode, groupId){
  ncMode = mode;
  if (mode === "new") await saveProject();
  try { ncProjects = await listProjects(); } catch(_){ ncProjects = []; }
  const preset = mode === "new" && groupId ? await getGroup(groupId).catch(() => null) : null;
  ncPreset = preset;
  $("ncTitle").textContent = preset ? `Nueva colección de ${preset.name}` : mode === "new" ? "Nueva colección" : "Grupo o artista de esta colección";
  $("ncArtistField").hidden = !!preset;
  $("ncNameLabel").textContent = preset ? "¿Cómo se llama tu colección?" : "¿Cómo se llama esta colección?";
  $("ncName").placeholder = preset ? "Por ejemplo: Mis favoritas" : "";
  const sg = $("ncSuggest"); sg.innerHTML = ""; sg.hidden = !preset;
  if (preset) ["Mis favoritas", "Álbum nuevo", `Concierto ${new Date().getFullYear()}`, "Para intercambiar"].forEach(t => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = t;
    b.onclick = () => { $("ncName").value = t; $("ncName").dataset.touched = "1"; $("ncName").focus(); };
    sg.appendChild(b);
  });
  $("ncOk").textContent = mode === "new" ? "Crear" : "Guardar";
  const n = $("ncName"); delete n.dataset.touched;
  if (mode === "new"){
    n.dataset.def = `Colección ${ncProjects.length + 1}`; n.value = n.dataset.def;
    await fillNC(groupId || "", "");
    if (preset){ n.value = ""; }
    $("ncApply").checked = false;
  } else {
    n.value = proj.name; n.dataset.touched = "1";
    await fillNC(proj.groupId || "", proj.albumId || "");
    $("ncApply").checked = false;
  }
  $("ncMore").open = mode !== "new" && !!$("ncAlbumIn").value;
  ncFocus = groupId ? "ncName" : "ncArtist";
  $("ncModal").classList.add("on");
}
let ncFocus = "ncArtist", ncPreset = null;
$("ncCancel").onclick = () => $("ncModal").classList.remove("on");
$("ncManage").onclick = openGroups;
$("ncOk").onclick = async () => {
  const artist = $("ncArtist").value.trim(), album = $("ncAlbumIn").value.trim();
  let g = ncFind(), a = null;
  if (artist && !g){ g = {id:newId("g"), name:artist, logoId:null, albums:[]}; await putGroup(g); }
  if (g && album){
    a = ncAlbumFind(g);
    if (!a){ const gg = (await getGroup(g.id)) || g; gg.albums = gg.albums || []; a = {id:newId("a"), name:album, logoId:null}; gg.albums.push(a); await putGroup(gg); g = gg; }
  }
  let name = $("ncName").value.trim(); const apply = $("ncApply").checked;
  if (!name && g){ const k = ncOthers(g); name = k ? `${g.name} ${k + 1}` : g.name; }
  $("ncModal").classList.remove("on");
  if (ncMode === "new") await newProject();
  proj.groupId = g ? g.id : null; proj.albumId = a ? a.id : null;
  if (name) proj.name = name;
  if (apply) await applyGroup(g, a);
  syncInputs(); renderAll(); updateClassChip();
  await saveProject(true);
  toast(ncMode === "new" ? `Colección «${proj.name}» creada${g ? ` en ${g.name}` : ""}.` : "Guardado.");
  if (ncMode === "new") await setView("work"); else await updateBack();
};
async function applyGroup(g, a){
  if (g){ state.backText = g.name; if (g.logoId){ const r = await libToRef(g.logoId); if (r) state.logo2 = r; } }
  if (a){ state.backText2 = a.name; if (a.logoId){ const r = await libToRef(a.logoId); if (r) state.logo = r; } }
  if (g || a) state.backMode = "design";
}

async function openProjects(){ await saveProject(); $("projModal").classList.add("on"); renderProjectList(); }
function closeProjects(){ $("projModal").classList.remove("on"); }
$("projectsBtn").onclick = openProjects;
$("projClose").onclick = closeProjects;
$("projModal").addEventListener("click", e => { if (e.target.id === "projModal") closeProjects(); });
$("newProjBtn").onclick = () => { closeProjects(); openNC("new"); };

const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const dataURLToBlob = u => MFC.dataURLToBlob(u); // está en common.js
$("exportProjBtn").onclick = async () => {
  if (!proj) return;
  toast("Preparando copia…", 60000);
  const list = [];
  for (const id of usedPhotoIds()) if (photos.has(id)) list.push({id, data: await blobToDataURL(photos.get(id).blob)});
  const data = new Blob([JSON.stringify({format:"photocards-a4", version:1, project:{...record(), updated:Date.now()}, photos:list})], {type:"application/json"});
  const safe = (proj.name || "coleccion").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || "coleccion";
  deliver(data, `${safe}.json`);
};
$("importProjBtn").onclick = () => $("fileBackup").click();
$("fileBackup").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.format !== "photocards-a4" || !j.project) throw 0;
    await saveProject();
    const pid = newId("p"), map = new Map(), prepared = [];
    for (const ph of j.photos || []){ const nid = newId("f"); map.set(ph.id, nid); prepared.push({id:nid, projectId:pid, blob:dataURLToBlob(ph.data)}); }
    const fix = r => r && map.has(r.photoId) ? {...r, photoId:map.get(r.photoId)} : null;
    const cards = (j.project.cards || []).map(c => ({...c, front:fix(c.front), back:fix(c.back)}));
    const packed = await Promise.all(prepared.map(MFC.packRec));
    const d = await db(), t = d.transaction(["projects","photos"], "readwrite");
    packed.forEach(p => t.objectStore("photos").put(p));
    t.objectStore("projects").put({...j.project, id:pid, cards, commonBack:fix(j.project.commonBack), logo:fix(j.project.logo), logo2:fix(j.project.logo2), updated:Date.now(), cardCount:cards.length});
    await doneP(t);
    closeProjects(); await openProject(pid);
  } catch(_){ toast("Ese archivo no es una copia válida.", 3500); }
};

$("exportAllBtn").onclick = async () => {
  await saveProject();
  toast("Preparando copia de todo…", 60000);
  try {
    const blob = await MFC.exportAll(n => toast(`Preparando copia de todo… ${n}`, 60000));
    deliver(blob, `myfotocards-todo-${new Date().toISOString().slice(0,10)}.ndjson`);
  } catch(_){ toast("No se pudo preparar la copia.", 3500); }
};
$("importAllBtn").onclick = () => $("fileAll").click();
$("fileAll").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  await saveProject();
  toast("Restaurando…", 60000);
  try { const r = await MFC.importAll(f, n => toast(`Restaurando… ${n}`, 60000)); toast(`Listo: ${r.projects} proyectos restaurados.`); setTimeout(() => location.reload(), 900); }
  catch(_){ toast("Ese archivo no es una copia de todo de MyFotoCards.", 4000); }
};
$("toHojasBtn").onclick = async () => {
  const cards = state.cards.filter(c => c.front && photos.has(c.front.photoId));
  if (!cards.length){ toast("Primero agregá fotos."); return; }
  await saveProject();
  const files = cards.map((c, i) => { const b = photos.get(c.front.photoId).blob; return new File([b], `tarjeta-${String(i+1).padStart(3, "0")}.${/png/.test(b.type) ? "png" : "jpg"}`, {type:b.type || "image/jpeg"}); });
  toast("Pasando las fotos a Hojas de fotos…", 60000);
  try { await MFC.handoff("hojas", files, {name:proj.name, groupId:proj.groupId, albumId:proj.albumId}); }
  catch(_){ toast("No se pudieron pasar las fotos.", 3500); }
};
