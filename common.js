/* Código compartido por las dos modalidades de MyFotoCards:
   - Hojas de fotos (index.html)  → base "hojas-fotos-a4"
   - Luli's Photocards (photocards.html) → base "photocards-a4" (también guarda la biblioteca de grupos)
   Cada modalidad sigue usando su propia base; acá están las cosas que necesitan las dos:
   lista unificada de proyectos, biblioteca de grupos, copia de seguridad completa y
   pasar fotos de una modalidad a la otra. */
(function(){
  const MODES = {
    hojas: {db:"hojas-fotos-a4", version:1, page:"./", label:"Hojas de fotos"},
    cards: {db:"photocards-a4", version:2, page:"photocards.html", label:"Luli's Photocards"}
  };
  const upgrades = {
    hojas(d){
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", {keyPath:"id"});
      if (!d.objectStoreNames.contains("photos")){ const st = d.createObjectStore("photos", {keyPath:"id"}); st.createIndex("project", "projectId"); }
    },
    cards(d){
      upgrades.hojas(d);
      if (!d.objectStoreNames.contains("groups")) d.createObjectStore("groups", {keyPath:"id"});
      if (!d.objectStoreNames.contains("libphotos")) d.createObjectStore("libphotos", {keyPath:"id"});
    }
  };
  const dbs = {};
  function openDb(mode){
    if (!dbs[mode]) dbs[mode] = new Promise((res, rej) => {
      const m = MODES[mode], r = indexedDB.open(m.db, m.version);
      r.onupgradeneeded = () => upgrades[mode](r.result);
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); delete dbs[mode]; }; res(d); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("blocked"));
    });
    return dbs[mode];
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const doneP = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

  function remember(k, v){ try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch(_){} }
  function recall(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
  const LS_MODE = "mfc-modo";

  /* ---------- proyectos de las dos modalidades ---------- */
  async function listProjects(mode){
    try {
      const d = await openDb(mode);
      const all = await reqP(d.transaction("projects").objectStore("projects").getAll());
      return all.map(p => ({mode, id:p.id, name:p.name || "Sin nombre", updated:p.updated || 0,
        count: mode === "cards" ? (p.cardCount ?? (p.cards || []).length) : (p.photoCount ?? (p.slots || []).filter(Boolean).length),
        pages: p.settings?.pages || 1,
        groupId: p.groupId || p.settings?.groupId || null, albumId: p.albumId || p.settings?.albumId || null,
        thumbId: mode === "cards" ? ((p.cards || []).find(c => c && c.front)?.front?.photoId || p.logo2?.photoId || p.logo?.photoId || null)
                                  : ((p.slots || []).find(Boolean)?.photoId || null)}))
        .sort((a, b) => b.updated - a.updated);
    } catch(_){ return []; }
  }
  async function thumb(cv, item, w = 40, h = 56){
    try {
      if (!item.thumbId) return;
      const d = await openDb(item.mode);
      const rec = await reqP(d.transaction("photos").objectStore("photos").get(item.thumbId));
      const blob = rec && (rec.thumb || rec.blob);
      if (!blob) return;
      const bmp = await createImageBitmap(blob), dpr = devicePixelRatio || 1;
      cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
      const x = cv.getContext("2d"), sc = Math.max(cv.width/bmp.width, cv.height/bmp.height);
      x.drawImage(bmp, (cv.width - bmp.width*sc)/2, (cv.height - bmp.height*sc)/2, bmp.width*sc, bmp.height*sc);
      bmp.close && bmp.close();
    } catch(_){}
  }
  // Ir a un proyecto de la otra modalidad
  function openIn(mode, id){ location.href = MODES[mode].page + (id ? "?p=" + encodeURIComponent(id) : ""); }

  /* ---------- biblioteca de grupos (vive en la base de photocards) ---------- */
  const byName = (a, b) => (a.name || "").localeCompare(b.name || "", "es", {sensitivity:"base"});
  async function listGroups(){
    try {
      const d = await openDb("cards");
      return (await reqP(d.transaction("groups").objectStore("groups").getAll())).sort(byName).map(g => ({...g, albums:(g.albums || []).slice().sort(byName)}));
    } catch(_){ return []; }
  }
  async function groupLabel(groupId, albumId){
    if (!groupId) return "";
    const g = (await listGroups()).find(x => x.id === groupId);
    if (!g) return "";
    const a = g.albums.find(x => x.id === albumId);
    return a ? `${g.name} · ${a.name}` : g.name;
  }

  /* ---------- pasar fotos a la otra modalidad ----------
     Se dejan en la misma caché que usan las fotos compartidas desde la galería y se abre la
     otra página, que arma un proyecto nuevo con ellas. */
  async function handoff(mode, files, opts = {}){
    await caches.delete("compartidas");
    const c = await caches.open("compartidas");
    let i = 0;
    for (const f of files){
      await c.put(`./compartidas/${String(i++).padStart(4, "0")}`, new Response(f, {headers:{
        "Content-Type": f.type || "image/jpeg", "X-Nombre": encodeURIComponent(f.name || `foto-${i}.jpg`)}}));
    }
    const q = new URLSearchParams({compartidas:"1", nuevo:opts.name || "Proyecto"});
    if (opts.groupId) q.set("grupo", opts.groupId);
    if (opts.albumId) q.set("album", opts.albumId);
    location.href = MODES[mode].page + "?" + q.toString();
  }
  async function takeShared(){
    const q = new URLSearchParams(location.search);
    if (!q.has("compartidas")) return null;
    const info = {name:q.get("nuevo"), groupId:q.get("grupo"), albumId:q.get("album"), files:[]};
    history.replaceState(null, "", location.pathname);
    try {
      const c = await caches.open("compartidas");
      const keys = (await c.keys()).sort((a, b) => a.url.localeCompare(b.url));
      for (const req of keys){
        const res = await c.match(req);
        const name = decodeURIComponent(res.headers.get("X-Nombre") || "foto.jpg");
        info.files.push(new File([await res.blob()], name, {type: res.headers.get("Content-Type") || ""}));
      }
      await caches.delete("compartidas");
    } catch(_){ info.error = true; }
    return info;
  }

  /* ---------- copia de seguridad de todo ----------
     Un archivo de texto con un registro JSON por línea, así no hace falta tener todo en memoria
     a la vez (con cientos de fotos no entraría en un teléfono). */
  const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  function dataURLToBlob(u){
    const [head, b64] = u.split(","), mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], {type:mime});
  }
  async function packBlobs(rec){
    const out = {};
    for (const [k, v] of Object.entries(rec)) out[k] = v instanceof Blob ? {__blob: await blobToDataURL(v)} : v;
    return out;
  }
  function unpackBlobs(rec){
    const out = {};
    for (const [k, v] of Object.entries(rec)) out[k] = v && typeof v === "object" && typeof v.__blob === "string" ? dataURLToBlob(v.__blob) : v;
    return out;
  }
  const STORES = {hojas:["projects", "photos"], cards:["projects", "photos", "groups", "libphotos"]};
  async function exportAll(onProgress){
    const parts = [JSON.stringify({format:"myfotocards-todo", version:1, date:new Date().toISOString()}) + "\n"];
    let n = 0;
    for (const mode of Object.keys(STORES)){
      const d = await openDb(mode);
      for (const store of STORES[mode]){
        const keys = await reqP(d.transaction(store).objectStore(store).getAllKeys());
        for (const k of keys){
          const rec = await reqP(d.transaction(store).objectStore(store).get(k));
          if (!rec) continue;
          parts.push(JSON.stringify({m:mode, s:store, r: await packBlobs(rec)}) + "\n");
          if (onProgress && ++n % 20 === 0) onProgress(n);
        }
      }
    }
    return new Blob(parts, {type:"application/x-ndjson"});
  }
  // Restaura una copia: lo que ya existe con el mismo id se reemplaza, lo demás se agrega
  async function importAll(file, onProgress){
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", first = true, n = 0, projects = 0;
    const handle = async line => {
      if (!line.trim()) return;
      const j = JSON.parse(line);
      if (first){ first = false; if (j.format !== "myfotocards-todo") throw new Error("formato"); return; }
      if (!STORES[j.m] || !STORES[j.m].includes(j.s)) return;
      const d = await openDb(j.m), t = d.transaction(j.s, "readwrite");
      t.objectStore(j.s).put(unpackBlobs(j.r)); await doneP(t);
      if (j.s === "projects") projects++;
      if (onProgress && ++n % 20 === 0) onProgress(n);
    };
    for (;;){
      const {value, done} = await reader.read();
      if (value) buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0){ const line = buf.slice(0, i); buf = buf.slice(i + 1); await handle(line); }
      if (done) break;
    }
    await handle(buf);
    if (first) throw new Error("vacío");
    return {projects};
  }
  function saveBlobLocal(blob, name){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  const safeName = (s, def) => (s || "").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || def;

  /* ---------- selector de modalidad (las dos páginas lo tienen arriba) ----------
     Antes de cambiar de página se guarda lo que haya pendiente. */
  function initModeNav(current, beforeLeave){
    remember(LS_MODE, current);
    document.querySelectorAll(".modes a[data-mode]").forEach(a => {
      a.setAttribute("aria-current", a.dataset.mode === current ? "page" : "false");
      a.addEventListener("click", async e => {
        if (a.dataset.mode === current){ e.preventDefault(); return; }
        e.preventDefault();
        try { await beforeLeave?.(); } catch(_){}
        location.href = a.getAttribute("href");
      });
    });
  }

  /* ---------- sección "de la otra modalidad" en Mis proyectos ---------- */
  async function renderOtherProjects(box, otherMode){
    const list = await listProjects(otherMode);
    const h = document.createElement("h3"); h.className = "ghead modehead";
    h.textContent = MODES[otherMode].label;
    box.appendChild(h);
    if (!list.length){
      const p = document.createElement("div"); p.className = "empty"; p.style.padding = "6px";
      p.textContent = "Todavía no hay proyectos de este tipo."; box.appendChild(p); return;
    }
    const gs = await listGroups(), gmap = new Map(gs.map(g => [g.id, g]));
    list.forEach(p => {
      const it = document.createElement("div"); it.className = "pitem";
      const cv = document.createElement("canvas"); cv.className = "pthumb"; thumb(cv, p);
      const info = document.createElement("div"); info.className = "pinfo";
      const b = document.createElement("b"); b.textContent = p.name;
      const sm = document.createElement("small");
      const g = gmap.get(p.groupId), a = g && g.albums.find(x => x.id === p.albumId);
      const what = otherMode === "cards" ? `${p.count} ${p.count === 1 ? "tarjeta" : "tarjetas"}` : `${p.count} ${p.count === 1 ? "foto" : "fotos"} · ${p.pages} ${p.pages === 1 ? "hoja" : "hojas"}`;
      sm.textContent = [g ? (a ? `${g.name} · ${a.name}` : g.name) : "", what].filter(Boolean).join(" · ");
      info.append(b, sm);
      const open = document.createElement("button"); open.className = "open"; open.textContent = "Abrir";
      open.onclick = () => openIn(otherMode, p.id);
      it.append(cv, info, open);
      box.appendChild(it);
    });
  }

  /* ---------- brillo, contraste y sombras ----------
     Se guardan como valores de -1 a 1 en cada foto ({b, c, s}) y se aplican al dibujar: la foto
     original nunca se toca. Se calcula píxel por píxel con una tabla de 256 valores (Safari de
     iPhone no tiene filtros en el canvas). */
  const hasAdj = a => !!a && !!(a.b || a.c || a.s || a.v);
  function adjLut(a){
    const t = new Uint8ClampedArray(256), b = a.b || 0, c = a.c || 0, sh = a.s || 0;
    const f = c >= 0 ? 1 + c*1.5 : 1 + c*0.8;
    for (let i = 0; i < 256; i++){
      let x = i/255;
      x += sh*0.35*6.75*x*(1-x)*(1-x); // sombras: actúa sobre los tonos oscuros (máximo en 1/3), casi nada en las luces
      x += b*0.35;
      x = (x - 0.5)*f + 0.5;
      t[i] = Math.round(x*255);
    }
    return t;
  }
  const adjCache = new Map(), ADJ_BUDGET = 16e6; // píxeles en memoria para las versiones ajustadas
  let adjPixels = 0;
  // src: imagen o canvas; id: para reconocerla; opt.max: achicar antes (vista previa); opt.holder: guarda ahí la versión ajustada (miniaturas)
  function adjusted(src, a, id, opt = {}){
    if (!hasAdj(a) || !src || !src.width) return src;
    const k = `${id}|${src.width}x${src.height}|${opt.max || 0}|${a.b || 0},${a.c || 0},${a.s || 0},${a.v || 0}`;
    if (opt.holder && opt.holder.__adj && opt.holder.__adj.k === k) return opt.holder.__adj.c;
    const hit = adjCache.get(k);
    if (hit){ adjCache.delete(k); adjCache.set(k, hit); return hit; }
    let w = src.width, h = src.height;
    if (opt.max && Math.max(w, h) > opt.max){ const r = opt.max/Math.max(w, h); w = Math.max(1, Math.round(w*r)); h = Math.max(1, Math.round(h*r)); }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", {willReadFrequently:true});
    x.drawImage(src, 0, 0, w, h);
    try {
      const d = x.getImageData(0, 0, w, h), p = d.data, t = adjLut(a);
      // intensidad de color: -1 = blanco y negro, +1 = el doble de color (cada píxel se aleja o acerca a su gris)
      const v = a.v || 0, k2 = v >= 0 ? 1 + v : 1 + v;
      if (!v) for (let i = 0; i < p.length; i += 4){ p[i] = t[p[i]]; p[i+1] = t[p[i+1]]; p[i+2] = t[p[i+2]]; }
      else for (let i = 0; i < p.length; i += 4){
        const r = t[p[i]], g = t[p[i+1]], bl = t[p[i+2]], gr = 0.299*r + 0.587*g + 0.114*bl;
        p[i] = gr + (r - gr)*k2; p[i+1] = gr + (g - gr)*k2; p[i+2] = gr + (bl - gr)*k2; // Uint8Clamped recorta solo
      }
      x.putImageData(d, 0, 0);
    } catch(_){ return src; }
    if (opt.holder){ opt.holder.__adj = {k, c}; return c; }
    adjCache.set(k, c); adjPixels += w*h;
    for (const [kk, cc] of adjCache){
      if (adjPixels <= ADJ_BUDGET) break;
      if (kk === k) continue;
      adjCache.delete(kk); adjPixels -= cc.width*cc.height;
    }
    return c;
  }
  // Panel con los tres controles. get() devuelve el ajuste actual, set(a) lo cambia,
  // begin() se llama al empezar a mover un control (para el deshacer), end() al soltarlo.
  const ADJ = [["b", "Brillo"], ["c", "Contraste"], ["s", "Sombras"], ["v", "Intensidad de color"]];
  function adjustPanel(box, {get, set, begin, end, all, reset}){
    box.classList.add("adjpanel");
    const TIPS = {b:"Aclara u oscurece toda la foto", c:"Separa más (o menos) los oscuros de los claros", s:"Hacia la derecha aclara las partes oscuras sin quemar las claras", v:"Hacia la derecha colores más vivos; todo a la izquierda, blanco y negro"};
    box.innerHTML = ADJ.map(([k, l]) => `<label class="adjrow" title="${TIPS[k]}. Doble clic: vuelve a 0."><span>${l}</span><input type="range" min="-100" max="100" step="1" value="0" data-k="${k}" aria-label="${l}"><output>0</output></label>`).join("")
      + `<div class="adjbtns"><button type="button" data-a="reset">Restablecer</button><button type="button" data-a="all">Aplicar a todas</button></div>`;
    let active = false;
    const resetBtn = box.querySelector('[data-a="reset"]');
    box.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => {
        if (!active){ active = true; begin && begin(); }
        const v = +inp.value; inp.nextElementSibling.textContent = v > 0 ? "+" + v : String(v);
        const a = {...(get() || {}), [inp.dataset.k]: v/100};
        set(hasAdj(a) ? a : null);
        resetBtn.disabled = !hasAdj(get());
      });
      inp.addEventListener("change", () => { active = false; end && end(); });
      inp.addEventListener("dblclick", () => { inp.value = 0; inp.dispatchEvent(new Event("input")); inp.dispatchEvent(new Event("change")); });
    });
    resetBtn.onclick = () => { reset(); sync(); };
    box.querySelector('[data-a="all"]').onclick = () => { all(); sync(); };
    function sync(){
      const a = get() || {};
      box.querySelectorAll("input").forEach(inp => {
        if (document.activeElement === inp && active) return;
        const v = Math.round((a[inp.dataset.k] || 0)*100);
        inp.value = v; inp.nextElementSibling.textContent = v > 0 ? "+" + v : String(v);
      });
      resetBtn.disabled = !hasAdj(get());
    }
    sync();
    return {sync};
  }

  window.MFC = {hasAdj, adjusted, adjustPanel, MODES, openDb, reqP, doneP, remember, recall, listProjects, thumb, openIn, listGroups, groupLabel,
    handoff, takeShared, exportAll, importAll, saveBlobLocal, safeName, initModeNav, renderOtherProjects, blobToDataURL, dataURLToBlob};
})();
