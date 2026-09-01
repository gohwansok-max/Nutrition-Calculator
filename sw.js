// QA+ 영양성분표시 계산기 — 서비스워커
// 버전을 올리면(예: v3) 이전 캐시가 자동 정리되고 새 파일로 교체됩니다.
const CACHE_VERSION = 'qaplus-nutri-calc-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      // 개별 자산 캐싱 (일부 자산 오류가 발생해도 설치 중단되지 않도록 안전 처리)
      await Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Pre-cache failed for:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetch 전략: 
// 1) 페이지 이동(navigate) 및 App Shell 요청 -> 캐시 우선, 없으면 네트워크, 오프라인 시 index.html 폴백
// 2) 외부 리소스(CDN 웹폰트 등) 및 기타 요청 -> 네트워크 시도 후 캐시 저장(stale-while-revalidate / cache-fallback)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 네비게이션 요청 (HTML 페이지 요청)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return (await caches.match('./index.html')) || caches.match('./');
        })
    );
    return;
  }

  // 앱 셸(로컬 정적 파일)
  const isLocalAppShell = APP_SHELL.some(
    (p) => url.origin === location.origin && (url.pathname.endsWith(p.replace('./', '/')) || url.pathname.endsWith(p))
  );

  if (isLocalAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 외부 CDN (Pretendard 폰트 등) 및 기타 GET 요청
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const resClone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

