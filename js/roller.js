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

  const newCheckState = () => ({ attr: null, adv: 0, beastAdv: false, cexp: {}, exp: {}, cards: {}, cond: {}, units: {}, extra: '' });

  function S() {
    const id = ch().id;
    if (!states[id]) {
      states[id] = {
        action: newCheckState(),
        reaction: newCheckState(),
        damage: { src: '', cards: {}, cond: {}, spellCond: {}, units: {}, extra: '' },
      };
    }
    return states[id];
  }

  /* ---------- 收集要擲的項目 ---------- */
  // 公式裡的屬性名稱（例如「1d6+力量」）換成角色目前的屬性值（變身時含野獸型態加值）
  const ATTR_RE = new RegExp(`([+\\-＋－−]?)\\s*(${ATTRS.map((a) => a.label).join('|')})`, 'g');
  function resolveFormula(formula) {
    const c = ch();
    const out = String(formula == null ? '' : formula).replace(ATTR_RE, (_, sign, label) => {
      const a = ATTRS.find((x) => x.label === label);
      const v = (/[-－−]/.test(sign) ? -1 : 1) * attrValue(c, a.key);
      return (v < 0 ? '-' : '+') + Math.abs(v);
    });
    return out.trim().replace(/^\+/, '');
  }

  function parseOrErr(formula, label, errors) {
    const r = Dice.parse(resolveFormula(formula));
    if (!r.ok) {
      errors.push(`${label} 的公式格式錯誤：${formula}`);
      return null;
    }
    return r.terms;
  }

  // 擲骰時可用的效果來源：有擲骰設定的角色特性（id 't0'…）與已準備的領域卡（id 'c0'…）。
  // 回傳 [{ card, i }]：card 是特性或領域卡本身（都有 name 與 fx），i 是狀態用的 id。
  function preparedCards(target) {
    const c = ch();
    const traits = c.traits.map((card, i) => ({ card, i: 't' + i })).filter(({ card }) => card.fx.target === target);
    const cards = c.domainCards.map((card, i) => ({ card, i: 'c' + i })).filter(({ card }) => card.prepared && card.fx.target === target);
    return [...traits, ...cards];
  }

  // 依狀態用的 id 找回特性或領域卡
  const sourceById = (id) => (id[0] === 't' ? ch().traits : ch().domainCards)[Number(id.slice(1))];

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

  // 倍數「× 階級」：'dice' 只乘第一組骰子，'all' 整個公式
  const tierNow = () => tierOfLevel(Number(ch().level) || 1);
  function scaleByTier(terms, card) {
    if (card.fx.scaleTier === 'dice') return Dice.scaleFirstDice(terms, tierNow());
    if (card.fx.scaleTier === 'all') return Dice.multiply(terms, tierNow());
    return terms;
  }

  // 公式旁的倍數說明
  const fxTag = (f) =>
    `${f.scaleProf ? '（×熟練值）' : ''}${f.scaleTier ? `（${f.scaleTier === 'dice' ? '骰子' : ''}×階級 ${tierNow()}）` : ''}${f.perUnit ? '（每單位）' : ''}`;

  // 依消耗資源決定次數的卡（fx.perUnit）：目前填的 N，至少 1。
  // 還沒填過 N、而且卡片設定為「預設帶入施法屬性值」時，N 先用施法屬性值。
  function unitCount(st, i, card) {
    const auto = card.fx.unitSpellcast ? spellcastInfo(card) : null;
    return Math.max(1, Math.floor(Number(st.units[i]) || (auto ? auto.value : 1)));
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
    const auto = card.fx.unitSpellcast ? spellcastInfo(card) : null;
    const hint = card.fx.unitSpellcast
      ? auto
        ? `<em class="unit-auto" title="自動帶入：施法屬性 ${esc(auto.label)} = ${auto.value}（可自行修改）">（${esc(auto.label)} ${auto.value}）</em>`
        : `<em class="unit-auto" title="找不到施法屬性：請先在表頭選好子職業，或子職業沒有施法屬性">（無施法屬性）</em>`
      : '';
    return `<span class="unit"><span>${esc(card.fx.unitLabel || '次數')}</span>×<input type="number" min="1" value="${unitCount(st, i, card)}" data-act="unit" data-i="${i}" aria-label="${esc(card.fx.unitLabel || '次數')}">${hint}</span>`;
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
        terms = scaleByTier(terms, card);
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
      const v = attrValue(c, st.attr);
      if (v !== 0) items.push({ label: beastAttrBonus(c, st.attr) ? `${a.label}（含野獸型態）` : a.label, terms: [flatTerm(v)] });
    }
    // 優勢：每個優勢擲一顆 d6，有好幾個優勢時全部一起擲、只取最高的加上去
    const beastAdv = st.beastAdv && currentBeast(c) ? 1 : 0; // 野獸型態的優勢行動：多 1 個優勢
    // 擲骰設定為「檢定優勢」的領域卡與角色特性：勾一個多 1 個優勢
    const advSrc = preparedCards('advantage').filter(({ i }) => st.cards[i]).length;
    const advN = Math.max(0, Math.min(9, (Math.floor(Number(st.adv)) || 0) + beastAdv + advSrc));
    if (advN) {
      const die = { kind: 'dice', sign: 1, count: advN, sides: 6 };
      if (advN > 1) die.keep = { mode: 'h', n: 1 };
      items.push({ label: advN > 1 ? `優勢 ×${advN}（取最高）` : '優勢', terms: [die] });
    }
    c.experiences.forEach((e, i) => {
      if (st.exp[i] && e.name.trim()) {
        const b = Number(e.bonus) || 0;
        if (b !== 0) items.push({ label: `經歷：${e.name}`, terms: [flatTerm(b)] });
      }
    });
    if (hasCompanion(c)) {
      c.companion.experiences.forEach((e, i) => {
        if (st.cexp[i] && String(e.name || '').trim()) {
          const b = Number(e.bonus) || 0;
          if (b !== 0) items.push({ label: `夥伴經歷：${e.name}`, terms: [flatTerm(b)] });
        }
      });
    }
    items.push(...cardItems('check', st, errors), ...extraItem(st, errors));
    return { items, errors };
  }

  // 屬性值：變身時加上野獸型態的屬性加值
  const attrValue = (c, key) => (Number(c.attrs[key].value) || 0) + beastAttrBonus(c, key);

  // 野獸型態的攻擊，當成一把武器（傷害骰數 = 熟練值）
  function beastSource(c) {
    const f = currentBeast(c);
    if (!f) return null;
    const a = f.attack;
    return { path: 'beast', slot: '野獸型態', weapon: { ...emptyWeapon(), name: `${f.name}攻擊`, trait: a.attr, range: a.range, damage: a.damage, type: a.type } };
  }

  // 夥伴攻擊：你的熟練值 × 夥伴的傷害骰
  function companionSource(c) {
    if (!hasCompanion(c)) return null;
    const cp = c.companion;
    const name = `${cp.name || '夥伴'}${cp.attack ? '・' + cp.attack : '攻擊'}`;
    return { path: 'companion', slot: '夥伴', weapon: { ...emptyWeapon(), name, range: cp.range, damage: cp.die } };
  }

  // 命令夥伴：施法屬性（子職 Ⅰ 或 Ⅱ 是馴獸師時用它的施法屬性）
  function companionSpellAttr(c) {
    const sub = [currentSubclass(c), currentSubclass2(c)].find((s) => s && classKey(s.name) === '馴獸師');
    return sub ? ATTRS.find((a) => a.label === sub.spellAttr) : undefined;
  }

  function companionPanel(st) {
    const c = ch();
    if (!hasCompanion(c)) return '';
    const cp = c.companion;
    const a = companionSpellAttr(c);
    const rows = cp.experiences
      .map((e, i) =>
        String(e.name || '').trim()
          ? optionRow(`<span>${esc(e.name)}</span><code>${signed(Number(e.bonus) || 0)}</code>`, !!st.cexp[i], `data-act="cexp" data-i="${i}"`)
          : ''
      )
      .join('');
    return `<div class="panel"><h2>🐺 命令夥伴${cp.name ? '：' + esc(cp.name) : ''}</h2>
      <p class="muted">以施法檢定代替動作檢定，可花 1 點希望加入一個適用的夥伴經歷。</p>
      ${a ? `<button type="button" class="add" data-act="cmd" data-key="${a.key}">使用施法屬性：${esc(a.label)}</button>` : ''}
      ${rows || '<p class="muted">夥伴還沒有填寫經歷</p>'}
    </div>`;
  }

  function damageSources() {
    const c = ch();
    const beast = beastSource(c);
    const list = [{ path: 'weapons.main', slot: '主手' }];
    if (c.weapons.main.hands !== '雙手') list.push({ path: 'weapons.off', slot: '副手' }); // 雙手武器不能配副手
    c.inventoryWeapons.forEach((_, i) => list.push({ path: `inventoryWeapons.${i}`, slot: `庫存 ${i + 1}` }));
    const weapons = list.map((s) => ({ ...s, weapon: getPath(c, s.path) }));
    const comp = companionSource(c);
    if (comp) weapons.splice(c.weapons.main.hands !== '雙手' ? 2 : 1, 0, comp); // 放在主手 / 副手之後
    return beast ? [beast, ...weapons] : weapons;
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
        // 武器的每一組骰子都乘以熟練值（例如鬥士打擊 d8+d6 → 熟練值 2 時 2d8+2d6），固定加值不乘
        items.push({ label: w.name || `${src.slot}武器`, terms: Dice.scaleAllDice(t, prof) });
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
    // 檢定時，「檢定優勢」的來源也列在這裡（勾選 = 優勢 +1）
    const rows = target === 'check' ? [...preparedCards('check'), ...preparedCards('advantage')] : preparedCards(target);
    if (!rows.length) return '<p class="muted">沒有可用的領域卡或角色特性（到角色卡設定領域卡的「準備」，以及領域卡或角色特性的「擲骰設定」）</p>';
    return rows
      .map(({ card, i }) => {
        const f = card.fx;
        if (f.target === 'advantage') {
          return optionRow(`<span>${esc(card.name || '領域卡')}</span><code>+1 優勢</code>`, !!st.cards[i], `data-act="card" data-i="${i}"`);
        }
        let h = optionRow(
          `<span>${esc(card.name || '領域卡')}</span><code>${esc(f.formula || '—')}${fxTag(f)}</code>${f.perUnit ? unitInput(st, i, card) : ''}`,
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
    const attrs = ATTRS.map((a) => {
      const bonus = beastAttrBonus(c, a.key);
      const title = bonus ? `title="${Number(c.attrs[a.key].value) || 0}(角色)+${bonus}(野獸型態)"` : '';
      return `<button type="button" class="attr-btn ${st.attr === a.key ? 'sel' : ''} ${bonus ? 'beast' : ''}" data-act="attr" data-key="${a.key}" ${title}>
        <span>${a.label}${bonus ? ' 🐾' : ''}</span><b>${signed(attrValue(c, a.key))}</b></button>`;
    }).join('');
    const beast = currentBeast(c);
    const beastRow = beast
      ? optionRow(
          `<span>🐾 優勢行動<small class="muted">　${esc(beast.advantages.join('、'))}</small></span><code>+1 優勢</code>`,
          !!st.beastAdv,
          'data-act="beastAdv"'
        )
      : '';
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
        <div class="opt ${Number(st.adv) > 0 ? 'on' : ''}">
          <span>優勢<small class="muted">　有幾個優勢就填幾個：擲同樣數量的 d6，取最高的加上去</small></span>
          <code>+d6</code>
          <span class="unit"><input type="number" min="0" max="9" value="${Number(st.adv) || 0}" data-act="advn" aria-label="優勢數量"></span>
        </div>
        ${beastRow}
        ${exps || '<p class="muted">角色卡尚未填寫經歷</p>'}
      </div>
      ${mode === 'action' ? companionPanel(st) : ''}
      <div class="panel"><h2>領域卡與角色特性</h2>${cardRows('check', st)}</div>
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
              <code>${esc(f.formula)}${fxTag(f)}</code>${f.perUnit ? unitInput(st, i, card) : ''}
              <button type="button" class="mini-roll" data-act="spell" data-i="${i}">擲</button></div>${cond}</div>`;
          })
          .join('')
      : '<p class="muted">沒有已準備的「獨立傷害」領域卡</p>';
    const beast = currentBeast(c);
    const src = damageSources().find((s) => s.path === st.src) || damageSources()[0];
    const weaponWarn = beast && src.path !== 'beast' ? '<p class="warn">⚠ 野獸型態下不能使用武器</p>' : '';
    const spellWarn = beast && spells.length ? '<p class="warn">⚠ 野獸型態下不能施放領域卡的法術</p>' : '';

    return `
      <div class="panel"><h2>${beast ? '攻擊' : '武器'}（熟練值 ${prof}）</h2>
        <select class="extra" data-act="src">${srcOpts}</select>${weaponWarn}
      </div>
      <div class="panel"><h2>領域卡與角色特性（加到傷害）</h2>${cardRows('damage', st)}</div>
      <div class="panel"><h2>額外加值</h2>
        <input type="text" class="extra" data-act="extra" value="${esc(st.extra)}" placeholder="例：+1d6 或 +2（種族/職業特性等）">
      </div>
      <div class="panel"><h2>公式預覽</h2><div class="formula" id="preview">${previewText('damage')}</div></div>
      <button type="button" class="roll-btn" data-act="roll">🎲 擲骰！</button>
      <div class="panel spells"><h2>獨立傷害（法術）</h2>${spellWarn}${spellHtml}</div>
      <div id="result"></div>`;
  }

  // 變身時在角色名稱旁提示目前的型態與攻擊
  function beastNote() {
    const f = currentBeast(ch());
    return f ? `　<span class="beast-note">🐾 ${esc(f.name)}（攻擊：${esc(`${f.attack.range} ${f.attack.attr} ${f.attack.damage}`)}）</span>` : '';
  }

  function render() {
    if (!ch()) return;
    const tabs = SUBS.map(
      (s) => `<button type="button" class="sub-btn ${s.k === sub ? 'active' : ''}" data-sub="${s.k}">${s.l}</button>`
    ).join('');
    root().innerHTML = `
      <p class="who">目前角色：<b>${esc(ch().name)}</b>　熟練值 ${Number(ch().proficiency) || 1}${beastNote()}</p>
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
    const card = sourceById(i);
    if (!card) return;
    const errors = [];
    const prof = Number(ch().proficiency) || 1;
    const items = [];
    let t = parseOrErr(card.fx.formula, card.name || '法術', errors);
    if (t && t.length) {
      if (card.fx.scaleProf) t = Dice.scaleFirstDice(t, prof);
      t = scaleByTier(t, card);
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

    if (act === 'cmd') {
      S()[sub].attr = btn.dataset.key;
      render();
      return;
    }
    if (act === 'attr') {
      const st = S()[sub];
      st.attr = st.attr === btn.dataset.key ? null : btn.dataset.key;
      root().querySelectorAll('.attr-btn').forEach((b) => b.classList.toggle('sel', b.dataset.key === st.attr));
      updatePreview();
    } else if (act === 'roll') {
      if (sub === 'damage') rollDamage();
      else rollCheck(sub);
    } else if (act === 'spell') {
      rollSpell(btn.dataset.i);
    }
  }

  function onInput(e) {
    const el = e.target;
    const act = el.dataset && el.dataset.act;
    if (!act || el.tagName === 'BUTTON') return;
    const st = S()[sub];
    const i = el.dataset.i;

    if (act === 'advn') {
      st.adv = Math.max(0, Math.min(9, Math.floor(Number(el.value)) || 0));
      const row = el.closest('.opt');
      if (row) row.classList.toggle('on', st.adv > 0);
    }
    else if (act === 'exp') st.exp[i] = el.checked;
    else if (act === 'beastAdv') st.beastAdv = el.checked;
    else if (act === 'cexp') st.cexp[i] = el.checked;
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
