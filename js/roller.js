/* 擲骰器：動作檢定 / 反應檢定 / 傷害計算。資料來自目前選擇的角色卡。 */
const Roller = (() => {
  const SUBS = [
    { k: 'action', l: '⚡ 動作檢定' },
    { k: 'reaction', l: '🛡 反應檢定' },
    { k: 'damage', l: '⚔ 傷害計算' },
  ];
  const states = {}; // 以角色 id 保存各分頁的勾選狀態
  let sub = 'action';

  const root = () => document.getElementById('roller');
  const ch = () => Store.active();
  const signed = (n) => (n >= 0 ? '+' : '') + n;
  const flatTerm = (n) => ({ kind: 'flat', sign: n < 0 ? -1 : 1, value: Math.abs(n) });

  const newCheckState = () => ({ attr: null, adv: false, exp: {}, cards: {}, cond: {}, units: {}, extra: '' });

  function S() {
    const id = ch().id;
    if (!states[id]) {
      states[id] = {
        action: newCheckState(),
        reaction: newCheckState(),
        damage: { src: 'weapons.main', cards: {}, cond: {}, spellCond: {}, units: {}, extra: '' },
      };
    }
    return states[id];
  }

  /* ---------- 收集要擲的項目 ---------- */
  function parseOrErr(formula, label, errors) {
    const r = Dice.parse(formula);
    if (!r.ok) {
      errors.push(`${label} 的公式格式錯誤：${formula}`);
      return null;
    }
    return r.terms;
  }

  function preparedCards(target) {
    return ch()
      .domainCards.map((card, i) => ({ card, i }))
      .filter(({ card }) => card.prepared && card.fx.target === target);
  }

  // 這張卡施法時使用的施法屬性：預設用子職業 Ⅰ 的施法屬性；
  // 卡片屬於兼職職業的領域、而不屬於主職業的領域時，改用子職業 Ⅱ 的施法屬性。
  // 找不到（沒選子職業，或子職業的施法屬性是「無」）時回傳 null。
  function spellcastInfo(card) {
    const c = ch();
    const inDomain = (cls) => !!cls && cls.domains.some((d) => classKey(d) === classKey(card.domain));
    const second = currentSubclass2(c);
    const sub = second && inDomain(findClass(c.class2)) && !inDomain(findClass(c.class1)) ? second : currentSubclass(c);
    const attr = sub && ATTRS.find((a) => a.label === sub.spellAttr);
    return attr ? { label: attr.label, value: Number(c.attrs[attr.key].value) || 0 } : null;
  }

  // 依消耗資源決定次數的卡（fx.perUnit）：目前填的 N，至少 1，有設上限就不超過上限。
  // 還沒填過 N、而且卡片設定為「預設帶入施法屬性值」時，N 先用施法屬性值。
  function unitCount(st, i, card) {
    const auto = card.fx.unitSpellcast ? spellcastInfo(card) : null;
    let n = Math.max(1, Math.floor(Number(st.units[i]) || (auto ? auto.value : 1)));
    const max = Math.floor(Number(card.fx.unitMax) || 0);
    if (max > 0) n = Math.min(n, max);
    return n;
  }

  // 公式乘以 N（unitDiceOnly 時只乘第一組骰子）；骰子總數超過上限時回報錯誤
  function scaleByUnit(terms, card, n, errors) {
    const diceOnly = !!card.fx.unitDiceOnly;
    const firstDice = terms.find((t) => t.kind === 'dice' && t.sign > 0);
    const tooMany = diceOnly ? firstDice && firstDice.count * n > Dice.MAX_COUNT : terms.some((t) => t.kind === 'dice' && t.count * n > Dice.MAX_COUNT);
    if (tooMany) {
      errors.push(`${card.name || '領域卡'}：骰子數量超過上限 ${Dice.MAX_COUNT}，請減少 ${card.fx.unitLabel || '次數'}`);
      return terms;
    }
    return diceOnly ? Dice.scaleFirstDice(terms, n) : Dice.multiply(terms, n);
  }

  const unitInput = (st, i, card) => {
    const max = Math.floor(Number(card.fx.unitMax) || 0);
    const auto = card.fx.unitSpellcast ? spellcastInfo(card) : null;
    const hint = card.fx.unitSpellcast
      ? auto
        ? `<em class="unit-auto" title="自動帶入：施法屬性 ${esc(auto.label)} = ${auto.value}（可自行修改）">（${esc(auto.label)} ${auto.value}）</em>`
        : `<em class="unit-auto" title="找不到施法屬性：請先在表頭選好子職業，或子職業沒有施法屬性">（無施法屬性）</em>`
      : '';
    return `<span class="unit"><span>${esc(card.fx.unitLabel || '次數')}</span>×<input type="number" min="1" ${max > 0 ? `max="${max}"` : ''} value="${unitCount(st, i, card)}" data-act="unit" data-i="${i}" aria-label="${esc(card.fx.unitLabel || '次數')}">${hint}</span>`;
  };

  function cardItems(target, st, errors) {
    const prof = Number(ch().proficiency) || 1;
    const items = [];
    preparedCards(target).forEach(({ card, i }) => {
      if (!st.cards[i]) return;
      const name = card.name || '領域卡';
      let terms = parseOrErr(card.fx.formula, name, errors);
      if (terms && terms.length) {
        if (card.fx.scaleProf) terms = Dice.scaleFirstDice(terms, prof);
        let label = name;
        if (card.fx.perUnit) {
          const n = unitCount(st, i, card);
          terms = scaleByUnit(terms, card, n, errors);
          label = `${name}（×${n}${card.fx.unitLabel ? ' ' + card.fx.unitLabel : ''}）`;
        }
        items.push({ label, terms });
      }
      if (st.cond[i] && card.fx.condFormula) {
        const ct = parseOrErr(card.fx.condFormula, `${name}（條件）`, errors);
        if (ct && ct.length) items.push({ label: `${name}（${card.fx.condLabel || '條件'}）`, terms: ct });
      }
    });
    return items;
  }

  function extraItem(st, errors) {
    if (!st.extra.trim()) return [];
    const t = parseOrErr(st.extra, '額外加值', errors);
    return t && t.length ? [{ label: '額外加值', terms: t }] : [];
  }

  function collectCheck(mode) {
    const c = ch();
    const st = S()[mode];
    const errors = [];
    const items = [];

    if (st.attr) {
      const a = ATTRS.find((x) => x.key === st.attr);
      const v = Number(c.attrs[st.attr].value) || 0;
      if (v !== 0) items.push({ label: `${a.label}`, terms: [flatTerm(v)] });
    }
    if (st.adv) items.push({ label: '優勢', terms: Dice.parse('d6').terms });
    c.experiences.forEach((e, i) => {
      if (st.exp[i] && e.name.trim()) {
        const b = Number(e.bonus) || 0;
        if (b !== 0) items.push({ label: `經歷：${e.name}`, terms: [flatTerm(b)] });
      }
    });
    items.push(...cardItems('check', st, errors), ...extraItem(st, errors));
    return { items, errors };
  }

  function damageSources() {
    const c = ch();
    const list = [{ path: 'weapons.main', slot: '主手' }];
    if (c.weapons.main.hands !== '雙手') list.push({ path: 'weapons.off', slot: '副手' }); // 雙手武器不能配副手
    c.inventoryWeapons.forEach((_, i) => list.push({ path: `inventoryWeapons.${i}`, slot: `庫存 ${i + 1}` }));
    return list.map((s) => ({ ...s, weapon: getPath(c, s.path) }));
  }

  function collectDamage() {
    const c = ch();
    const st = S().damage;
    const prof = Number(c.proficiency) || 1;
    const errors = [];
    const items = [];

    const src = damageSources().find((s) => s.path === st.src) || damageSources()[0];
    const w = src.weapon;
    if (!w.damage.trim()) {
      errors.push(`${src.slot}武器沒有填寫傷害數值`);
    } else {
      const t = parseOrErr(w.damage, w.name || `${src.slot}武器`, errors);
      if (t && t.length) {
        items.push({ label: w.name || `${src.slot}武器`, terms: Dice.scaleFirstDice(t, prof) });
      }
    }
    items.push(...cardItems('damage', st, errors), ...extraItem(st, errors));
    return { items, errors };
  }

  /* ---------- 畫面 ---------- */
  function previewText(mode) {
    const { items, errors } = mode === 'damage' ? collectDamage() : collectCheck(mode);
    if (errors.length) return `<span class="err">${esc(errors[0])}</span>`;
    const parts = items.map((it) => Dice.format(it.terms));
    const all = mode === 'damage' ? parts : ['2d12', ...parts];
    if (!all.length) return '—';
    // 第一項不帶符號，其餘以 " + " 或 " - " 連接
    return esc(
      all.map((p, i) => (i === 0 ? p : p.startsWith('-') ? `- ${p.slice(1)}` : `+ ${p}`)).join(' ')
    );
  }

  function optionRow(inner, checked, data) {
    return `<label class="opt ${checked ? 'on' : ''}"><input type="checkbox" ${data} ${checked ? 'checked' : ''}>${inner}</label>`;
  }

  function cardRows(target, st) {
    const rows = preparedCards(target);
    if (!rows.length) return '<p class="muted">沒有已準備且作用於此的領域卡（到角色卡的領域卡區設定「準備」與「擲骰設定」）</p>';
    return rows
      .map(({ card, i }) => {
        const f = card.fx;
        let h = optionRow(
          `<span>${esc(card.name || '領域卡')}</span><code>${esc(f.formula || '—')}${f.scaleProf ? '（×熟練值）' : ''}${f.perUnit ? '（每單位）' : ''}</code>${f.perUnit ? unitInput(st, i, card) : ''}`,
          !!st.cards[i],
          `data-act="card" data-i="${i}"`
        );
        if (f.condFormula) {
          h += optionRow(
            `<span>＋ ${esc(f.condLabel || '條件成立')}</span><code>+${esc(f.condFormula)}</code>`,
            !!st.cond[i],
            `data-act="cond" data-i="${i}"`
          );
        }
        return h;
      })
      .join('');
  }

  function checkPanel(mode) {
    const c = ch();
    const st = S()[mode];
    const attrs = ATTRS.map(
      (a) => `<button type="button" class="attr-btn ${st.attr === a.key ? 'sel' : ''}" data-act="attr" data-key="${a.key}">
        <span>${a.label}</span><b>${signed(Number(c.attrs[a.key].value) || 0)}</b></button>`
    ).join('');
    const exps = c.experiences
      .map((e, i) =>
        e.name.trim()
          ? optionRow(`<span>${esc(e.name)}</span><code>${signed(Number(e.bonus) || 0)}</code>`, !!st.exp[i], `data-act="exp" data-i="${i}"`)
          : ''
      )
      .join('');

    return `
      <div class="panel"><h2>使用屬性</h2><div class="attr-grid">${attrs}</div></div>
      <div class="panel"><h2>加值選項</h2>
        ${optionRow('<span>優勢</span><code>+d6</code>', st.adv, 'data-act="adv"')}
        ${exps || '<p class="muted">角色卡尚未填寫經歷</p>'}
      </div>
      <div class="panel"><h2>領域卡（已準備）</h2>${cardRows('check', st)}</div>
      <div class="panel"><h2>額外加值</h2>
        <input type="text" class="extra" data-act="extra" value="${esc(st.extra)}" placeholder="例：+1d6 或 -2（其他來源的加值）">
      </div>
      <div class="panel"><h2>公式預覽</h2><div class="formula" id="preview">${previewText(mode)}</div></div>
      <button type="button" class="roll-btn" data-act="roll">🎲 擲骰！</button>
      <div id="result"></div>`;
  }

  function damagePanel() {
    const c = ch();
    const st = S().damage;
    const prof = Number(c.proficiency) || 1;
    const srcOpts = damageSources()
      .map((s) => {
        const label = `${s.slot}：${s.weapon.name || '(未命名)'} ${s.weapon.damage || ''}`;
        return `<option value="${s.path}" ${st.src === s.path ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('');

    const spells = preparedCards('standalone');
    const spellHtml = spells.length
      ? spells
          .map(({ card, i }) => {
            const f = card.fx;
            const cond = f.condFormula
              ? optionRow(`<span>＋ ${esc(f.condLabel || '條件成立')}</span><code>+${esc(f.condFormula)}</code>`, !!st.spellCond[i], `data-act="spellCond" data-i="${i}"`)
              : '';
            return `<div class="spell"><div class="spell-head"><b>${esc(card.name || '法術')}</b>
              <code>${esc(f.formula)}${f.scaleProf ? '（×熟練值）' : ''}${f.perUnit ? '（每單位）' : ''}</code>${f.perUnit ? unitInput(st, i, card) : ''}
              <button type="button" class="mini-roll" data-act="spell" data-i="${i}">擲</button></div>${cond}</div>`;
          })
          .join('')
      : '<p class="muted">沒有已準備的「獨立傷害」領域卡</p>';

    return `
      <div class="panel"><h2>武器（熟練值 ${prof}）</h2>
        <select class="extra" data-act="src">${srcOpts}</select>
      </div>
      <div class="panel"><h2>領域卡（已準備，加到傷害）</h2>${cardRows('damage', st)}</div>
      <div class="panel"><h2>額外加值</h2>
        <input type="text" class="extra" data-act="extra" value="${esc(st.extra)}" placeholder="例：+1d6 或 +2（種族/職業特性等）">
      </div>
      <div class="panel"><h2>公式預覽</h2><div class="formula" id="preview">${previewText('damage')}</div></div>
      <button type="button" class="roll-btn" data-act="roll">🎲 擲骰！</button>
      <div class="panel spells"><h2>獨立傷害（法術）</h2>${spellHtml}</div>
      <div id="result"></div>`;
  }

  function render() {
    if (!ch()) return;
    const tabs = SUBS.map(
      (s) => `<button type="button" class="sub-btn ${s.k === sub ? 'active' : ''}" data-sub="${s.k}">${s.l}</button>`
    ).join('');
    root().innerHTML = `
      <p class="who">目前角色：<b>${esc(ch().name)}</b>　熟練值 ${Number(ch().proficiency) || 1}</p>
      <div class="subtabs">${tabs}</div>
      ${sub === 'damage' ? damagePanel() : checkPanel(sub)}`;
  }

  function updatePreview() {
    const el = root().querySelector('#preview');
    if (el) el.innerHTML = previewText(sub);
  }

  /* ---------- 擲骰與結果 ---------- */
  function rollItems(items) {
    let total = 0;
    const plain = []; // 純文字版本，送到共享房間用
    const lines = items.map((it) => {
      const r = Dice.rollTerms(it.terms);
      total += r.total;
      plain.push(`${it.label}：${r.text}`);
      return `<div><span class="lbl">${esc(it.label)}</span> ${esc(r.text)}</div>`;
    });
    return { total, lines, plain };
  }

  function showErrors(errors) {
    root().querySelector('#result').innerHTML = `<div class="result err">${errors.map(esc).join('<br>')}</div>`;
  }

  function rollCheck(mode) {
    const { items, errors } = collectCheck(mode);
    if (errors.length) return showErrors(errors);

    const hope = Dice.roll(12);
    const fear = Dice.roll(12);
    const r = rollItems(items);
    const total = hope + fear + r.total;

    let verdict;
    if (hope === fear) verdict = '<div class="verdict crit">✨ 關鍵成功！（Critical）</div>';
    else if (hope > fear) verdict = '<div class="verdict hope">☀ 帶著希望</div>';
    else verdict = '<div class="verdict fear">🌑 帶著恐懼</div>';
    const attr = ATTRS.find((a) => a.key === S()[mode].attr);
    Room.publish({
      kind: 'check',
      title: `${mode === 'action' ? '動作檢定' : '反應檢定'}${attr ? '・' + attr.label : ''}`,
      lines: [`希望骰：${hope}`, `恐懼骰：${fear}`, ...r.plain],
      total,
      dice: { hope, fear, hs: 12, fs: 12, v: hope === fear ? 'crit' : hope > fear ? 'hope' : 'fear' },
    });

    root().querySelector('#result').innerHTML = `
      <div class="result">
        <div class="dh">
          <div class="die hope"><small>☀ 希望骰</small><b>${hope}</b></div>
          <div class="die fear"><small>🌑 恐懼骰</small><b>${fear}</b></div>
        </div>
        ${verdict}
        <div class="breakdown">${r.lines.join('')}</div>
        <div class="total">${total}</div><small class="muted">總計</small>
      </div>`;
  }

  function rollDamage() {
    const { items, errors } = collectDamage();
    if (errors.length) return showErrors(errors);
    const r = rollItems(items);
    Room.publish({ kind: 'damage', title: `傷害・${items[0] ? items[0].label : '武器'}`, lines: r.plain, total: r.total });
    root().querySelector('#result').innerHTML = `
      <div class="result">
        <div class="breakdown">${r.lines.join('')}</div>
        <div class="total">${r.total}</div><small class="muted">總傷害</small>
      </div>`;
  }

  function rollSpell(i) {
    const st = S().damage;
    const card = ch().domainCards[i];
    if (!card) return;
    const errors = [];
    const prof = Number(ch().proficiency) || 1;
    const items = [];
    let t = parseOrErr(card.fx.formula, card.name || '法術', errors);
    if (t && t.length) {
      if (card.fx.scaleProf) t = Dice.scaleFirstDice(t, prof);
      let label = card.name || '法術';
      if (card.fx.perUnit) {
        const n = unitCount(st, i, card);
        t = scaleByUnit(t, card, n, errors);
        label = `${label}（×${n}${card.fx.unitLabel ? ' ' + card.fx.unitLabel : ''}）`;
      }
      items.push({ label, terms: t });
    } else if (!errors.length) {
      errors.push(`${card.name || '法術'} 沒有填寫公式`);
    }
    if (st.spellCond[i] && card.fx.condFormula) {
      const ct = parseOrErr(card.fx.condFormula, `${card.name}（條件）`, errors);
      if (ct && ct.length) items.push({ label: `${card.name}（${card.fx.condLabel || '條件'}）`, terms: ct });
    }
    if (errors.length) return showErrors(errors);
    const r = rollItems(items);
    Room.publish({ kind: 'spell', title: `法術・${card.name || '法術'}`, lines: r.plain, total: r.total });
    root().querySelector('#result').innerHTML = `
      <div class="result">
        <div class="result-title">${esc(card.name || '法術')}</div>
        <div class="breakdown">${r.lines.join('')}</div>
        <div class="total">${r.total}</div><small class="muted">法術傷害</small>
      </div>`;
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const subBtn = e.target.closest('[data-sub]');
    if (subBtn) {
      sub = subBtn.dataset.sub;
      render();
      return;
    }
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'attr') {
      const st = S()[sub];
      st.attr = st.attr === btn.dataset.key ? null : btn.dataset.key;
      root().querySelectorAll('.attr-btn').forEach((b) => b.classList.toggle('sel', b.dataset.key === st.attr));
      updatePreview();
    } else if (act === 'roll') {
      if (sub === 'damage') rollDamage();
      else rollCheck(sub);
    } else if (act === 'spell') {
      rollSpell(Number(btn.dataset.i));
    }
  }

  function onInput(e) {
    const el = e.target;
    const act = el.dataset && el.dataset.act;
    if (!act || el.tagName === 'BUTTON') return;
    const st = S()[sub];
    const i = el.dataset.i;

    if (act === 'adv') st.adv = el.checked;
    else if (act === 'exp') st.exp[i] = el.checked;
    else if (act === 'card') st.cards[i] = el.checked;
    else if (act === 'cond') st.cond[i] = el.checked;
    else if (act === 'spellCond') st.spellCond[i] = el.checked;
    else if (act === 'extra') st.extra = el.value;
    else if (act === 'src') st.src = el.value;
    else if (act === 'unit') st.units[i] = el.value;
    else return;

    const label = el.closest('.opt');
    if (label && el.type === 'checkbox') label.classList.toggle('on', el.checked);
    updatePreview();
  }

  function init() {
    root().addEventListener('click', onClick);
    root().addEventListener('input', onInput);
  }

  return { init, render };
})();
