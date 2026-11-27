'use strict';

const propertyRules = (() => {
  const highValueHome = 1200000000;
  const basicTaxBrackets = [
    [14000000, 6, 0], [50000000, 15, 1260000], [88000000, 24, 5760000],
    [150000000, 35, 15440000], [300000000, 38, 19940000],
    [500000000, 40, 25940000], [1000000000, 42, 35940000], [Infinity, 45, 65940000]
  ];
  const saleBrackets = [
    [50000000, 0.6, 250000], [200000000, 0.5, 800000], [900000000, 0.4],
    [1200000000, 0.5], [1500000000, 0.6], [Infinity, 0.7]
  ];
  const leaseBrackets = [
    [50000000, 0.5, 200000], [100000000, 0.4, 300000], [600000000, 0.3],
    [1200000000, 0.4], [1500000000, 0.5], [Infinity, 0.6]
  ];
  const ratioAmount = (amount, percent) => Math.floor(Math.floor(amount * percent / 100 + 1e-6) / 10) * 10;

  function transfer({ kind, sale, purchase, costs, holding, residence, allowance }) {
    const gain = sale - purchase - costs;
    const positiveGain = Math.max(0, gain);
    const taxableGain = kind === 'qualified'
      ? Number(BigInt(positiveGain) * BigInt(Math.max(0, sale - highValueHome)) / BigInt(sale))
      : positiveGain;
    let deductionRate = holding >= 3 ? Math.min(holding, 15) * 2 : 0;
    if (kind === 'qualified' && holding >= 3 && residence >= 2) {
      deductionRate = (Math.min(holding, 10) + Math.min(residence, 10)) * 4;
    }
    const deduction = Math.floor(taxableGain * deductionRate / 100);
    const usedAllowance = Math.min(allowance, taxableGain - deduction);
    const base = taxableGain - deduction - usedAllowance;
    const [, rate, progressiveDeduction] = basicTaxBrackets.find(([limit]) => base <= limit);
    const national = Math.floor((base * rate / 100 - progressiveDeduction) / 10) * 10;
    const local = Math.floor(national / 100) * 10;
    return { gain, taxableGain, deductionRate, deduction, usedAllowance, base, national, local, total: national + local };
  }

  function acquisition({ kind, amount, size }) {
    let rate = 4;
    let educationRate = 0.4;
    let ruralRate = 0.2;
    if (kind !== 'commercial') {
      if (kind === 'standard') {
        rate = Math.min(3, Math.max(1, amount / 150000000 - 3));
        rate = Math.round(rate * 10000) / 10000;
        educationRate = rate / 10;
        ruralRate = 0.2;
      } else {
        rate = Number(kind);
        ruralRate = rate === 8 ? 0.6 : 1;
      }
      if (size === 'within') ruralRate = 0;
    }
    const tax = ratioAmount(amount, rate);
    const education = ratioAmount(amount, educationRate);
    const rural = ratioAmount(amount, ruralRate);
    return { rate, tax, education, rural, total: tax + education + rural };
  }

  function brokerage({ kind, deal, amount, rent }) {
    const lease = deal !== 'sale';
    const initial = deal === 'monthly' ? amount + rent * 100 : amount;
    const basis = deal === 'monthly' && initial < 50000000 ? amount + rent * 70 : initial;
    let rate = 0.9;
    let ceiling = Infinity;
    if (kind === 'home') {
      const brackets = lease ? leaseBrackets : saleBrackets;
      [, rate, ceiling = Infinity] = brackets.find(([limit]) => basis < limit);
    } else if (kind === 'officetel') {
      rate = lease ? 0.4 : 0.5;
    }
    const maximum = Math.min(Math.floor(basis * Math.round(rate * 1000) / 100000), ceiling);
    return { basis, rate, ceiling, maximum };
  }

  function brokeragePayment(maximum, agreed, vat) {
    if (agreed === null) {
      if (vat !== null) throw new Error('부가세를 더하려면 내 약정보수를 입력해 주세요.');
      return null;
    }
    if (agreed > maximum) throw new Error('내 약정보수가 1인 상한을 넘어요. 부가세를 뺀 금액을 확인해 주세요.');
    return agreed + (vat ?? 0);
  }

  return Object.freeze({ transfer, acquisition, brokerage, brokeragePayment });
})();

(() => {
  const form = byId('property-form');
  const output = byId('property-result');
  const picker = byId('property-options');
  const hint = byId('property-hint');
  const basisDate = '2026. 11. 26.';
  const percent = value => number.format(value) + '%';
  const money = (name, title, required = true) =>
    '<label class="full">' + title + '<input name="' + name + '" data-money inputmode="numeric" ' +
    (required ? 'required' : '') + '><span class="amount-name"></span></label>';
  const integer = (name, title, min, max, value = '') => '<label>' + title +
    '<input name="' + name + '" type="number" required min="' + min + '" max="' + max + '" step="1" value="' + value + '"></label>';
  const select = (name, title, options, full = false) => '<label' + (full ? ' class="full"' : '') + '>' +
    title + '<select name="' + name + '">' + options.map(([value, label]) =>
      '<option value="' + value + '">' + label + '</option>').join('') + '</select></label>';
  const labelOf = field => form.elements[field].selectedOptions[0].textContent;
  const fields = {
    transfer: {
      title: '양도소득세',
      markup: select('kind', '적용 유형', [
        ['', '확인한 과세 유형을 선택해 주세요'], ['qualified', '1세대 1주택 비과세 요건 충족'],
        ['standard', '기본세율 대상 · 중과 없음']
      ], true) + money('sale', '판 가격 (원)') + money('purchase', '산 가격 (원)') +
      money('costs', '인정되는 필요경비 (원)', false) +
      integer('holding', '보유 만 년수', 2, 120) + integer('residence', '거주 만 년수', 0, 120, 0) +
      select('allowance', '해당 연도에 남은 기본공제', [['2500000', '250만 원 전액'], ['0', '남은 공제 없음'], ['partial', '남은 금액 직접 입력']], true) +
      '<div class="full" id="property-allowance">' + money('remaining', '남은 기본공제 (원)', false) + '</div>',
      hint: '개인 주택 단독명의 기준이에요. 비과세 요건은 확인 후 선택하세요. 보유 2년 미만, 중과, 공동명의, 미등기, 다른 거래와 합산 정산하는 경우는 계산 범위에서 제외돼요.',
      data: () => ({ kind: form.elements.kind.value, sale: formNumber(form, 'sale'), purchase: formNumber(form, 'purchase'),
        costs: formNumber(form, 'costs'), holding: formNumber(form, 'holding'), residence: formNumber(form, 'residence'),
        allowance: form.elements.allowance.value === 'partial' ? formNumber(form, 'remaining') : formNumber(form, 'allowance') }),
      result(data) {
        if (!data.kind) throw new Error('먼저 확인한 과세 유형을 선택해 주세요.');
        if (data.sale <= 0 || data.purchase <= 0) throw new Error('판 가격과 산 가격을 1원 이상 입력해 주세요.');
        if (data.residence > data.holding) throw new Error('거주기간은 보유기간을 넘을 수 없어요.');
        if (data.allowance > 2500000) throw new Error('남은 기본공제는 250만 원 이하로 입력해 주세요.');
        const tax = propertyRules.transfer(data);
        return {
          headline: '예상 세금 합계',
          amount: tax.total,
          details: [['적용 유형', labelOf('kind')], ['판 가격', won(data.sale)], ['산 가격', won(data.purchase)],
            ['필요경비', won(data.costs)], ['보유 · 거주', data.holding + '년 · ' + data.residence + '년'],
            ['남은 기본공제', won(data.allowance)]],
          breakdown: [['양도차익', won(tax.gain)], ['과세 대상 양도차익', won(tax.taxableGain)],
            ['장기보유특별공제액 (' + percent(tax.deductionRate) + ')', won(tax.deduction)], ['적용 기본공제액', won(tax.usedAllowance)],
            ['과세표준', won(tax.base)], ['양도소득세', won(tax.national)], ['개인지방소득세', won(tax.local)]]
        };
      }
    },
    acquisition: {
      title: '취득세',
      markup: money('amount', '취득 과세표준 (원)') + select('kind', '적용 유형', [
        ['', '확인한 취득 유형을 선택해 주세요'], ['standard', '주택 일반세율 (1~3%)'],
        ['8', '주택 중과 8% 적용 확인'], ['12', '주택 중과 12% 적용 확인'], ['commercial', '상가·일반 건물 매매']
      ], true) + '<div class="full" id="property-size">' + select('size', '국민주택규모', [
        ['', '해당 주택 규모를 선택해 주세요'], ['within', '국민주택규모 이하'], ['above', '국민주택규모 초과']
      ], true) + '</div>',
      hint: '개인 부동산 전체 매매 기준이에요. 지분 취득, 생애최초 감면, 증여·상속, 농지는 계산 범위에서 제외돼요. 국민주택규모는 일반적으로 전용 85㎡ 이하이며, 해당 읍·면은 100㎡ 이하 기준이 적용될 수 있어요.',
      data: () => ({ kind: form.elements.kind.value, amount: formNumber(form, 'amount'), size: form.elements.size.value }),
      result(data) {
        if (!data.kind) throw new Error('먼저 확인한 취득 유형을 선택해 주세요.');
        if (data.amount <= 0) throw new Error('과세표준을 1원 이상 입력해 주세요.');
        if (data.kind !== 'commercial' && !data.size) throw new Error('해당 주택 규모를 선택해 주세요.');
        const tax = propertyRules.acquisition(data);
        const details = [['적용 유형', labelOf('kind')], ['과세표준', won(data.amount)]];
        if (data.kind !== 'commercial') details.push(['주택 규모', labelOf('size')]);
        return { headline: '예상 세금 합계', amount: tax.total, details,
          breakdown: [['취득세율', percent(tax.rate)], ['취득세', won(tax.tax)], ['지방교육세', won(tax.education)], ['농어촌특별세', won(tax.rural)]] };
      }
    },
    brokerage: {
      title: '중개보수',
      markup: select('kind', '중개 물건', [
        ['home', '주택 (대전 기준)'], ['officetel', '85㎡ 이하 · 요건 충족 오피스텔'],
        ['other', '상가·토지·그 외 오피스텔']
      ], true) + select('deal', '거래 유형', [['sale', '매매'], ['lease', '전세'], ['monthly', '월세']], true) +
      money('amount', '거래금액 (원)') + '<div class="full" id="property-rent">' + money('rent', '월세 (원)') + '</div>' +
      '<details class="full"><summary>내가 합의한 금액 입력 (선택)</summary>' +
      money('agreed', '내 약정보수 · 부가세 제외 (원)', false) +
      money('vat', '내 부가세 · 확인된 금액 (원)', false) + '</details>',
      hint: '매도인과 매수인, 또는 임대인과 임차인은 각자 협의한 보수를 냅니다. 표시되는 상한은 한 사람 기준이에요. 약정보수와 확인된 부가세를 입력하면 내 납부액을 계산해요. 오피스텔 우대 요율은 전용 입식 부엌, 수세식 화장실 및 목욕시설을 갖춘 경우에 적용해요.',
      data: () => ({ kind: form.elements.kind.value, deal: form.elements.deal.value, amount: formNumber(form, 'amount'),
        rent: formNumber(form, 'rent'), agreed: form.elements.agreed.value === '' ? null : formNumber(form, 'agreed'),
        vat: form.elements.vat.value === '' ? null : formNumber(form, 'vat') }),
      result(data) {
        const monthly = data.deal === 'monthly';
        if (monthly ? data.rent <= 0 : data.amount <= 0) throw new Error('거래금액 또는 월세를 1원 이상 입력해 주세요.');
        const fee = propertyRules.brokerage(data);
        const details = [['중개 물건', labelOf('kind')], ['거래 유형', labelOf('deal')],
          [data.deal === 'sale' ? '매매가' : '보증금', won(data.amount)]];
        if (monthly) details.push(['월세', won(data.rent)]);
        const amount = propertyRules.brokeragePayment(fee.maximum, data.agreed, data.vat);
        const breakdown = [['요율 적용 거래금액', won(fee.basis)], ['상한요율', percent(fee.rate)],
          ['내 쪽 중개보수 상한 (부가세 별도)', won(fee.maximum)]];
        if (amount !== null) {
          details.push(['내 약정보수', won(data.agreed)], ['내 부가세', data.vat === null ? '미입력' : won(data.vat)]);
        }
        const headline = amount === null ? '내 쪽 중개보수 상한' :
          data.vat === null ? '내 약정보수 · 부가세 별도' : '내 납부액 · 입력한 부가세 포함';
        return { headline, amount: amount ?? fee.maximum, details, breakdown };
      }
    }
  };

  let mode;
  picker.innerHTML = Object.entries(fields).map(([key, entry]) =>
    '<button type="button" data-property="' + key + '">' + entry.title + '</button>').join('');
  const quick = byId('property-quick');
  const quickButton = document.createElement('button');
  quickButton.type = 'button';
  quickButton.className = 'quick-button';
  quickButton.dataset.property = 'quick';
  quickButton.textContent = '모르면 빠른계산';
  let lastMode = 'transfer';
  byId('property').querySelector('h2').append(quickButton);
  quickButton.addEventListener('click', () => selectProperty(mode === 'quick' ? lastMode : 'quick'));

  function toggleField(id, visible) {
    const group = byId(id);
    if (!group) return;
    group.hidden = !visible;
    group.querySelectorAll('input, select').forEach(control => { control.disabled = !visible; });
  }

  function syncFields() {
    if (mode === 'transfer') {
      const qualified = form.elements.kind.value === 'qualified';
      form.elements.residence.parentElement.hidden = !qualified;
      form.elements.residence.disabled = !qualified;
      if (!qualified) form.elements.residence.value = '0';
      toggleField('property-allowance', form.elements.allowance.value === 'partial');
      form.elements.remaining.required = form.elements.allowance.value === 'partial';
    } else if (mode === 'acquisition') {
      toggleField('property-size', form.elements.kind.value !== 'commercial');
    } else {
      const deal = form.elements.deal.value;
      form.elements.amount.parentElement.firstChild.textContent = deal === 'sale' ? '매매가 (원)' : '보증금 (원)';
      form.elements.amount.required = deal !== 'monthly';
      toggleField('property-rent', deal === 'monthly');
    }
  }

  function clearResult() {
    delete reports.property;
    output.replaceChildren();
  }

  function selectProperty(next) {
    mode = next;
    [...picker.querySelectorAll('button'), quickButton].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.property === mode)));
    form.hidden = output.hidden = picker.hidden = mode === 'quick';
    if (mode !== 'quick') lastMode = mode;
    quickButton.textContent = mode === 'quick' ? '← 기존 화면' : '모르면 빠른계산';
    quick.hidden = mode !== 'quick';
    if (mode === 'quick') { window.showQuickProperty?.(); return; }
    const config = fields[mode];
    form.innerHTML = config.markup + '<button class="action full" type="submit">계산하기</button>';
    hint.textContent = config.hint;
    [...picker.querySelectorAll('button'), quickButton].forEach(button => button.setAttribute('aria-pressed', String(button.dataset.property === mode)));
    syncFields();
    clearResult();
  }

  picker.addEventListener('click', event => {
    const button = event.target.closest('[data-property]');
    if (button) selectProperty(button.dataset.property);
  });
  form.addEventListener('input', event => {
    if (event.target.matches('select')) syncFields();
    clearResult();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const config = fields[mode];
    try {
      const result = config.result(config.data());
      const breakdown = stats(result.breakdown);
      output.innerHTML = '<h3>' + result.headline + '</h3><p class="property-amount">' + won(result.amount) + '</p>' + breakdown;
      reports.property = {
        title: config.title + ' 계산서',
        basis: basisDate,
        details: stats(result.details),
        summary: stats([[result.headline, won(result.amount)]]) + breakdown,
        note: config.hint
      };
    } catch (error) {
      output.textContent = error.message;
    }
  });
  selectProperty('transfer');
  // 최근 계산(recent.js)에서 쓰는 창구
  window.propertyMode = () => mode;
  window.selectPropertyMode = selectProperty;
})();

// 질문형 한 화면: 쉬운 사실을 묻고, 세금 종류는 앱이 고른다.
(() => {
  const form = byId('property-quick-form');
  const output = byId('property-quick-result');
  const hint = byId('property-hint');
  const basisDate = '2026. 11. 26.';
  const percent = value => number.format(value) + '%';
  const state = {};

  const questions = [
    { id: 'deal', text: '무엇을 하세요?', choices: [['buy', '사요'], ['sell', '팔아요'], ['rent', '전·월세']] },
    { id: 'kind', text: '어떤 부동산인가요?', choices: [['home', '아파트·\u200b주택'], ['officetel', '오피스텔'], ['commercial', '상가·건물']] },
    { id: 'price', text: s => s.deal === 'buy' ? '얼마에 사요?' : '얼마에 팔아요?', money: true, when: s => s.deal !== 'rent' },
    { id: 'deposit', text: '보증금은 얼마예요?', money: true, when: s => s.deal === 'rent' },
    { id: 'monthly', text: '월세는 얼마예요?', sub: '전세면 비워 두세요', money: true, optional: true, when: s => s.deal === 'rent' },
    { id: 'count', text: '이 집을 사면 우리 세대 집이 몇 채가 되나요?', sub: '세대 = 함께 사는 가족 (배우자는 따로 살아도 포함). 분양권·입주권, 주거용 오피스텔도 1채로 세요',
      choices: [['1', '1채'], ['2', '2채'], ['3', '3채'], ['4', '4채 이상']], when: s => s.deal === 'buy' && s.kind === 'home' },
    { id: 'area', text: '이 집이 조정대상지역에 있나요?', sub: '모르면 [모름]: 세금이 많은 쪽으로 계산하고 적은 쪽도 함께 보여 줘요',
      choices: [['yes', '예'], ['no', '아니오'], ['unknown', '모름']], when: s => s.deal === 'buy' && s.kind === 'home' && ['2', '3'].includes(s.count) },
    { id: 'size', text: '전용면적이 85㎡(약 25평) 이하인가요?', sub: '도시가 아닌 읍·면의 주택은 100㎡ 이하면 [예]', choices: [['within', '예'], ['above', '아니오']],
      when: s => (s.deal === 'buy' && s.kind === 'home') || s.kind === 'officetel' },
    { id: 'facilities', text: '전용 부엌·화장실·욕실이 모두 있나요?', choices: [['yes', '예'], ['no', '아니오']], when: s => s.kind === 'officetel' && s.size === 'within' },
    { id: 'purchase', text: '얼마에 샀나요?', money: true, when: s => s.deal === 'sell' },
    { id: 'holding', text: '가진 지 몇 년 됐나요?', sub: '꽉 찬 햇수 (예: 4년 8개월 → 4)', years: true, when: s => s.deal === 'sell' },
    { id: 'owned', text: '팔 때 우리 세대 집은 몇 채인가요?', sub: '분양권·입주권, 주거용 오피스텔도 1채로 세요', choices: [['1', '이 집 1채뿐'], ['2', '2채 이상']], when: s => s.deal === 'sell' && s.kind === 'home' },
    { id: 'residence', text: '그 집에 몇 년 살았나요?', sub: '안 살았으면 0', years: true, when: s => s.deal === 'sell' && s.kind === 'home' && s.owned === '1' },
    { id: 'zone', text: '살 때 그곳이 조정대상지역이었나요?', sub: '2017년 8월 3일 이후에 산 경우만 해당. 그 전에 샀으면 [아니오]',
      choices: [['yes', '예'], ['no', '아니오'], ['unknown', '모름']],
      when: s => s.deal === 'sell' && s.kind === 'home' && s.owned === '1' && s.residence !== '' && s.residence !== undefined && Number(s.residence) < 2 },
    { id: 'costs', text: '살 때·팔 때 쓴 돈이 있나요?', sub: '취득세, 중개보수, 법무사비, 확장·새시 공사비 등 (모르면 비워 두세요)', money: true, optional: true, when: s => s.deal === 'sell' },
    { id: 'other', text: '올해 다른 부동산을 판 적 있나요?', choices: [['no', '없어요'], ['yes', '있어요']], when: s => s.deal === 'sell' }
  ];

  form.innerHTML = questions.map(q => {
    let control;
    if (q.choices) control = '<div class="pq-choices" style="grid-template-columns:repeat(' + (q.choices.length === 4 ? 2 : q.choices.length) + ',minmax(0,1fr))">' + q.choices.map(([value, label]) =>
      '<button type="button" data-q="' + q.id + '" data-v="' + value + '" aria-pressed="false">' + label + '</button>').join('') + '</div>';
    else if (q.money) control = '<input name="' + q.id + '" data-money inputmode="numeric" placeholder="' + (q.optional ? '0' : '') + '"><span class="amount-name"></span>';
    else control = '<input name="' + q.id + '" type="number" inputmode="numeric" min="0" max="120" step="1">';
    return '<div class="pq full" data-pq="' + q.id + '" hidden><p class="pq-text"></p>' +
      (q.sub ? '<p class="pq-sub">' + q.sub + '</p>' : '') + control + '</div>';
  }).join('');
  const quickHint = '개인 단독명의 기준 예상액이에요. 감면·특례, 일시적 2주택, 공동명의, 지분 거래는 계산하지 않아요. 큰 거래 전에는 세무사·중개사에게 확인하세요.';

  const yesNo = { yes: '해당', no: '해당 없음', unknown: '미확인' };
  const officialTerms = {
    deal: ['거래 구분', { buy: '매수 (취득)', sell: '매도 (양도)', rent: '임대차 (전세·월세)' }],
    kind: ['물건 종류', { home: '주택 (아파트 등)', officetel: '오피스텔', commercial: '상가·일반 건물' }],
    count: ['취득 후 세대 주택 수', { 1: '1주택', 2: '2주택', 3: '3주택', 4: '4주택 이상' }],
    area: ['조정대상지역 소재', yesNo],
    size: ['국민주택규모 (전용 85㎡) 이하', { within: '해당', above: '해당 없음' }],
    facilities: ['전용 입식 부엌·화장실·목욕시설', { yes: '구비', no: '미구비' }],
    holding: ['보유기간', null], owned: ['양도 시 세대 주택 수', { 1: '1주택', 2: '2주택 이상' }],
    residence: ['거주기간', null], zone: ['취득 당시 조정대상지역', yesNo],
    costs: ['필요경비', null], other: ['당해 연도 다른 부동산 양도', { no: '없음', yes: '있음' }]
  };
  const value = id => questions.find(q => q.id === id).money ? Number((state[id] || '').replaceAll(',', '')) : state[id];
  const answered = q => q.optional || (q.choices ? !!state[q.id] : q.money ? value(q.id) > 0 : state[q.id] !== undefined && state[q.id] !== '');

  function visibleQuestions() {
    const list = [];
    for (const q of questions) {
      if (q.when && !q.when(state)) continue;
      list.push(q);
      if (!answered(q)) break;
    }
    return list;
  }

  function sync() {
    const shown = visibleQuestions();
    questions.forEach(q => {
      const block = form.querySelector('[data-pq="' + q.id + '"]');
      const visible = shown.includes(q);
      block.hidden = !visible;
      if (visible) block.querySelector('.pq-text').textContent = typeof q.text === 'function' ? q.text(state) : q.text;
    });
    render(shown.every(answered) && shown.at(-1) === questions.filter(q => !q.when || q.when(state)).at(-1));
  }

  form.addEventListener('click', event => {
    const button = event.target.closest('[data-q]');
    if (!button) return;
    const id = button.dataset.q;
    if (['deal', 'kind'].includes(id) && state[id] !== button.dataset.v) {
      questions.slice(questions.findIndex(q => q.id === id) + 1).forEach(q => {
        delete state[q.id];
        form.querySelectorAll('[data-q="' + q.id + '"]').forEach(item => item.setAttribute('aria-pressed', 'false'));
        if (form.elements[q.id]) form.elements[q.id].value = '';
      });
    }
    state[id] = button.dataset.v;
    form.querySelectorAll('[data-q="' + button.dataset.q + '"]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    sync();
  });
  form.addEventListener('input', event => {
    if (!event.target.name) return;
    // '50만'처럼 쓴 금액은 숫자로 정리한 뒤 담는다 (한글 조합 중에는 건너뜀).
    if (event.target.matches('[data-money]') && !event.isComposing) formatMoney(event.target);
    state[event.target.name] = event.target.value;
    sync();
  });
  form.addEventListener('submit', event => event.preventDefault());

  const row = (label, amount) => [label, won(amount)];
  const box = (title, amount, lines, extra = '') => '<section class="pr-box"><h3>' + title + '</h3><p class="property-amount">' + won(amount) + '</p>' +
    (lines.length ? '<details><summary>자세히</summary>' + stats(lines) + '</details>' : '') + extra + '</section>';
  const warn = text => '<p class="pr-warn">' + text + '</p>';
  const info = text => '<p class="pr-info">' + text + '</p>';

  function acquisitionKind() {
    if (state.kind !== 'home') return { kind: 'commercial' };
    const count = Number(state.count);
    if (count === 1) return { kind: 'standard' };
    if (count >= 4) return { kind: '12' };
    const high = count === 2 ? '8' : '12';
    const low = count === 2 ? 'standard' : '8';
    if (state.area === 'yes') return { kind: high };
    if (state.area === 'no') return { kind: low };
    return { kind: high, alternative: low };
  }

  function brokerageFee() {
    const kind = state.kind === 'home' ? 'home' : state.kind === 'officetel' && state.size === 'within' && state.facilities === 'yes' ? 'officetel' : 'other';
    if (state.deal === 'rent') {
      const rent = value('monthly');
      return propertyRules.brokerage({ kind, deal: rent > 0 ? 'monthly' : 'lease', amount: value('deposit'), rent });
    }
    return propertyRules.brokerage({ kind, deal: 'sale', amount: value('price'), rent: 0 });
  }

  function render(complete) {
    delete reports.property;
    if (!complete) { output.innerHTML = state.deal ? '<p class="pr-wait">위 질문에 답하면 결과가 바로 나와요.</p>' : ''; return; }
    try {
      const fee = brokerageFee();
      const feeLines = [['요율 적용 금액', won(fee.basis)], ['상한요율', percent(fee.rate)]];
      if (fee.ceiling !== Infinity) feeLines.push(['한도', won(fee.ceiling)]);
      const feeBox = box('중개보수 (내 쪽 상한)', fee.maximum, feeLines, info('부가세 별도 · 이 금액 안에서 중개사와 협의해요'));
      let html = '';
      let summary = [];
      if (state.deal === 'rent') {
        html = feeBox;
        summary = [row('중개보수 상한 (부가세 별도)', fee.maximum), row('보증금', value('deposit')), row('월 차임', value('monthly')), row('거래금액 환산액', fee.basis), ['상한요율', percent(fee.rate)]];
      } else if (state.deal === 'buy') {
        const price = value('price');
        const choice = acquisitionKind();
        let lowTotal = null;
        const tax = propertyRules.acquisition({ kind: choice.kind, amount: price, size: state.size || 'above' });
        let notes = '';
        if (choice.alternative) {
          const low = propertyRules.acquisition({ kind: choice.alternative, amount: price, size: state.size || 'above' });
          notes += warn('조정대상지역이 아니면 ' + won(low.total) + '이에요. 확인해 보세요.');
          lowTotal = low.total;
        }
        if (state.kind === 'home' && Number(state.count) >= 2) notes += info('이사 때문에 잠깐 2채가 되는 일시적 2주택, 공시가격이 낮은 주택(1억 원 이하 등)은 세금이 더 낮을 수 있어요. 주택 수 판단이 애매하면 구청 세무과에 확인하세요.');
        html = '<section class="pr-total"><h3>사는 데 드는 돈</h3><p class="property-amount">' + won(price + tax.total + fee.maximum) + '</p><p class="pr-sub">집값 + 취득세 + 중개보수 상한 (부가세 별도)</p></section>' +
          box('취득세 합계', tax.total, [['적용 세율', percent(tax.rate)], row('취득세', tax.tax), row('지방교육세', tax.education), row('농어촌특별세', tax.rural)], notes) + feeBox;
        summary = [row('총 소요 예상액', price + tax.total + fee.maximum), row('취득가액', price), ['취득세율', percent(tax.rate)], row('취득세', tax.tax), row('지방교육세', tax.education), row('농어촌특별세', tax.rural), row('취득세 등 합계', tax.total), ...(lowTotal === null ? [] : [row('조정대상지역이 아닌 경우 취득세 등', lowTotal)]), row('중개보수 상한 (부가세 별도)', fee.maximum)];
      } else {
        const sale = value('price');
        const purchase = value('purchase');
        const holding = Number(state.holding);
        let taxBox;
        let taxTotal = null;
        let taxRows = [];
        const multi = state.kind === 'home' && state.owned === '2';
        if (holding < 2 || multi) {
          taxBox = '<section class="pr-box"><h3>양도소득세</h3>' + warn(holding < 2 ? '2년 미만 보유는 세율이 달라(60~70% 등) 이 앱에서 계산하지 않아요. 세무사에게 확인하세요.' :
            '집이 2채 이상이면 조정대상지역 집은 다주택 중과(세율 +20~30%p, 장기보유 공제 없음)가 적용될 수 있어 이 앱에서 계산하지 않아요. 세무사에게 확인하세요.') + '</section>';
        } else {
          const residence = state.kind === 'home' && state.owned === '1' ? Number(state.residence) : 0;
          if (residence > holding) throw new Error('살았던 햇수가 가진 햇수보다 길 수 없어요. 햇수를 확인해 주세요.');
          const single = state.kind === 'home' && state.owned === '1';
          const qualified = single && (residence >= 2 || state.zone === 'no');
          const data = { kind: qualified ? 'qualified' : 'standard', sale, purchase, costs: value('costs'), holding, residence,
            allowance: state.other === 'yes' ? 0 : 2500000 };
          const tax = propertyRules.transfer(data);
          taxTotal = tax.total;
          taxRows = [row('양도차익', tax.gain), row('과세대상 양도차익', tax.taxableGain), ['장기보유특별공제 (' + percent(tax.deductionRate) + ')', won(tax.deduction)], row('양도소득 기본공제', tax.usedAllowance), row('과세표준', tax.base), row('양도소득세', tax.national), row('개인지방소득세', tax.local)];
          let notes = '';
          if (qualified && sale <= 1200000000) notes += info('1세대 1주택 비과세예요 (12억 원 이하).');
          else if (qualified) notes += info('1세대 1주택 비과세 · 판 가격 중 12억 원을 넘는 비율만큼의 차익에만 세금이 붙어요.');
          if (single && residence < 2 && state.zone === 'yes') notes += info('조정대상지역에서 산 집은 2년 이상 살아야 비과세라, 기본세율로 계산했어요.');
          if (single && residence < 2 && state.zone === 'unknown') {
            const alt = propertyRules.transfer({ ...data, kind: 'qualified' });
            notes += warn('살 때 조정대상지역이 아니었다면 비과세가 되어 ' + won(alt.total) + '이에요. 확인해 보세요.');
          }
          if (state.kind === 'officetel') notes += info('주거용으로 쓰는 오피스텔은 주택으로 봐요. 그렇다면 [아파트·주택]으로 계산하세요.');
          if (state.other === 'yes') notes += info('올해 기본공제(250만 원)를 이미 썼다고 보고 계산했어요. 여러 건은 합쳐서 다시 정산해요.');
          taxBox = box('양도소득세 합계', tax.total, [row('양도차익', tax.gain), row('세금 붙는 차익', tax.taxableGain),
            ['장기보유 공제 (' + percent(tax.deductionRate) + ')', won(tax.deduction)], row('기본공제', tax.usedAllowance),
            row('세금 매기는 금액', tax.base), row('양도소득세', tax.national), row('지방소득세', tax.local)], notes);
        }
        const net = sale - (taxTotal ?? 0) - fee.maximum;
        html = '<section class="pr-total"><h3>손에 남는 돈</h3><p class="property-amount">' + won(net) + '</p><p class="pr-sub">' + (taxTotal === null ? '판 가격 − 중개보수 상한 (양도세 빠짐, 대출 갚기 전)' : '판 가격 − 양도세 − 중개보수 상한 (대출 갚기 전, 부가세 별도)') + '</p></section>' + taxBox + feeBox;
        summary = [row('예상 실수령액 (대출 상환 전)', net), row('양도가액', sale), row('취득가액', purchase), ...taxRows, taxTotal === null ? ['양도소득세', '산정 제외 (세무 상담 필요)'] : row('양도소득세 등 합계', taxTotal), row('중개보수 상한 (부가세 별도)', fee.maximum)];
      }
      output.innerHTML = html;
      const details = [];
      questions.forEach(q => {
        if (q.when && !q.when(state) || ['price', 'purchase', 'deposit', 'monthly'].includes(q.id)) return;
        const term = officialTerms[q.id];
        const answer = q.choices ? (term[1]?.[state[q.id]] ?? q.choices.find(([v]) => v === state[q.id])?.[1]) : q.money ? won(value(q.id)) : state[q.id] + '년';
        details.push([term[0], answer]);
      });
      const titles = { buy: '부동산 취득 비용 계산서', sell: '부동산 양도 비용 계산서', rent: '임대차 중개보수 계산서' };
      reports.property = { title: titles[state.deal], basis: basisDate, details: stats(details), summary: stats(summary), note: quickHint };
    } catch (error) {
      output.innerHTML = '<p class="pr-warn">' + error.message + '</p>';
    }
  }

  window.showQuickProperty = () => { hint.textContent = quickHint; sync(); };
  window.quickState = () => ({ ...state });
  window.restoreQuick = saved => {
    if (window.propertyMode() !== 'quick') window.selectPropertyMode('quick');
    for (const key of Object.keys(state)) delete state[key];
    form.querySelectorAll('[aria-pressed]').forEach(item => item.setAttribute('aria-pressed', 'false'));
    form.querySelectorAll('input').forEach(input => { input.value = ''; });
    for (const q of questions) {
      if (saved[q.id] === undefined) continue;
      const button = form.querySelector('[data-q="' + q.id + '"][data-v="' + saved[q.id] + '"]');
      if (button) { button.click(); continue; }
      const input = form.elements[q.id];
      input.value = saved[q.id];
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
})();
