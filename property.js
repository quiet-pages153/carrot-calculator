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
  const basisDate = '2026.11.26 확인 기준';
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
    const config = fields[mode];
    form.innerHTML = config.markup + '<button class="action full" type="submit">계산하기</button>';
    hint.textContent = config.hint;
    picker.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.property === mode)));
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
        details: stats([['요율 확인 기준일', basisDate], ...result.details]),
        summary: stats([[result.headline, won(result.amount)]]) + breakdown,
        note: config.hint
      };
    } catch (error) {
      output.textContent = error.message;
    }
  });
  selectProperty('transfer');
})();
