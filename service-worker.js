const CACHE_NAME = "habit-tracker-v1";
// Yahan hum wo saari files list karenge jo offline honi chahiye
const ASSETS = [
  "./",
  "./index.html",
  "./script.js",
  "./style.css",
  "./edit.css",
  "./glow.css",
  "./responsive.css",
  "./manifest.json"
];

// 1. Install (Files ko save karo)
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching all files...");
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Fetch (Internet nahi hai toh saved file dikhao)
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

// 3. Activate (Purana cache saaf karo)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});
