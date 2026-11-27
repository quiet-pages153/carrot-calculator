'use strict';
// 설치·업데이트·안내. 버전과 안내 문구는 조립.ps1이 채운다.
(() => {
  const APP = 'carrot-calculator';
  const APP_V = '19';
  const NOTE = ["계산서에 색을 넣고, 가장 중요한 금액을 맨 위 상자에 크게 보여 줘요.","합계·상한 같은 주요 금액은 색으로, 계산 과정 금액은 연하게 구분했어요."];
  const KEY = APP + '-';
  const web = ['http:', 'https:'].includes(location.protocol);
  const store = {
    get: key => { try { return localStorage.getItem(KEY + key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(KEY + key, value); } catch {} }
  };

  const bar = document.createElement('div');
  bar.id = 'pwa-bar';
  bar.hidden = true;
  document.body.append(bar);
  function showBar(html, actions = {}) {
    bar.innerHTML = html + '<button type="button" class="pwa-close" aria-label="닫기">✕</button>';
    bar.hidden = false;
    bar.querySelector('.pwa-close').onclick = () => { bar.hidden = true; actions.close?.(); };
    Object.entries(actions).forEach(([name, run]) => { const button = bar.querySelector('[data-pwa="' + name + '"]'); if (button) button.onclick = run; });
  }

  // 1) 업데이트 안내 창: 버전이 바뀐 뒤 처음 열었을 때 한 번
  const seen = store.get('seen-v');
  const usedBefore = (() => { try { return localStorage.getItem('carrot-history') !== null; } catch { return false; } })();
  if (seen !== APP_V) {
    if (seen === null && !usedBefore) store.set('seen-v', APP_V);
    else {
      const dialog = document.createElement('dialog');
      dialog.id = 'pwa-note';
      dialog.innerHTML = '<form method="dialog"><h2>v' + APP_V + '로 바뀌었어요</h2><ul>' +
        NOTE.map(line => '<li>' + line + '</li>').join('') + '</ul><div class="dialog-buttons"><button class="action">확인</button></div></form>';
      document.body.append(dialog);
      dialog.addEventListener('close', () => store.set('seen-v', APP_V));
      dialog.showModal();
    }
  }

  if (!web) return;

  // 2) 서비스워커 등록. 새 버전이 자리 잡으면 한 번 새로 불러온다.
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw-carrot-calculator.js', { scope: './' }).catch(console.warn);
  }
  navigator.storage?.persist?.().catch(() => {});

  // 3) 새 버전 확인 (10분 간격)
  let lastCheck = 0;
  async function checkUpdate() {
    if (Date.now() - lastCheck < 600000) return;
    lastCheck = Date.now();
    try {
      const response = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      const info = await response.json();
      if (info.app !== APP || String(info.v) === APP_V) return;
      showBar('<span>새 버전 v' + info.v + '이 있어요</span><button type="button" class="action" data-pwa="update">바꾸기</button>', { update: applyUpdate });
    } catch {}
  }
  async function applyUpdate() {
    try { await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); }
    catch { showBar('<span>인터넷에 연결한 뒤 다시 눌러 주세요</span>'); return; }
    try { const history = localStorage.getItem('carrot-history'); if (history !== null) localStorage.setItem('carrot-history-before-update', history); } catch {}
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(APP + '-')).map(key => caches.delete(key)));
    const scope = new URL('./', location.href).href;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(item => item.scope === scope).map(item => item.unregister()));
    await Promise.all(['./', 'index.html', 'sw-carrot-calculator.js', 'manifest.webmanifest'].map(path => fetch(path, { cache: 'reload' }).catch(() => {})));
    location.replace(location.pathname + '?v=' + Date.now());
  }
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

  // 4) 설치 안내
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone || store.get('install-hide')) return;
  const agent = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|BAND/i.test(agent) || (ios && /CriOS|FxiOS/.test(agent));
  const hide = () => store.set('install-hide', '1');
  if (inApp) {
    if (ios) showBar('<span>설치하려면 Safari로 열어 주세요 (오른쪽 아래 공유 → Safari로 열기)</span>', { close: hide });
    else {
      const intent = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
      showBar('<span>설치하려면 크롬에서 열어 주세요</span><a class="action" href="' + intent + '">크롬으로</a>', { close: hide });
    }
    return;
  }
  if (ios) { showBar('<span>홈 화면에 두려면: 공유(네모에 위 화살표) → 홈 화면에 추가</span>', { close: hide }); return; }
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    showBar('<span>폰에 앱으로 설치할 수 있어요</span><button type="button" class="action" data-pwa="install">설치</button>', {
      close: hide,
      install: async () => {
        installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') showBar('<span>설치했어요. 이 창은 닫고 홈 화면 아이콘으로 열어 주세요</span>', { close: hide });
      }
    });
  });
})();
