/*
 * sw.js — faz o Gastos do Casal abrir SEM INTERNET.
 *
 * Como funciona, em linguagem simples:
 * - Na primeira vez que o app abre com internet, este arquivo guarda uma cópia
 *   de todos os arquivos do app dentro do celular.
 * - Depois, se abrir sem sinal, o celular usa essa cópia.
 * - Com sinal, ele busca a versão nova na internet (espera no máximo 4 segundos)
 *   e atualiza a cópia. Se a internet estiver lenta demais, usa a cópia.
 *
 * Os LANÇAMENTOS não ficam aqui: ficam no armazenamento do navegador (dados.js).
 * Este arquivo só guarda o programa, nunca os dados.
 *
 * >>> A CADA PUBLICAÇÃO NOVA, TROQUE A DATA ABAIXO. <<<
 * Sem isso, os celulares podem continuar mostrando a versão antiga.
 */
var VERSAO = '2026-10-30a';
var CACHE = 'gastos-casal-' + VERSAO;

var ARQUIVOS = [
  './',
  'index.html',
  'config.js',
  'regras.js',
  'dados.js',
  'app.js',
  'manifest.json',
  'icone.svg',
  'icone-192.png',
  'icone-512.png',
  'icone-maskable-512.png'
];

// Instalação: guarda a cópia de todos os arquivos do app
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache: 'reload' garante que vem a versão nova do servidor, não a do navegador
      return c.addAll(ARQUIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// Ativação: apaga cópias de versões antigas do app (só do programa, nunca dados)
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n.indexOf('gastos-casal-') === 0 && n !== CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Busca na internet com limite de tempo
function comLimite(req, ms) {
  return new Promise(function (ok, falha) {
    var t = setTimeout(function () { falha(new Error('demorou')); }, ms);
    fetch(req).then(function (r) { clearTimeout(t); ok(r); }, function (er) { clearTimeout(t); falha(er); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;            // envios para a nuvem passam direto
  var url = new URL(req.url);

  // Fontes do Google: usa a cópia se tiver; senão busca e guarda
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(req).then(function (achou) {
          return achou || fetch(req).then(function (r) { c.put(req, r.clone()); return r; })
            .catch(function () { return new Response('', { status: 504 }); });
        });
      })
    );
    return;
  }

  // Qualquer outro endereço externo (Supabase etc.): não mexe
  if (url.origin !== self.location.origin) return;

  // Arquivos do app: tenta a internet (até 4 s), atualiza a cópia; sem sinal, usa a cópia
  e.respondWith(
    comLimite(req, 4000).then(function (r) {
      if (r && r.ok) {
        var copia = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (achou) {
        if (achou) return achou;
        if (req.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504 });
      });
    })
  );
});
