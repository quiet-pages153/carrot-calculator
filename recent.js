'use strict';
// 화면별 최근 계산 (대출·할부·생활·부동산). 계산할 때 입력값을 저장하고, 누르면 다시 채워 계산한다.
(() => {
  const tabs = { loan: byId('loan-form'), installment: byId('installment-form'), life: byId('life-form'), property: null };
  const keyOf = tab => 'carrot-recent-' + tab;
  const load = tab => { try { const list = JSON.parse(localStorage.getItem(keyOf(tab)) || '[]'); return Array.isArray(list) ? list.filter(item => item && typeof item.title === 'string' && typeof item.sub === 'string' && item.snap) : []; } catch { return []; } };
  const save = (tab, list) => { try { localStorage.setItem(keyOf(tab), JSON.stringify(list.slice(0, 10))); } catch {} };
  const moneyText = value => /^[\d,]+원$/.test(value) && Number(value.replace(/\D/g, '')) >= 10000 ? koreanAmount(Number(value.replace(/\D/g, ''))) : value;

  // 계산서 내용으로 목록 한 줄을 만든다: 제목 = 계산 조건 앞 3개, 아래 줄 = 계산 이름 · 핵심 금액
  function describe(report) {
    const summary = reportRows(report.summary);
    // 빠른계산처럼 금액이 계산 결과 쪽에만 있으면(양도가액·취득가액·보증금) 그 금액을 제목 맨 앞에 둔다.
    const price = summary.find(([label]) => /^(양도가액|취득가액|보증금)$/.test(label));
    const details = [...(price ? [moneyText(price[1])] : []), ...reportRows(report.details).map(([, value]) => moneyText(value))].filter(Boolean).slice(0, 3);
    const [main] = summary;
    return { title: details.join(' · '), sub: report.title.replace(/ 계산서$/, '') + (main ? ' · ' + main[0].replace(/\s*\(.*\)/, '') + ' ' + main[1] : '') };
  }
  function snapshot(form) {
    const values = {};
    for (const element of form.elements) if (element.name) values[element.name] = element.value;
    return values;
  }
  function remember(tab, snap, session) {
    const report = reports[tab];
    if (!report) return;
    const entry = { ...describe(report), snap, time: Date.now(), session };
    // 같은 입력값이거나, 같은 빠른계산을 이어서 고친 것이면 앞 기록을 바꿔 쓴다.
    const same = JSON.stringify(snap);
    const list = load(tab).filter(item => JSON.stringify(item.snap) !== same && !(session && item.session === session));
    list.unshift(entry);
    save(tab, list);
    updateButton(tab);
  }

  // 저장 시점: 각 화면의 계산 버튼(제출) 뒤. 빠른 계산은 답이 다 채워지고 2초 동안 손을 떼면.
  for (const tab of ['loan', 'installment']) tabs[tab].addEventListener('submit', () => remember(tab, { form: snapshot(tabs[tab]) }));
  tabs.life.addEventListener('submit', () => remember('life', { mode: lifeMode, form: snapshot(tabs.life) }));
  byId('property-form').addEventListener('submit', () => remember('property', { mode: window.propertyMode(), form: snapshot(byId('property-form')) }));
  let quickTimer;
  let quickSession = Date.now();
  let restoring = false;
  const quickChanged = event => {
    if (restoring) return;
    if (event.target.closest?.('[data-q="deal"]')) quickSession = Date.now();
    clearTimeout(quickTimer);
    quickTimer = setTimeout(() => { if (window.propertyMode() === 'quick' && reports.property) remember('property', { quick: window.quickState() }, quickSession); }, 2000);
  };
  byId('property').querySelector('h2').addEventListener('click', event => { if (event.target.closest('.quick-button')) quickSession = Date.now(); });
  byId('property-quick-form').addEventListener('click', quickChanged);
  byId('property-quick-form').addEventListener('input', quickChanged);

  function fill(form, values) {
    // 대출 기간 단위는 바꿀 때 기간을 환산하므로, 단위를 먼저 조용히 맞춘 뒤 나머지를 채운다.
    if (form.elements.unit && values.unit) {
      form.elements.unit.value = values.unit;
      form.elements.duration.max = values.unit === '12' ? 50 : 600;
    }
    for (const [name, value] of Object.entries(values)) {
      const element = form.elements[name];
      if (!element || name === 'unit') continue;
      element.value = value;
      if (element.matches('[data-money]')) element.dispatchEvent(new Event('input', { bubbles: true }));
      // 부동산 화면은 select의 input 이벤트로 숨김 칸을 다시 맞춘다.
      if (element.tagName === 'SELECT') element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function restore(tab, snap) {
    if (tab === 'life') { selectLife(snap.mode); fill(tabs.life, snap.form); tabs.life.requestSubmit(); return; }
    if (tab === 'property') {
      if (snap.quick) { restoring = true; window.restoreQuick(snap.quick); restoring = false; clearTimeout(quickTimer); quickSession = Date.now(); return; }
      window.selectPropertyMode(snap.mode);
      const form = byId('property-form');
      fill(form, snap.form);
      form.requestSubmit();
      return;
    }
    fill(tabs[tab], snap.form);
    tabs[tab].requestSubmit();
  }

  // 화면마다 제목 옆 [최근 N] 버튼과 떠오르는 목록
  const buttons = {};
  for (const tab of Object.keys(tabs)) {
    const section = byId(tab);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-button';
    section.querySelector('h2').append(button);
    const pop = document.createElement('div');
    pop.className = 'recent-pop';
    pop.hidden = true;
    section.append(pop);
    buttons[tab] = button;
    button.addEventListener('click', () => {
      const open = pop.hidden;
      document.querySelectorAll('.recent-pop').forEach(item => { item.hidden = true; });
      if (!open) return;
      const list = load(tab);
      pop.innerHTML = list.length ? '<p>누르면 그때 입력값으로 다시 계산해요</p>' + list.map((item, index) =>
        '<button type="button" data-index="' + index + '"><b></b><span></span></button>').join('') : '<p>아직 계산 기록이 없어요.</p>';
      pop.querySelectorAll('[data-index]').forEach(row => {
        const item = list[row.dataset.index];
        row.querySelector('b').textContent = item.title;
        row.querySelector('span').textContent = item.sub;
        row.addEventListener('click', () => { pop.hidden = true; restore(tab, item.snap); });
      });
      pop.style.top = (section.querySelector('h2').offsetTop + section.querySelector('h2').offsetHeight + 6) + 'px';
      pop.hidden = false;
    });
    updateButton(tab);
  }
  function updateButton(tab) {
    if (buttons[tab]) buttons[tab].textContent = '최근 ' + load(tab).length;
  }
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.recent-pop, .recent-button')) return;
    document.querySelectorAll('.recent-pop').forEach(item => { item.hidden = true; });
  });
  byId('tabs').addEventListener('click', () => document.querySelectorAll('.recent-pop').forEach(item => { item.hidden = true; }));
})();
