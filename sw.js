/* Service worker de MyFotoCards
   - Guarda la app para que abra sin internet.
   - La página se pide primero a la red (así siempre llega la última versión) y,
     si no hay conexión, se usa la copia guardada.
   - Recibe las fotos que se comparten desde la galería (Android) y se las pasa a la página. */
const VERSION = "v1";
const APP = `app-${VERSION}`, RUNTIME = "runtime", SHARED = "compartidas";
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const CDN_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await c.addAll(CORE);
    try { await c.put(JSPDF, await fetch(JSPDF, {mode: "cors"})); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("app-") && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req){
  const c = await caches.open(APP);
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(req, {signal: ctrl.signal});
    clearTimeout(t);
    if (res.ok) c.put(req.mode === "navigate" ? "./index.html" : req, res.clone());
    return res;
  } catch (_) {
    return (await c.match(req.mode === "navigate" ? "./index.html" : req, {ignoreSearch: true}))
      || (await c.match("./index.html"))
      || new Response("Sin conexión", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
  }
}

async function cacheFirst(req){
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

async function receiveShare(req){
  try {
    const form = await req.formData();
    const files = form.getAll("fotos").filter(f => f && typeof f === "object" && f.size);
    await caches.delete(SHARED);
    const c = await caches.open(SHARED);
    let i = 0;
    for (const f of files){
      await c.put(`./compartidas/${i++}`, new Response(f, {headers: {
        "Content-Type": f.type || "application/octet-stream",
        "X-Nombre": encodeURIComponent(f.name || `foto-${i}.jpg`),
      }}));
    }
  } catch (_) {}
  return Response.redirect("./?compartidas=1", 303);
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/compartir")){
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;
  if (url.origin === location.origin){
    // index.html y el manifiesto siempre frescos; íconos y demás desde la copia
    if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith(".webmanifest")) e.respondWith(networkFirst(req));
    else e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }
  // librerías y fuentes de CDN: tienen versión fija, así que la copia guardada sirve para siempre
  if (CDN_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});
