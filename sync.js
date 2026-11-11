/* Cuenta y nube de MyFotoCards (Supabase).
   La app sigue guardando todo en el dispositivo (IndexedDB) y funciona sin internet. Cuando hay una
   sesión abierta, este archivo copia a la nube los proyectos de las dos modalidades, sus fotos y la
   biblioteca de grupos, y trae lo que se cambió en otros dispositivos.

   Cómo decide qué hacer con cada proyecto: guarda en localStorage, por persona, la versión de la nube
   y la fecha local que tenía cada proyecto la última vez que se sincronizó.
   - cambió solo acá → se sube          - cambió solo en la nube → se baja
   - cambió en los dos lados → se baja el de la nube y lo de acá queda como copia aparte (no se pierde nada)
   - se borró en un lado → se borra en el otro (en la nube queda en la papelera)
   Las fotos se identifican por su huella (sha-256): la misma foto se sube una sola vez. */
(function(){
  const DEF = {url:"https://wykiuoalkzbillwgdepa.supabase.co", key:"sb_publishable_rH2mO1aN_dOUGgEQ1JjIgw_L4aBUv0r"};
  let srv = DEF;
  try { const o = JSON.parse(localStorage.getItem("mfc-nube-servidor") || "null"); if (o && o.url && o.key) srv = o; } catch(_){} // para pruebas con un Supabase local
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js";
  const BUCKET = "fotos", OK_TYPES = {"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp"};
  const MODES = ["hojas", "cards"], EVERY = 30000;
  const {openDb, reqP, doneP} = MFC;
  const AUTH_KEY = `sb-${new URL(srv.url).hostname.split(".")[0]}-auth-token`;

  let sbP = null, sb = null, user = null, hooks = {}, timer = 0, running = null, again = false;
  let status = {st:"off", msg:"", at:null};
  const listeners = new Set();

  function lib(){
    if (!sbP) sbP = new Promise((res, rej) => {
      if (window.supabase) return res();
      const s = document.createElement("script");
      s.src = LIB; s.onload = res; s.onerror = () => { sbP = null; rej(new Error("No se pudo cargar la conexión con la nube")); };
      document.head.appendChild(s);
    }).then(() => {
      sb = window.supabase.createClient(srv.url, srv.key, {auth:{flowType:"implicit", persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
      sb.auth.onAuthStateChange((ev, session) => {
        const u = session ? session.user : null;
        if ((u && u.id) === (user && user.id)) return;
        user = u; setStatus(user ? "idle" : "off");
        if (user){ schedule(); setTimeout(syncNow, 0); } else clearInterval(timer);
      });
      return sb;
    });
    return sbP;
  }
  const hasStored = () => { try { return !!localStorage.getItem(AUTH_KEY); } catch(_){ return false; } };
  const fromLink = () => /access_token=|error_description=/.test(location.hash);

  /* ---------- estado que se muestra ---------- */
  function setStatus(st, msg = ""){
    status = {st, msg, at: st === "ok" ? new Date() : status.at};
    listeners.forEach(f => { try { f(status); } catch(_){} });
  }

  /* ---------- lo que se recuerda por persona ---------- */
  const metaKey = () => `mfc-nube:${user.id}`;
  function loadMeta(){ try { const m = JSON.parse(localStorage.getItem(metaKey()) || "{}"); return {p:m.p || {}, g:m.g || {}}; } catch(_){ return {p:{}, g:{}}; } }
  function saveMeta(m){ try { localStorage.setItem(metaKey(), JSON.stringify(m)); } catch(_){} }
  // huellas ya calculadas: id de foto + tamaño → sha-256
  let hashes = null;
  function hashStore(){ if (!hashes){ try { hashes = JSON.parse(localStorage.getItem("mfc-nube-huellas") || "{}"); } catch(_){ hashes = {}; } } return hashes; }
  function saveHashes(){ try { localStorage.setItem("mfc-nube-huellas", JSON.stringify(hashes || {})); } catch(_){} }
  async function hashOf(id, blob){
    const h = hashStore(), k = `${id}|${blob.size}|${blob.type}`;
    if (h[k]) return h[k];
    const d = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return h[k] = [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // hace n tareas a la vez
  async function pool(items, n, fn){
    let i = 0;
    await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => { while (i < items.length){ const k = i++; await fn(items[k], k); } }));
  }
  const must = r => { if (r.error) throw r.error; return r.data; };

  /* ---------- fotos ---------- */
  let known = null; // huella → ruta de lo que ya está en la nube
  async function loadKnown(){
    known = new Map();
    for (let from = 0; ; from += 1000){
      const rows = must(await sb.from("fotos").select("hash,ruta").eq("dueno", user.id).range(from, from + 999));
      rows.forEach(r => known.set(r.hash, r.ruta));
      if (rows.length < 1000) break;
    }
  }
  async function toJpeg(blob){
    const bmp = await createImageBitmap(blob), c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); bmp.close && bmp.close();
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
  }
  let prog = null;
  function tick(){ if (prog){ prog.done++; setStatus("sync", `${prog.label} ${prog.done} de ${prog.total} fotos`); } }
  async function upload(id, blob){
    const h = await hashOf(id, blob);
    if (known.has(h)) return h;
    let b = blob, type = blob.type;
    if (!OK_TYPES[type]){ b = await toJpeg(blob); type = "image/jpeg"; }
    const ruta = `${user.id}/${h}.${OK_TYPES[type]}`;
    const up = await sb.storage.from(BUCKET).upload(ruta, b, {contentType:type, upsert:true});
    if (up.error) throw up.error;
    must(await sb.from("fotos").upsert({dueno:user.id, hash:h, ruta, bytes:b.size, tipo:type}, {onConflict:"dueno,hash", ignoreDuplicates:true}));
    known.set(h, ruta);
    return h;
  }
  async function download(ruta){
    const blob = must(await sb.storage.from(BUCKET).download(ruta));
    const ext = ruta.split(".").pop(), type = Object.keys(OK_TYPES).find(t => OK_TYPES[t] === ext) || blob.type;
    return blob.type === type ? blob : new Blob([blob], {type});
  }

  /* ---------- proyectos ---------- */
  const empty = (mode, r) => !count(mode, r) && !r.logo && !r.logo2 && !r.commonBack;
  const count = (mode, r) => mode === "cards" ? (r.cards || []).length : (r.slots || []).filter(Boolean).length;
  async function localPhotos(mode, id){
    const d = await openDb(mode);
    return await reqP(d.transaction("photos").objectStore("photos").index("project").getAll(id));
  }
  async function push(mode, rec, meta, exists = false){
    const list = (await localPhotos(mode, rec.id)).filter(p => p.blob);
    prog = {label:"Subiendo", done:0, total:list.length};
    const fotos = [];
    await pool(list, 3, async p => { const h = await upload(p.id, p.blob); fotos.push({id:p.id, hash:h, ruta:known.get(h)}); tick(); });
    prog = null;
    const datos = {formato:1, rec:JSON.parse(JSON.stringify(rec)), fotos};
    // crear o actualizar por separado (un "upsert" choca con la regla de lectura, que todavía no ve la fila nueva)
    const fields = {modo:mode, nombre:rec.name || "Sin nombre",
      grupo_id:rec.groupId || rec.settings?.groupId || null, album_id:rec.albumId || rec.settings?.albumId || null,
      datos, cantidad:count(mode, rec), borrado:null};
    let ins = exists ? null : await sb.from("proyectos").insert({id:rec.id, ...fields});
    if (exists || (ins.error && ins.error.code === "23505")) must(await sb.from("proyectos").update(fields).eq("id", rec.id));
    else must(ins);
    const row = must(await sb.from("proyectos").select("version").eq("id", rec.id).single());
    // qué fotos usa (así quien tenga el proyecto compartido puede verlas)
    const have = new Set(must(await sb.from("proyecto_fotos").select("hash").eq("proyecto_id", rec.id)).map(x => x.hash));
    const want = new Set(fotos.map(f => f.hash));
    const add = [...want].filter(h => !have.has(h)).map(hash => ({proyecto_id:rec.id, dueno:user.id, hash}));
    if (add.length) must(await sb.from("proyecto_fotos").upsert(add, {ignoreDuplicates:true}));
    const del = [...have].filter(h => !want.has(h));
    if (del.length) must(await sb.from("proyecto_fotos").delete().eq("proyecto_id", rec.id).in("hash", del));
    meta.p[`${mode}:${rec.id}`] = {v:row.version, u:rec.updated || 0};
  }
  async function pull(mode, id, meta){
    const row = must(await sb.from("proyectos").select("id,version,actualizado,datos").eq("id", id).single());
    const {rec, fotos = []} = row.datos || {};
    if (!rec) return false;
    const d = await openDb(mode), existing = await localPhotos(mode, id);
    const have = new Map(existing.map(p => [p.id, p]));
    const toPut = [];
    const need = [];
    for (const f of fotos){
      const ex = have.get(f.id);
      if (ex && ex.blob && await hashOf(ex.id, ex.blob) === f.hash) continue;
      need.push(f);
    }
    prog = {label:"Bajando", done:0, total:need.length};
    await pool(need, 4, async f => {
      const blob = await download(f.ruta);
      hashStore()[`${f.id}|${blob.size}|${blob.type}`] = f.hash;
      toPut.push({id:f.id, projectId:id, blob}); tick();
    });
    prog = null;
    const updated = Date.now(); // reloj de este dispositivo: así un cambio posterior siempre queda "más nuevo"
    const t = d.transaction(["projects", "photos"], "readwrite"), ps = t.objectStore("photos");
    t.objectStore("projects").put({...rec, id, updated});
    toPut.forEach(p => ps.put(p));
    const keep = new Set(fotos.map(f => f.id));
    existing.forEach(p => { if (!keep.has(p.id)) ps.delete(p.id); });
    await doneP(t);
    meta.p[`${mode}:${id}`] = {v:row.version, u:updated};
    return true;
  }
  async function deleteLocal(mode, id){
    const d = await openDb(mode), t = d.transaction(["projects", "photos"], "readwrite"), ps = t.objectStore("photos");
    t.objectStore("projects").delete(id);
    (await reqP(ps.index("project").getAllKeys(id))).forEach(k => ps.delete(k));
    await doneP(t);
  }
  // Cuando un proyecto cambió acá y en otro dispositivo: lo de acá queda como un proyecto aparte
  async function keepCopy(mode, rec, meta){
    const list = await localPhotos(mode, rec.id), map = new Map(list.map(p => [p.id, newId("f")]));
    const swap = v => Array.isArray(v) ? v.map(swap) : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "photoId" && map.has(x) ? map.get(x) : swap(x)])) : v;
    const pid = newId("p"), copy = {...swap(rec), id:pid, name:`${rec.name || "Sin nombre"} (copia de este dispositivo)`, updated:Date.now()};
    const d = await openDb(mode), t = d.transaction(["projects", "photos"], "readwrite");
    t.objectStore("projects").put(copy);
    list.forEach(p => t.objectStore("photos").put({...p, id:map.get(p.id), projectId:pid}));
    await doneP(t);
    await push(mode, copy, meta, false);
    return copy.name;
  }

  async function syncProjects(meta, out){
    const rows = must(await sb.from("proyectos").select("id,modo,version,actualizado,borrado").eq("dueno", user.id));
    for (const mode of MODES){
      const d = await openDb(mode);
      const locals = await reqP(d.transaction("projects").objectStore("projects").getAll());
      const lmap = new Map(locals.map(r => [r.id, r]));
      const rmap = new Map(rows.filter(r => r.modo === mode).map(r => [r.id, r]));
      for (const rec of locals){
        const k = `${mode}:${rec.id}`, m = meta.p[k], r = rmap.get(rec.id), up = rec.updated || 0;
        const dirty = !m || up > m.u;
        if (!r){
          if (!m && empty(mode, rec)) continue; // el proyecto vacío con que arranca cada dispositivo no se sube hasta que tenga algo
          if (dirty) await push(mode, rec, meta, false);
          else { await deleteLocal(mode, rec.id); delete meta.p[k]; out.removed.push(rec.id); }
        } else if (r.borrado){
          // borrado en otro dispositivo: vuelve solo si acá se cambió después
          if ((m && dirty) || (!m && up > Date.parse(r.borrado))) await push(mode, rec, meta, true);
          else { await deleteLocal(mode, rec.id); delete meta.p[k]; out.removed.push(rec.id); }
        } else if (!m){
          // nunca se sincronizó desde este dispositivo: gana el más nuevo
          if (up > Date.parse(r.actualizado)) await push(mode, rec, meta, true);
          else if (await pull(mode, rec.id, meta)) out.changed.push(rec.id);
        } else if (r.version > m.v){
          if (dirty) out.notes.push(`«${rec.name}» se cambió también en otro dispositivo. Lo de este quedó en «${await keepCopy(mode, rec, meta)}».`);
          if (await pull(mode, rec.id, meta)) out.changed.push(rec.id);
        } else if (dirty) await push(mode, rec, meta, true);
      }
      for (const r of rmap.values()){
        if (lmap.has(r.id) || r.borrado) continue;
        const k = `${mode}:${r.id}`, m = meta.p[k];
        if (m && r.version <= m.v){
          // se borró en este dispositivo
          must(await sb.from("proyectos").update({borrado:new Date().toISOString()}).eq("id", r.id));
          delete meta.p[k];
        } else if (await pull(mode, r.id, meta)) out.changed.push(r.id);
      }
    }
  }

  /* ---------- grupos y álbumes (con sus logos) ---------- */
  async function libHash(id){
    if (!id) return null;
    const d = await openDb("cards"), r = await reqP(d.transaction("libphotos").objectStore("libphotos").get(id));
    return r && r.blob ? await hashOf(id, r.blob) : null;
  }
  // la foto y el tipo del artista viajan como una entrada especial dentro de «albumes» (así no hace falta otra columna)
  const ART = "_artista";
  const realAlbums = r => (r.albumes || []).filter(a => a && a.id !== ART);
  const artOf = r => (r.albumes || []).find(a => a && a.id === ART) || {};
  async function localSig(g){
    return JSON.stringify({n:g.name, l:await libHash(g.logoId), p:await libHash(g.photoId), k:g.kind || null, a:await Promise.all((g.albums || []).map(async a => ({id:a.id, n:a.name, l:await libHash(a.logoId)})))});
  }
  const remoteSig = r => JSON.stringify({n:r.nombre, l:r.logo_hash || null, p:artOf(r).foto_hash || null, k:artOf(r).tipo || null, a:realAlbums(r).map(a => ({id:a.id, n:a.nombre, l:a.logo_hash || null}))});
  async function pushGroup(g, meta){
    const up = async id => {
      if (!id) return null;
      const d = await openDb("cards"), r = await reqP(d.transaction("libphotos").objectStore("libphotos").get(id));
      return r && r.blob ? await upload(id, r.blob) : null;
    };
    const albumes = await Promise.all((g.albums || []).map(async a => ({id:a.id, nombre:a.name || "Sin nombre", logo_hash:await up(a.logoId)})));
    const foto = await up(g.photoId);
    if (foto || g.kind) albumes.push({id:ART, foto_hash:foto, tipo:g.kind || null});
    const row = {id:g.id, nombre:g.name || "Sin nombre", logo_hash:await up(g.logoId), albumes, actualizado:new Date().toISOString()};
    const back = must(await sb.from("grupos").upsert(row).select("*").single());
    meta.g[g.id] = {s:remoteSig(back), t:back.actualizado};
  }
  async function pullGroup(r, meta, byHash){
    const lib = async h => {
      if (!h) return null;
      if (byHash.has(h)) return byHash.get(h);
      const ruta = known.get(h); if (!ruta) return null;
      const blob = await download(ruta), id = newId("l");
      const d = await openDb("cards"), t = d.transaction("libphotos", "readwrite");
      t.objectStore("libphotos").put({id, blob}); await doneP(t);
      hashStore()[`${id}|${blob.size}|${blob.type}`] = h; byHash.set(h, id);
      return id;
    };
    const art = artOf(r);
    const g = {id:r.id, name:r.nombre, logoId:await lib(r.logo_hash), photoId:await lib(art.foto_hash), kind:art.tipo || null,
      albums:await Promise.all(realAlbums(r).map(async a => ({id:a.id, name:a.nombre, logoId:await lib(a.logo_hash)})))};
    const d = await openDb("cards"), t = d.transaction("groups", "readwrite");
    t.objectStore("groups").put(g); await doneP(t);
    meta.g[r.id] = {s:remoteSig(r), t:r.actualizado};
  }
  async function syncGroups(meta, out){
    const d = await openDb("cards");
    const locals = await reqP(d.transaction("groups").objectStore("groups").getAll());
    const rows = must(await sb.from("grupos").select("*").eq("dueno", user.id));
    const rmap = new Map(rows.map(r => [r.id, r])), lmap = new Map(locals.map(g => [g.id, g]));
    let byHash = null;
    const libIndex = async () => {
      if (byHash) return byHash;
      byHash = new Map();
      const all = await reqP((await openDb("cards")).transaction("libphotos").objectStore("libphotos").getAll());
      for (const p of all) if (p.blob) byHash.set(await hashOf(p.id, p.blob), p.id);
      return byHash;
    };
    for (const g of locals){
      const m = meta.g[g.id], r = rmap.get(g.id), sig = await localSig(g);
      if (!r){
        if (!m || sig !== m.s) await pushGroup(g, meta);
        else { // se borró en otro dispositivo
          const t = d.transaction("groups", "readwrite"); t.objectStore("groups").delete(g.id); await doneP(t);
          delete meta.g[g.id]; out.groups = true;
        }
      } else if (sig === remoteSig(r)) meta.g[g.id] = {s:sig, t:r.actualizado};
      else if (m && sig !== m.s) await pushGroup(g, meta);
      else { await pullGroup(r, meta, await libIndex()); out.groups = true; }
    }
    for (const r of rows){
      if (lmap.has(r.id)) continue;
      if (meta.g[r.id] && meta.g[r.id].t === r.actualizado){ must(await sb.from("grupos").delete().eq("id", r.id)); delete meta.g[r.id]; }
      else { await pullGroup(r, meta, await libIndex()); out.groups = true; }
    }
  }

  /* ---------- sincronizar ---------- */
  function syncNow(){
    if (running){ again = true; return running; }
    running = doSync().finally(() => { running = null; if (again){ again = false; syncNow(); } });
    return running;
  }
  async function doSync(){
    if (!user || !sb) return;
    if (!navigator.onLine){ setStatus("offline"); return; }
    setStatus("sync", "Revisando…");
    const out = {changed:[], removed:[], notes:[], groups:false};
    const meta = loadMeta();
    try {
      try { await hooks.flush?.(); } catch(_){}
      await loadKnown();
      await syncGroups(meta, out);
      await syncProjects(meta, out);
      setStatus("ok");
    } catch(e){
      console.warn("nube", e);
      setStatus(navigator.onLine ? "error" : "offline", (e && e.message) || "");
    } finally {
      prog = null; saveMeta(meta); saveHashes();
      if (out.changed.length || out.removed.length || out.groups){ try { await hooks.onRemoteChange?.(out); } catch(_){} }
      out.notes.forEach(n => toast(n, 7000));
    }
  }
  function schedule(){
    clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, EVERY);
  }
  addEventListener("online", () => user && syncNow());
  addEventListener("offline", () => user && setStatus("offline"));
  document.addEventListener("visibilitychange", () => { if (user && document.visibilityState === "hidden") syncNow(); });

  /* ---------- entrar y salir ---------- */
  async function sendLink(email){
    await lib();
    const to = location.origin + location.pathname;
    must(await sb.auth.signInWithOtp({email, options:{emailRedirectTo:to, shouldCreateUser:true}}));
  }
  async function verifyCode(email, token){ await lib(); must(await sb.auth.verifyOtp({email, token, type:"email"})); }
  // Con contraseña se entra sin esperar el correo (el correo gratis de Supabase manda pocos por hora)
  async function signInPass(email, password){ await lib(); must(await sb.auth.signInWithPassword({email, password})); }
  async function setPassword(password){
    await lib();
    const d = must(await sb.auth.updateUser({password, data:{tiene_clave:true}}));
    if (d && d.user) user = d.user;
  }
  async function signOut(){ await lib(); clearInterval(timer); await sb.auth.signOut({scope:"local"}); user = null; setStatus("off"); }
  async function deleteAccount(){
    await lib();
    for (;;){
      const files = must(await sb.storage.from(BUCKET).list(user.id, {limit:1000}));
      if (!files.length) break;
      must(await sb.storage.from(BUCKET).remove(files.map(f => `${user.id}/${f.name}`)));
      if (files.length < 1000) break;
    }
    must(await sb.rpc("borrar_mi_cuenta"));
    try { localStorage.removeItem(metaKey()); } catch(_){}
    await signOut();
  }

  /* ---------- botón y ventana de la cuenta ---------- */
  const CSS = `
.cloudbtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:5px 12px 5px 8px;font:inherit;font-weight:600;font-size:.88rem;cursor:pointer;white-space:nowrap;position:relative}
.cloudbtn:hover{border-color:var(--accent)}
.cloudbtn svg{width:20px;height:20px;flex:none}
.cloudbtn .av{width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-size:.75rem;text-transform:uppercase}
.cloudbtn .dot{position:absolute;left:24px;top:3px;width:9px;height:9px;border-radius:50%;border:2px solid var(--surface);background:var(--ok)}
.cloudbtn[data-st="sync"] .dot{background:var(--warn);animation:nubepulse 1s infinite alternate}
.cloudbtn[data-st="error"] .dot{background:var(--bad)}
.cloudbtn[data-st="offline"] .dot{background:var(--muted)}
.cloudbtn[data-st="off"] .dot{display:none}
@keyframes nubepulse{to{opacity:.3}}
@media (max-width:520px){.cloudbtn .lbl{display:none}.cloudbtn{padding:7px}.cloudbtn .dot{left:22px}}
.nubemodal{position:fixed;inset:0;background:rgba(10,12,20,.45);display:none;align-items:center;justify-content:center;padding:16px;z-index:1000}
.nubemodal.on{display:flex}
.nubecard{background:var(--surface);color:var(--ink);border-radius:18px;padding:20px;width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.3)}
.nubecard h2{margin:0;font-size:1.15rem}
.nubecard p{margin:0;color:var(--muted);font-size:.92rem;line-height:1.45}
.nubecard input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);width:100%;box-sizing:border-box}
.nubecard .row{display:flex;gap:8px;flex-wrap:wrap}
.nubecard button{font:inherit;font-weight:600;border-radius:10px;padding:9px 14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
.nubecard button.pri{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.nubecard button.link{border:0;background:none;color:var(--muted);padding:4px 0;font-weight:500;text-decoration:underline}
.nubecard button.danger{color:var(--bad)}
.nubecard button.armed{background:var(--bad);border-color:var(--bad);color:#fff}
.nubecard button:disabled{opacity:.55;cursor:default}
.nubecard .st{font-weight:600;color:var(--ink)}
.nubecard .err{color:var(--bad)}
.nubecard .head{display:flex;align-items:center;gap:8px}
.nubecard .head h2{flex:1}
.nubetoast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;max-width:min(520px,calc(100vw - 32px));font-size:.92rem;z-index:1001;opacity:0;pointer-events:none;transition:opacity .2s}
.nubetoast.on{opacity:1}`;
  const ICON_CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z"/></svg>';
  let btn = null, modal = null, toastEl = null;
  function toast(msg, ms = 3000){
    if (!toastEl){ toastEl = document.createElement("div"); toastEl.className = "nubetoast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("on"), ms);
  }
  const hhmm = d => d ? d.toLocaleTimeString("es", {hour:"2-digit", minute:"2-digit"}) : "";
  function statusText(){
    switch (status.st){
      case "ok": return `Todo guardado en la nube (${hhmm(status.at)})`;
      case "sync": return `Guardando en la nube… ${status.msg}`;
      case "offline": return "Sin conexión: se guarda en la nube cuando vuelva internet";
      case "error": return "No se pudo guardar en la nube. Se vuelve a intentar solo.";
      case "idle": return "Conectado";
      default: return "";
    }
  }
  function paintBtn(){
    if (!btn) return;
    btn.dataset.st = user ? status.st : "off";
    if (user){
      const ini = (user.email || "?")[0];
      btn.innerHTML = `<span class="av">${ini.replace(/[<>&"]/g, "")}</span><span class="dot"></span><span class="lbl">Nube</span>`;
      btn.title = `${user.email}. ${statusText()}`;
    } else {
      btn.innerHTML = `${ICON_CLOUD}<span class="lbl">Entrar</span>`;
      btn.title = "Entrar para guardar tus proyectos en la nube";
    }
    btn.setAttribute("aria-label", btn.title);
  }
  let view = "email", pendingEmail = "";
  function render(){
    if (!modal) return;
    const c = modal.querySelector(".nubecard");
    const close = `<button class="link" data-a="close" aria-label="Cerrar">Cerrar</button>`;
    if (user){
      c.innerHTML = `<div class="head"><h2>Tu nube</h2>${close}</div>
        <p>Entraste como <b class="em"></b>. Tus proyectos y grupos de las dos modalidades se guardan solos en la nube y aparecen en todos los dispositivos donde entres.</p>
        <p class="st" aria-live="polite"></p>
        <div class="row"><button class="pri" data-a="sync">Sincronizar ahora</button><button data-a="out">Salir</button></div>
        <form data-f="setpass" style="display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:12px">
          <p class="pdesc"></p>
          <div class="row">
            <input type="password" name="pass" required minlength="6" autocomplete="new-password" placeholder="Contraseña nueva (6 o más)" aria-label="Contraseña nueva" style="flex:1;min-width:160px">
            <button type="submit">Guardar</button>
          </div>
          <p class="msg" aria-live="polite"></p>
        </form>
        <p>Al salir, lo que ya está en este dispositivo se queda acá.</p>
        <button class="link danger" data-a="del">Borrar mi cuenta y todo lo que hay en la nube</button>`;
      c.querySelector(".em").textContent = user.email || "";
      c.querySelector(".pdesc").textContent = user.user_metadata && user.user_metadata.tiene_clave
        ? "Ya tenés contraseña: en otro dispositivo entrás con tu correo y la contraseña. Si querés, cambiala:"
        : "Ponele una contraseña a tu cuenta y en los otros dispositivos entrás con ella, sin esperar el correo:";
      c.querySelector(".st").textContent = statusText();
      c.querySelector(".st").classList.toggle("err", status.st === "error");
    } else if (view === "email"){
      c.innerHTML = `<div class="head"><h2>Guardá todo en la nube</h2>${close}</div>
        <p>Entrá con tu correo y tus proyectos y grupos se guardan solos. Así los tenés en el teléfono y en la computadora. Sin cuenta, la app sigue funcionando igual en este dispositivo.</p>
        <form class="col" data-f="email" style="display:flex;flex-direction:column;gap:10px">
          <input type="email" name="email" required autocomplete="email" placeholder="tu@correo.com" aria-label="Correo">
          <input type="password" name="pass" autocomplete="current-password" placeholder="Contraseña (si ya le pusiste una)" aria-label="Contraseña">
          <button class="pri" type="submit" data-how="pass">Entrar con contraseña</button>
          <button type="submit" data-how="link">Mandarme un enlace al correo</button>
        </form>
        <p class="msg" aria-live="polite"></p>`;
      const inp = c.querySelector("input"); inp.value = pendingEmail; setTimeout(() => inp.focus(), 50);
    } else {
      c.innerHTML = `<div class="head"><h2>Revisá tu correo</h2>${close}</div>
        <p>Te mandamos un correo a <b class="em"></b>. Abrilo en este dispositivo y tocá el enlace. Si no llega, mirá en spam.</p>
        <p>Si el correo trae un código, escribilo acá:</p>
        <form data-f="code" class="row">
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Código" aria-label="Código" style="flex:1;min-width:120px">
          <button class="pri" type="submit">Entrar</button>
        </form>
        <p class="msg" aria-live="polite"></p>
        <button class="link" data-a="back">Usar otro correo</button>`;
      c.querySelector(".em").textContent = pendingEmail;
    }
  }
  function errText(e){
    const m = (e && e.message) || "";
    if (/invalid login credentials/i.test(m)) return "El correo o la contraseña no son correctos. Si todavía no le pusiste contraseña, pedí el enlace al correo.";
    if (/at least|too short|weak/i.test(m)) return "La contraseña tiene que tener 6 caracteres o más.";
    if (/different from the old|same password/i.test(m)) return "Es la misma contraseña que ya tenías.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Se pidieron muchos correos seguidos (el correo gratis manda 2 por hora). Si ya le pusiste contraseña, entrá con ella; si no, esperá un rato.";
    if (/expired|invalid/i.test(m)) return "El código no es correcto o venció. Pedí otro correo.";
    if (/fetch|network|cargar/i.test(m)) return "No hay conexión con la nube. Revisá internet.";
    return "No se pudo. " + m;
  }
  function openModal(){
    if (!modal){
      modal = document.createElement("div"); modal.className = "nubemodal"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-label", "Cuenta");
      modal.innerHTML = `<div class="nubecard"></div>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", async e => {
        if (e.target === modal) return closeModal();
        const b = e.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a;
        if (a === "close") closeModal();
        else if (a === "back"){ view = "email"; render(); }
        else if (a === "sync") syncNow();
        else if (a === "out"){ await syncNow(); await signOut(); render(); toast("Saliste. Tus proyectos siguen en este dispositivo."); }
        else if (a === "del"){
          if (!b.classList.contains("armed")){ b.classList.add("armed"); b.textContent = "Tocá de nuevo: se borra todo lo de la nube"; setTimeout(() => { if (b.isConnected){ b.classList.remove("armed"); b.textContent = "Borrar mi cuenta y todo lo que hay en la nube"; } }, 4000); return; }
          b.disabled = true; b.textContent = "Borrando…";
          try { await deleteAccount(); render(); toast("Tu cuenta y lo que había en la nube se borraron. Lo de este dispositivo sigue acá."); }
          catch(err){ b.disabled = false; b.textContent = "No se pudo borrar. Probá de nuevo."; }
        }
      });
      modal.addEventListener("submit", async e => {
        e.preventDefault();
        const f = e.target, msg = f.querySelector(".msg") || modal.querySelector(".msg");
        const sub = e.submitter || f.querySelector("button");
        msg.classList.remove("err");
        if (f.dataset.f === "email" && sub.dataset.how === "pass" && !f.pass.value){ msg.textContent = "Escribí la contraseña, o pedí el enlace al correo."; msg.classList.add("err"); f.pass.focus(); return; }
        sub.disabled = true;
        try {
          if (f.dataset.f === "email" && sub.dataset.how === "pass"){
            pendingEmail = f.email.value.trim(); msg.textContent = "Entrando…";
            await signInPass(pendingEmail, f.pass.value);
            closeModal(); toast("¡Listo! Entraste. Tus proyectos se van a guardar en la nube.");
          } else if (f.dataset.f === "email"){
            pendingEmail = f.email.value.trim(); msg.textContent = "Mandando…";
            await sendLink(pendingEmail); view = "code"; render();
          } else if (f.dataset.f === "setpass"){
            msg.textContent = "Guardando…";
            await setPassword(f.pass.value);
            render(); toast("Listo: ya podés entrar con tu correo y esta contraseña en cualquier dispositivo.", 5000);
          } else {
            msg.textContent = "Entrando…";
            await verifyCode(pendingEmail, f.code.value.trim());
            view = "email"; closeModal(); toast("¡Listo! Tus proyectos se van a guardar en la nube.");
          }
        } catch(err){ msg.textContent = errText(err); msg.classList.add("err"); sub.disabled = false; }
      });
      addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("on")) closeModal(); });
    }
    render(); modal.classList.add("on");
  }
  function closeModal(){ modal && modal.classList.remove("on"); }
  listeners.add(() => { paintBtn(); if (modal && modal.classList.contains("on") && user){ const st = modal.querySelector(".st"); if (st){ st.textContent = statusText(); st.classList.toggle("err", status.st === "error"); } else render(); } });

  /* ---------- arranque ----------
     hooks: {mount, flush(), onRemoteChange({changed, removed, groups})} */
  function init(h){
    hooks = h || {};
    if (!document.getElementById("nube-css")){ const s = document.createElement("style"); s.id = "nube-css"; s.textContent = CSS; document.head.appendChild(s); }
    if (hooks.mount){
      btn = document.createElement("button"); btn.type = "button"; btn.className = "cloudbtn";
      btn.addEventListener("click", async () => { openModal(); if (!sb) lib().then(() => { if (user) render(); }).catch(() => {}); });
      hooks.mount.appendChild(btn); paintBtn();
    }
    const link = fromLink();
    if (link && /error_description=/.test(location.hash)){
      const m = decodeURIComponent((location.hash.match(/error_description=([^&]*)/) || [])[1] || "").replace(/\+/g, " ");
      history.replaceState(null, "", location.pathname + location.search);
      toast("No se pudo entrar con ese enlace" + (/expired|invalid/i.test(m) ? ": venció o ya se usó. Pedí otro." : "."), 6000);
    } else if (link || hasStored()){
      lib().then(async () => {
        const {data} = await sb.auth.getSession();
        if (link) history.replaceState(null, "", location.pathname + location.search);
        if (data.session && !user){ user = data.session.user; setStatus("idle"); schedule(); syncNow(); if (link) toast("¡Listo! Entraste. Tus proyectos se van a guardar en la nube.", 4000); }
      }).catch(() => { if (hasStored()) setStatus("offline"); });
    }
  }

  MFC.cloud = {init, syncNow, open:openModal, get user(){ return user; }, get status(){ return status; }, _lib:lib};
})();
