const CACHE = "ielts-handwrite-local-ocr-v9";
const FILES = ["./", "./index.html", "./styles.css", "./spelling-data.js", "./local-grader.js", "./handwriting.js", "./free-grader.js", "./free-ocr-worker.js", "./free-ocr-assets.js", "./ocr-assets-manifest.js", "./app.js", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('ielts-handwrite-') && key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || /\/api\//.test(url.pathname)) return;
  // The OCR loader owns streamed, size-checked model downloads and their durable cache.
  // Do not also tee these large responses into the app-shell cache on mobile devices.
  if (/\/(models\/|vendor\/paddleocr\/)/.test(url.pathname)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
