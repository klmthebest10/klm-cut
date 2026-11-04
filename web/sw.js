/* KLM Cut — service worker: offline, cache runtime, share target */
const VER = 'klmcut-v1.1.0';
const RT = 'klmcut-runtime';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/data.js', 'js/store.js', 'js/media.js', 'js/renderer.js', 'js/engine.js',
  'js/timeline.js', 'js/preview.js', 'js/panels.js', 'js/inspector.js', 'js/mp4mux.js', 'js/pro.js', 'js/export.js', 'js/app.js',
  'icons/icon-32.png', 'icons/icon-64.png', 'icons/icon-96.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-256.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('klmcut-v') && k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function handleShare(req) {
  try {
    const fd = await req.formData();
    const cache = await caches.open('klm-share');
    for (const f of fd.getAll('media')) {
      if (f && typeof f === 'object' && f.size) await cache.put(new Request('shared/' + Date.now() + '-' + encodeURIComponent(f.name || 'media')), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
    }
  } catch (e) { }
  return Response.redirect('./?share=1', 303);
}
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) { e.respondWith(handleShare(req)); return; }
  if (req.method !== 'GET') return;
  if (/\/__(ping|klmcut|pending|file|done|queue)/.test(url.pathname)) return;
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => { if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(VER).then(c => c.put(req, cp)); } return res; }).catch(() => hit || caches.match('index.html'));
      return hit || net;
    }));
    return;
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|storage\.googleapis\.com/.test(url.host)) {
    e.respondWith(caches.open(RT).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }))));
  }
});
