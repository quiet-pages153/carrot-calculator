'use strict';

const byId = id => document.getElementById(id);
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 8 });
const won = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value) + '원';
const methodNames = { payment: '원리금균등', principal: '원금균등', balloon: '만기일시상환' };
const icon = path => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
const tabs = [
  ['basic', '기본', 'M5 3h14v18H5zM8 6h8v4H8zM8 13h1m6 0h1m-8 4h1m6 0h1'],
  ['loan', '대출', 'm2 8 10-5 10 5zM4 21h16M6 9v9m6-9v9m6-9v9M3 18h18'],
  ['installment', '할부', 'M3 6h18v15H3zM7 3v5m10-5v5M3 10h18m-14 4h2m4 0h2m-8 3h2'],
  ['life', '생활', 'M2 9h20l-3 11H5zM7 9l4-6m6 6-4-6M9 13v3m6-3v3'],
  ['property', '부동산', 'm2 11 10-8 10 8M5 10v11h14V10m-9 11v-6h4v6']
];
let activeTab = 'basic';
const reports = {};
byId('tabs').innerHTML = tabs.map(([id, label, path]) =>
  '<button type="button" data-tab="' + id + '">' + icon(path) + label + '</button>').join('');

function selectTab(tab) {
  activeTab = tab;
  for (const [id] of tabs) {
    byId(id).hidden = id !== tab;
    const button = document.querySelector('[data-tab="' + id + '"]');
    if (id === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
byId('tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (button) selectTab(button.dataset.tab);
});
selectTab('basic');

const keys = ['AC', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '±', '0', '.', '='];
const operations = ['+', '−', '×', '÷'];
const keyNames = { AC: '모두 지우기', '⌫': '한 자리 지우기', '±': '부호 바꾸기', '%': '퍼센트' };
// 연산 기호는 글꼴마다 위아래 위치가 달라서 그림으로 그려 가운데를 맞춘다.
const symbolPaths = { '÷': 'M5 12h14', '×': 'M6.5 6.5l11 11M17.5 6.5l-11 11', '−': 'M5 12h14',
  '+': 'M5 12h14M12 5v14', '=': 'M5 9h14M5 15h14' };
const symbol = key => '<svg class="key-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="' + symbolPaths[key] + '"/>' +
  (key === '÷' ? '<circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/>' : '') + '</svg>';
byId('keys').innerHTML = keys.map(key => {
  const kind = key === '=' ? 'equals' : operations.includes(key) ? 'operator' : keyNames[key] ? 'utility' : '';
  return '<button type="button" class="key ' + kind + '" data-key="' + key + '" aria-label="' + (keyNames[key] || key) + '">' + (symbolPaths[key] ? symbol(key) : key) + '</button>';
}).join('');
let entry = '0';
let terms = [];
let displayedExpression = '';
let waiting = false;
let finished = false;
let history = [];
try {
  const saved = JSON.parse(localStorage.getItem('carrot-history') || '[]');
  if (Array.isArray(saved)) history = saved.filter(item => item && typeof item.text === 'string' && Number.isFinite(item.value)).slice(0, 10);
} catch {}

function compact(value) {
  return Number.isInteger(value) && Math.abs(value) < 1e15 ? String(value) : String(Number(value.toPrecision(15)));
}
function formatEntry(value) {
  if (value === '오류') return value;
  if (value.includes('e')) return value;
  const [whole, fraction] = value.split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? formatted : formatted + '.' + fraction;
}
function updateDisplay() {
  const output = byId('number');
  output.textContent = formatEntry(entry);
  output.classList.toggle('small', output.textContent.length > 11);
  byId('expression').textContent = displayedExpression || terms.map(term => typeof term === 'number' ? number.format(term) : term).join(' ');
}
function updateHistory() {
  const list = byId('history-items');
  list.replaceChildren();
  if (!history.length) list.textContent = '아직 계산 기록이 없어요.';
  for (const item of history) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.text + ' = ' + formatEntry(String(item.value));
    button.addEventListener('click', () => {
      entry = String(item.value);
      terms = [];
      displayedExpression = item.text + ' =';
      finished = true;
      waiting = false;
      updateDisplay();
      byId('history').open = false;
    });
    list.append(button);
  }
}
// 최근 계산은 키패드 위로 떠오르는 창: 스크롤 없이 보이고, 바깥을 누르면 닫힌다.
document.addEventListener('pointerdown', event => {
  const panel = byId('history');
  if (panel.open && !panel.contains(event.target)) panel.open = false;
});
function evaluate(values) {
  let total = 0;
  let group = values[0];
  let sign = 1;
  for (let index = 1; index < values.length; index += 2) {
    const operator = values[index];
    const value = values[index + 1];
    if (operator === '×') group *= value;
    else if (operator === '÷') group /= value;
    else {
      total += group * sign;
      group = value;
      sign = operator === '+' ? 1 : -1;
    }
  }
  return total + group * sign;
}
const keyButtons = new Map(Array.from(byId('keys').querySelectorAll('[data-key]'), button => [button.dataset.key, button]));
const pressedTimers = new Map();

function tap(key) {
  const button = keyButtons.get(key);
  button.classList.add('is-pressed');
  clearTimeout(pressedTimers.get(key));
  pressedTimers.set(key, setTimeout(() => {
    button.classList.remove('is-pressed');
    pressedTimers.delete(key);
  }, 120));
  if (key === 'AC' || entry === '오류') {
    entry = '0';
    terms = [];
    displayedExpression = '';
    waiting = false;
    finished = false;
    if (key === 'AC') { updateDisplay(); return; }
  }
  if (operations.includes(key)) {
    if (waiting) terms[terms.length - 1] = key;
    else terms.push(Number(entry), key);
    displayedExpression = '';
    finished = false;
    waiting = true;
  } else if (key === '=') {
    if (waiting || !terms.length) return;
    const values = [...terms, Number(entry)];
    const total = evaluate(values);
    const expression = values.map(term => typeof term === 'number' ? number.format(term) : term).join(' ');
    entry = Number.isFinite(total) ? compact(total) : '오류';
    if (entry !== '오류') {
      history.unshift({ text: expression, value: Number(entry) });
      history = history.slice(0, 10);
      try { localStorage.setItem('carrot-history', JSON.stringify(history)); } catch {}
      updateHistory();
    }
    terms = [];
    displayedExpression = expression + ' =';
    finished = true;
    const bunny = document.querySelector('.bunny');
    bunny.classList.remove('hop');
    requestAnimationFrame(() => requestAnimationFrame(() => bunny.classList.add('hop')));
  } else if (key === '%' || key === '±' || key === '⌫') {
    if (waiting) return;
    if (key === '%') {
      const last = terms[terms.length - 1];
      const base = (last === '+' || last === '−') ? evaluate(terms.slice(0, -1)) : 1;
      entry = compact(base * Number(entry) / 100);
    }
    if (key === '±' && Number(entry) !== 0) entry = entry.startsWith('-') ? entry.slice(1) : '-' + entry;
    if (key === '⌫') entry = entry.includes('e') ? '0' : entry.slice(0, -1).replace(/^-$/, '') || '0';
    displayedExpression = '';
    finished = false;
  } else {
    if (waiting || finished || entry.includes('e')) entry = '0';
    waiting = false;
    finished = false;
    displayedExpression = '';
    if (entry.length >= 15 || (key === '.' && entry.includes('.'))) return;
    entry = key !== '.' && entry === '0' ? key : entry + key;
  }
  updateDisplay();
}
byId('keys').addEventListener('click', event => {
  const button = event.target.closest('[data-key]');
  if (button) tap(button.dataset.key);
});
document.addEventListener('keydown', event => {
  if (activeTab !== 'basic' || byId('print-dialog').open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('button, summary') && event.key === 'Enter') return;
  const key = ({ '*': '×', '/': '÷', '-': '−', 'Enter': '=', 'Escape': 'AC', 'Backspace': '⌫' })[event.key] || event.key;
  if (keys.includes(key)) { event.preventDefault(); tap(key); }
});
updateHistory();

function koreanAmount(value) {
  if (!value) return '';
  const blocks = [[1e12, '조'], [1e8, '억'], [1e4, '만'], [1, '']];
  let remainder = value;
  const text = [];
  for (const [size, unit] of blocks) {
    const count = Math.floor(remainder / size);
    if (count) text.push(number.format(count) + unit);
    remainder %= size;
  }
  return text.join(' ') + ' 원';
}
function parseMoneyAmount(raw) {
  const text = raw.normalize('NFKC').trim()
    .replace(/^(?:₩|KRW)\s*/i, '')
    .replace(/\s*(?:원|KRW)$/i, '').trim();
  const integer = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
  const limit = 99999999999999n;
  const units = { 조: 1000000000000n, 억: 100000000n, 만: 10000n, 천: 1000n, 백: 100n, 십: 10n };
  let value = 0n;
  if (integer.test(text)) {
    value = BigInt(text.replaceAll(',', ''));
  } else {
    const tokens = /(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*([조억만천백십])\s*/y;
    let index = 0;
    let previousUnit = limit;
    while (index < text.length) {
      tokens.lastIndex = index;
      const token = tokens.exec(text);
      if (!token) break;
      const [, whole, fraction = '', symbol] = token;
      const unit = units[symbol];
      if (unit >= previousUnit || fraction.length > 12) return null;
      previousUnit = unit;
      const precision = 10n ** BigInt(fraction.length);
      const scaled = BigInt(whole.replaceAll(',', '') + fraction) * unit;
      if (scaled % precision !== 0n) return null;
      value += scaled / precision;
      index = tokens.lastIndex;
    }
    if (index === 0) return null;
    const rest = text.slice(index);
    if (rest) {
      if (!integer.test(rest)) return null;
      const part = BigInt(rest.replaceAll(',', ''));
      if (part >= previousUnit) return null;
      value += part;
    }
  }
  return value <= limit ? String(value) : null;
}

function showMoneyStatus(input, message, digits = '') {
  let description = input.parentElement.querySelector('.amount-name');
  if (!description) {
    description = document.createElement('span');
    description.className = 'amount-name';
    input.after(description);
  }
  description.id = input.form.id + '-' + input.name + '-amount-name';
  description.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-describedby', description.id);
  description.classList.toggle('money-error', Boolean(message));
  input.setCustomValidity(message);
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  description.textContent = message || koreanAmount(Number(digits));
}

const moneyFormatError = '원 단위 금액을 입력해 주세요. 예: 365,000,000원, 3억 6,500만 원';

function formatMoney(input, strict = false) {
  const raw = input.value;
  const prefix = raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, '');
  const typingDigits = !strict && /^[\d,]*$/.test(raw) ? raw.replaceAll(',', '') : null;
  const digits = raw === '' ? '' :
    typingDigits !== null && typingDigits.length <= 14 ? typingDigits.replace(/^0+(?=\d)/, '') :
      parseMoneyAmount(raw);
  if (digits === null) {
    showMoneyStatus(input, moneyFormatError);
    return;
  }
  input.value = digits ? formatEntry(digits) : '';
  if (document.activeElement === input && typingDigits !== null) {
    let cursor = 0;
    let remaining = prefix.length;
    while (cursor < input.value.length && remaining > 0) {
      if (input.value[cursor] !== ',') remaining--;
      cursor++;
    }
    input.setSelectionRange(cursor, cursor);
  }
  const needsPositive = input.name === 'amount' && ['loan-form', 'installment-form'].includes(input.form.id);
  const message = needsPositive && digits === '0' ? '1원 이상 입력해 주세요.' : '';
  showMoneyStatus(input, message, digits);
}

document.addEventListener('paste', event => {
  const input = event.target;
  if (!input.matches('[data-money]') || !event.clipboardData) return;
  const text = event.clipboardData.getData('text/plain');
  event.preventDefault();
  const amount = parseMoneyAmount(text);
  if (amount === null) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    showMoneyStatus(input, moneyFormatError);
    return;
  }
  input.value = amount;
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('input', event => {
  if (event.target.matches('[data-money]') && !event.isComposing) {
    formatMoney(event.target, event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop');
  }
});
document.addEventListener('compositionend', event => {
  if (event.target.matches('[data-money]')) formatMoney(event.target, true);
});
document.querySelectorAll('[data-money]').forEach(input => formatMoney(input));

function schedule(amount, annualRate, months, method) {
  const rate = annualRate / 1200;
  const fixed = rate ? amount * rate / -Math.expm1(-months * Math.log1p(rate)) : amount / months;
  let balance = amount;
  let totalInterest = 0;
  const rows = [];
  for (let month = 1; month <= months; month++) {
    const interest = Math.round(balance * rate);
    let principal = balance;
    if (month < months) {
      if (method === 'payment' && rate) principal = Math.max(0, Math.round(amount * Math.expm1(month * Math.log1p(rate)) / Math.expm1(months * Math.log1p(rate))) - (amount - balance));
      if (method === 'principal' || (method === 'payment' && !rate)) principal = Math.floor(amount / months) + (month <= amount % months ? 1 : 0);
      if (method === 'balloon') principal = 0;
    }
    principal = Math.min(balance, principal);
    balance -= principal;
    totalInterest += interest;
    rows.push({ month, principal, interest, payment: principal + interest, balance });
  }
  return { rows, totalInterest, total: amount + totalInterest, first: rows[0].payment, last: rows.at(-1).payment };
}
function stats(values) {
  return '<dl class="stats">' + values.map(([label, value]) => '<dt>' + label + '</dt><dd>' + value + '</dd>').join('') + '</dl>';
}
function monthTable(rows, fee) {
  return '<table><thead><tr><th scope="col">회차</th><th scope="col">납입액</th><th scope="col">원금</th><th scope="col">' + fee + '</th><th scope="col">남은 잔액</th></tr></thead><tbody>' +
    rows.map(row => '<tr><td>' + row.month + '</td>' + [row.payment, row.principal, row.interest, row.balance].map(amount => '<td>' + number.format(amount) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}
function withRows(rows, fee) {
  return '<details><summary>월별 내역 ' + rows.length + '회 · 단위 원</summary><div class="table-wrap">' + monthTable(rows, fee) + '</div></details>';
}
function formNumber(form, field) {
  return Number(form.elements[field].value.replaceAll(',', ''));
}
const loan = byId('loan-form');
const installment = byId('installment-form');
loan.elements.unit.addEventListener('change', () => {
  const asYears = loan.elements.unit.value === '12';
  const duration = loan.elements.duration;
  if (asYears && Number(duration.value) % 12) { loan.elements.unit.value = '1'; return; }
  if (duration.value) duration.value = asYears ? Math.max(1, Math.ceil(Number(duration.value) / 12)) : Number(duration.value) * 12;
  duration.max = asYears ? 50 : 600;
});
function resetResult(form, tab) {
  form.addEventListener('input', () => {
    delete reports[tab];
    byId(tab + '-result').replaceChildren();
  });
}
resetResult(loan, 'loan');
resetResult(installment, 'installment');

function createLoan(event) {
  event.preventDefault();
  const amount = formNumber(loan, 'amount');
  const rate = formNumber(loan, 'rate');
  const months = formNumber(loan, 'duration') * formNumber(loan, 'unit');
  const method = loan.elements.method.value;
  if (amount <= 0) { byId('loan-result').textContent = '대출금은 1원 이상 입력해 주세요.'; return; }
  const all = Object.keys(methodNames).map(key => [key, schedule(amount, rate, months, key)]);
  const result = all.find(([key]) => key === method)[1];
  const comparison = '<table><thead><tr><th>상환 방식</th><th>첫 달 납입액</th><th>총이자</th></tr></thead><tbody>' +
    all.map(([key, item]) => '<tr><td>' + methodNames[key] + '</td><td>' + won(item.first) +
    '</td><td>' + won(item.totalInterest) + '</td></tr>').join('') + '</tbody></table>';
  const note = '고정 연이율을 12로 나누며 이자를 원 단위로 반올림했어요. 실제 상환액은 금융사 약정에 따라 달라질 수 있어요.';
  const details = stats([['대출금', won(amount)], ['연이율', number.format(rate) + '%'], ['상환기간', months + '개월'], ['상환 방식', methodNames[method]]]);
  const summary = stats([['첫 달 납입액', won(result.first)], ['마지막 달 납입액', won(result.last)],
    ['총이자', won(result.totalInterest)], ['총상환액', won(result.total)]]);
  byId('loan-result').innerHTML = '<h3>' + methodNames[method] + '</h3>' + summary +
    '<details open><summary>상환 방식 비교</summary><div class="table-wrap">' + comparison + '</div></details>' +
    withRows(result.rows, '이자') + '<p class="note">' + note + '</p>';
  reports.loan = { title: '대출 계산서', details, summary, comparison, rows: result.rows, fee: '이자', note };
}
loan.addEventListener('submit', createLoan);

function createInstallment(event) {
  event.preventDefault();
  const amount = formNumber(installment, 'amount');
  const rate = formNumber(installment, 'rate');
  const months = formNumber(installment, 'months');
  if (amount <= 0) { byId('installment-result').textContent = '결제금액은 1원 이상 입력해 주세요.'; return; }
  const result = schedule(amount, rate, months, 'principal');
  const details = stats([['결제금액', won(amount)], ['할부 개월', months + '개월'], ['연 수수료율', number.format(rate) + '%']]);
  const summary = stats([['첫 달 납부액', won(result.first)], ['마지막 달 납부액', won(result.last)],
    ['총수수료', won(result.totalInterest)], ['총결제액', won(result.total)]]);
  const note = '잔여 원금에 월 수수료율을 적용한 예상 금액이에요. 실제 카드 청구액은 카드사 약정에 따라 달라질 수 있어요.';
  byId('installment-result').innerHTML = '<h3>' + (rate ? '유이자 할부 예상액' : '무이자 할부') + '</h3>' +
    summary + withRows(result.rows, '수수료');
  reports.installment = { title: '할부 계산서', details, summary, rows: result.rows, fee: '수수료', note };
}
installment.addEventListener('submit', createInstallment);

const lifeOptions = {
  discount: { name: '할인', fields: [['가격 (원)', 'money', 35000], ['할인율 (%)', 'rate', 20]],
    calculate: ([price, rate]) => { const sale = Math.round(price * rate / 100); return [['할인가', won(price - sale)], ['할인액', won(sale)]]; } },
  split: { name: 'N빵', fields: [['총금액 (원)', 'money', 47000], ['인원 (명)', 'count', 3]],
    calculate: ([price, people]) => { const share = Math.floor(price / people); const extra = price % people;
      return extra ? [['기본 분담', (people - extra) + '명 × ' + won(share)], ['1원 추가', extra + '명 × ' + won(share + 1)]] : [['1인당', won(share)]]; } },
  unit: { name: '단가 비교', fields: [['A 가격 (원)', 'money', 3500], ['A 수량 (g 또는 개)', 'quantity', 350], ['B 가격 (원)', 'money', 7400], ['B 수량 (g 또는 개)', 'quantity', 800]],
    calculate: ([a, qa, b, qb], unit) => { const base = unit === 'g' ? 100 : 1; const suffix = unit === 'g' ? '100g당' : '1개당';
      return [['A ' + suffix, number.format(a / qa * base) + '원'], ['B ' + suffix, number.format(b / qb * base) + '원'],
        ['비교', Math.abs(a / qa - b / qb) <= 1e-12 * Math.max(a / qa, b / qb) ? '같은 단가' : (a / qa < b / qb ? 'A가 저렴해요' : 'B가 저렴해요')]]; } },
  vat: { name: '부가세', fields: [['금액 (원)', 'money', 110000]],
    calculate: ([price], mode) => { const supply = mode === 'gross' ? Math.round(price / 1.1) : price;
      const tax = mode === 'gross' ? price - supply : Math.round(price / 10);
      return [['공급가액', won(supply)], ['부가세 (10%)', won(tax)], ['합계', won(supply + tax)]]; } }
};
let lifeMode;
const lifeForm = byId('life-form');
byId('life-tabs').innerHTML = Object.entries(lifeOptions).map(([key, item]) =>
  '<button type="button" data-life="' + key + '">' + item.name + '</button>').join('');
function selectLife(mode) {
  lifeMode = mode;
  delete reports.life;
  byId('life-result').replaceChildren();
  byId('life-tabs').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.life === mode)));
  const inputs = lifeOptions[mode].fields.map(([label, type, value], index) => {
    const attributes = type === 'money' ? 'data-money inputmode="numeric" value="' + number.format(value) + '"' :
      'type="number" min="' + (type === 'rate' ? 0 : type === 'quantity' ? '0.001' : 1) +
      '" max="' + (type === 'rate' ? 100 : 1000000000) + '" step="' + (type === 'count' ? 1 : 'any') + '" value="' + value + '"';
    return '<label>' + label + '<input name="field' + index + '" required ' + attributes + '></label>';
  });
  if (mode === 'unit') inputs.unshift('<label class="full">비교 단위<select name="option"><option value="g">그램 (g)</option><option value="count">개</option></select></label>');
  if (mode === 'vat') inputs.push('<label>입력 기준<select name="option"><option value="gross">부가세 포함</option><option value="net">부가세 제외</option></select></label>');
  lifeForm.innerHTML = inputs.join('') + '<button class="action full">계산하기</button>';
}
byId('life-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-life]');
  if (button) selectLife(button.dataset.life);
});
lifeForm.addEventListener('input', () => {
  delete reports.life;
  byId('life-result').replaceChildren();
});
lifeForm.addEventListener('submit', event => {
  event.preventDefault();
  const item = lifeOptions[lifeMode];
  const values = item.fields.map((field, index) => formNumber(lifeForm, 'field' + index));
  const option = lifeForm.elements.option;
  const inputs = item.fields.map(([label], index) => [label, number.format(values[index])]);
  if (option) inputs.unshift([lifeMode === 'unit' ? '비교 단위' : '입력 기준', option.selectedOptions[0].textContent]);
  const summary = stats(item.calculate(values, option?.value));
  byId('life-result').innerHTML = summary;
  reports.life = { title: item.name + ' 계산서', details: stats(inputs), summary };
});
selectLife('discount');

const dialog = byId('print-dialog');
byId('print-open').addEventListener('click', () => {
  const report = reports[activeTab];
  const hasRows = Boolean(report?.rows);
  byId('print-description').textContent = hasRows ? '요약만 인쇄하거나 월별 내역까지 포함할 수 있어요.' :
    (report || activeTab === 'basic') ? '현재 계산 결과를 A4 한 장으로 인쇄해요.' :
    '먼저 현재 탭에서 계산해 주세요.';
  byId('print-detail').hidden = !hasRows;
  byId('include-rows').checked = false;
  dialog.querySelector('[value="print"]').disabled = !report && activeTab !== 'basic';
  dialog.returnValue = '';
  dialog.showModal();
});
// 계산서는 공문서 말투(~합니다)로 바꿔 싣는다.
const formal = text => [['이에요', '입니다'], ['예요', '입니다'], ['돼요', '됩니다'], ['있어요', '있습니다'], ['않아요', '않습니다'], ['했어요', '했습니다'], ['하세요', '하십시오'], ['해요', '합니다']]
  .reduce((result, [from, to]) => result.replaceAll(from, to), text);
function makeReport(item, includeRows) {
  const report = byId('print-report');
  const now = new Date();
  const date = now.getFullYear() + '. ' + (now.getMonth() + 1) + '. ' + now.getDate() + '.';
  let number = 0;
  const section = (title, body, extra = '') => '<section class="doc-section ' + extra + '"><h2>' + (++number) + '. ' + title + '</h2>' + body + '</section>';
  report.innerHTML = '<header class="doc-head"><div><p class="doc-kind">계산 결과 확인서</p><h1>' + item.title + '</h1></div>' +
    '<dl class="doc-meta"><dt>작성일</dt><dd>' + date + '</dd>' + (item.basis ? '<dt>요율 기준</dt><dd>' + item.basis + '</dd>' : '') + '</dl></header>' +
    section('계산 조건', item.details) + section('계산 결과', item.summary, 'doc-result') +
    (item.comparison ? section('상환 방식 비교', item.comparison) : '') +
    '<section class="doc-notice"><h2>유의사항</h2>' + (item.note ? '<p>' + formal(item.note) + '</p>' : '') +
    '<p>이 확인서는 입력한 조건으로 계산한 예상액이며 법적 효력이 없습니다. 실제 금액은 금융기관·관할 관청·중개사무소의 확인 결과에 따릅니다.</p></section>' +
    '<footer class="doc-foot">캐롯계산기 · ' + date + ' 작성</footer>';
  if (includeRows && item.rows) {
    const pageSize = 28;
    const totalPages = Math.ceil(item.rows.length / pageSize);
    for (let start = 0; start < item.rows.length; start += pageSize) {
      const page = document.createElement('section');
      page.className = 'print-detail';
      page.innerHTML = '<h2>월별 납입 내역 · ' + (start / pageSize + 1) + '/' + totalPages + '</h2><p class="note">단위 원</p>' +
        monthTable(item.rows.slice(start, start + pageSize), item.fee);
      report.append(page);
    }
  }
  report.append(report.querySelector('.doc-foot'));
}
function currentReport() {
  return activeTab === 'basic' ? { title: '기본 계산 결과', details: stats([['계산식', byId('expression').textContent || '—']]),
    summary: stats([['결과', byId('number').textContent]]) } : reports[activeTab];
}
// 폰 크롬은 인쇄 미리보기를 늦게 만들어서, 창이 닫히고 화면이 다시 그려진 뒤에 인쇄를 부른다.
dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'print') return;
  const report = currentReport();
  if (!report) return;
  makeReport(report, byId('include-rows').checked);
  printing = true;
  document.fonts.ready.then(() => requestAnimationFrame(() => setTimeout(() => window.print(), 250)));
});
// 브라우저 메뉴의 인쇄로 바로 찍어도 백지가 되지 않게, 보고서가 비어 있으면 지금 화면 결과로 채운다.
let printing = false;
window.addEventListener('beforeprint', () => {
  if (printing && byId('print-report').childElementCount) return;
  const report = currentReport();
  if (report) makeReport(report, false);
});
window.addEventListener('afterprint', () => { printing = false; });
