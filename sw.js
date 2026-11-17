// Cache the application files only. Auth, APIs and company records are never cached here.
const SCOPE_PATH=new URL(self.registration.scope).pathname;
const CACHE_NAME='suiri-empresa-v4-1-'+SCOPE_PATH;
const FILES=['./','index.html','style.css','marca.css','visual-suiri.css','visual-suiri.js','marca-suiri.png','app-core.js','app-operacional.js','app-gestao.js','app-empresa.js','cardapio-original.js','manifest.json','icon-192x192.png','icon-512x512.png','vendor/supabase.js','vendor/html2pdf.bundle.min.js','vendor/zxing.min.js'];
const urls=new Set(FILES.map(file=>new URL(file,self.registration.scope).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!urls.has(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone)));}return response;
 }).catch(async()=>{
  const cache=await caches.open(CACHE_NAME);
  return(await cache.match(event.request,{ignoreSearch:true}))||(event.request.mode==='navigate'?await cache.match(new URL('index.html',self.registration.scope).href):null)||Response.error();
 }));
});
