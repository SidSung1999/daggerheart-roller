/* 角色卡畫面 */
const Sheet = (() => {
  const root = () => document.getElementById('sheet');
  const ch = () => Store.active();

  // 勾選格軌道：已標記數量欄位、上限來源（stat 見 stat-bonus.js；fixed 為固定格數）、上限範圍
  const TRACKS = {
    hp: { marked: 'hpMarked', stat: 'hp', min: 1, cap: 12, label: 'HP' },
    stress: { marked: 'stressMarked', stat: 'stress', min: 1, cap: 12, label: '壓力' },
    hope: { marked: 'hopeMarked', fixed: 6, label: '希望' },
    armor: { marked: 'armorMarked', stat: 'armor', min: 0, cap: 12, label: '護甲' },
  };

  const WEAPON_FIELDS = ['name', 'trait', 'features', 'range', 'damage', 'type', 'hands'];

  /* ---------- 小元件 ---------- */
  const val = (path) => {
    const v = getPath(ch(), path);
    return v == null ? '' : v;
  };
  const text = (path, ph = '', extra = '') =>
    `<input type="text" data-bind="${path}" value="${esc(val(path))}" placeholder="${esc(ph)}" ${extra}>`;
  const num = (path, extra = '') =>
    `<input type="number" data-bind="${path}" data-type="number" value="${esc(val(path))}" ${extra}>`;
  const area = (path, rows = 3, ph = '') =>
    `<textarea data-bind="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(val(path))}</textarea>`;
  // 顯示「基礎值 + 種族加成」的合計；輸入時反推基礎值存回去，滑鼠移上去顯示分項（title）
  const totalNum = (stat, extra = '') => {
    const c = ch();
    return `<input type="number" data-bind="${STAT_FIELDS[stat]}" data-type="number" data-total="${stat}" value="${statTotal(c, stat)}" title="${esc(statTitle(c, stat))}" ${extra}>`;
  };

  // 就地更新所有合計欄位（例如熟練值改變時，加拉帕的傷害閾值加成會跟著變）
  function refreshTotals() {
    root().querySelectorAll('[data-total]').forEach((el) => {
      const stat = el.dataset.total;
      if (document.activeElement !== el) el.value = statTotal(ch(), stat);
      el.title = statTitle(ch(), stat);
    });
    Object.keys(TRACKS).forEach((n) => TRACKS[n].stat && renderTrack(n));
  }

  const check = (path, extra = '') =>
    `<input type="checkbox" data-bind="${path}" data-type="bool" ${getPath(ch(), path) ? 'checked' : ''} ${extra}>`;
  const field = (label, inner, cls = '') => `<label class="hf ${cls}"><span>${label}</span>${inner}</label>`;
  const section = (title, inner, cls = '') =>
    `<section class="panel ${cls}"><h2>${title}</h2>${inner}</section>`;

  /* ---------- 勾選格 ---------- */
  function trackMax(name) {
    const t = TRACKS[name];
    if (t.fixed) return t.fixed;
    const n = Math.floor(statTotal(ch(), t.stat)); // 基礎值加上種族加成
    return Math.max(t.min, Math.min(t.cap, n));
  }

  function boxesInner(name) {
    const t = TRACKS[name];
    const max = trackMax(name);
    const marked = Math.min(Number(ch()[t.marked]) || 0, max);
    let h = '';
    for (let i = 0; i < max; i++) {
      h += `<button type="button" class="box ${i < marked ? 'on' : ''}" data-track="${name}" data-i="${i}" aria-label="${t.label} ${i + 1}"></button>`;
    }
    return h;
  }

  const boxes = (name) => `<div class="boxes" data-boxes="${name}">${boxesInner(name)}</div>`;

  function renderTrack(name) {
    const el = root().querySelector(`[data-boxes="${name}"]`);
    if (el) el.innerHTML = boxesInner(name);
  }

  /* ---------- 武器 ---------- */
  // 主手只提示單手/雙手武器，副手只提示副手類武器，庫存提示全部
  const WEAPON_LISTS = { 'weapons.main': 'mainWeaponList', 'weapons.off': 'offWeaponList' };

  // 版面比照領域卡：上排是名稱、屬性、射程、傷害、類型，特徵（描述）放在下一排。
  // delPath 有值時，右上角多一個刪除按鈕（庫存武器用）。
  function weaponRow(prefix, delPath = '') {
    const del = delPath ? `<button type="button" class="x" data-del="${delPath}" aria-label="刪除武器">✕</button>` : '';
    return `<div class="wcard">
      <div class="wgrid ${delPath ? 'has-del' : ''}">
        <input list="${WEAPON_LISTS[prefix] || 'weaponList'}" data-bind="${prefix}.name" data-weapon="${prefix}" value="${esc(val(prefix + '.name'))}" placeholder="武器名稱" title="武器名稱">
        ${text(prefix + '.trait', '屬性', 'title="屬性"')}
        ${text(prefix + '.range', '射程', 'title="射程"')}
        ${text(prefix + '.damage', '傷害 例：d8+4', 'title="傷害數值（骰數會乘以熟練值）"')}
        ${text(prefix + '.type', '類型', 'title="傷害類型"')}
        ${del}
      </div>
      ${area(prefix + '.features', 2, '特徵')}
    </div>`;
  }

  /* ---------- 領域卡 ---------- */
  function preparedCount() {
    return ch().domainCards.filter((x) => x.prepared).length;
  }

  /* ---------- 領域卡庫（從全部卡片中挑選加入） ---------- */
  const LIB_LIMIT = 60;
  const lib = { open: false, domain: 'mine', maxLevel: null, q: '' }; // maxLevel 為 null 時跟著角色等級

  const domainKey = (d) => String(d).split(/\s+/)[0]; // 「午夜 Midnight」 -> 「午夜」

  function libMatches() {
    const c = ch();
    const maxLv = lib.maxLevel == null ? Number(c.level) || 1 : lib.maxLevel;
    const q = lib.q.trim().toLowerCase();
    // 兼職時，職業 Ⅱ 的兩個領域也列入
    const mine = [...c.domains, ...c.domains2].filter((d) => d && d.trim());
    return DOMAIN_CARDS.map((card, idx) => ({ card, idx })).filter(({ card }) => {
      if (card.level > maxLv) return false;
      if (lib.domain === 'mine') {
        if (!mine.some((d) => d.includes(domainKey(card.domain)))) return false;
      } else if (lib.domain !== 'all' && card.domain !== lib.domain) {
        return false;
      }
      return !q || `${card.name} ${card.orig || ''} ${card.desc}`.toLowerCase().includes(q);
    });
  }

  function libResultsHtml() {
    const c = ch();
    if (lib.domain === 'mine' && !c.domains.some((d) => d && d.trim())) {
      return '<p class="muted">尚未填寫「領域」欄位。請先在右側填入領域，或把篩選改成「全部領域」。</p>';
    }
    const found = libMatches();
    if (!found.length) return '<p class="muted">沒有符合條件的卡片</p>';
    const rows = found.slice(0, LIB_LIMIT).map(({ card, idx }) => {
      const has = c.domainCards.some((x) => x.name === card.name && x.domain === card.domain);
      return `<details class="lib-item">
        <summary>
          <span class="lib-name">${esc(card.name)}</span>
          <span class="lib-meta">${esc(card.domain)}・Lv${card.level}・${esc(card.type)}・喚回 ${card.recall}</span>
          <button type="button" class="lib-add" data-libadd="${idx}" ${has ? 'disabled' : ''}>${has ? '已加入' : '加入'}</button>
        </summary>
        <p>${esc(card.desc)}</p>
      </details>`;
    });
    const more = found.length > LIB_LIMIT ? `<p class="muted">共 ${found.length} 張，僅顯示前 ${LIB_LIMIT} 張，請縮小篩選條件</p>` : `<p class="muted">共 ${found.length} 張</p>`;
    return rows.join('') + more;
  }

  function libHtml() {
    const c = ch();
    const domains = [...new Set(DOMAIN_CARDS.map((x) => x.domain))];
    const opts = [
      `<option value="mine" ${lib.domain === 'mine' ? 'selected' : ''}>我的領域</option>`,
      `<option value="all" ${lib.domain === 'all' ? 'selected' : ''}>全部領域</option>`,
      ...domains.map((d) => `<option value="${esc(d)}" ${lib.domain === d ? 'selected' : ''}>${esc(d)}</option>`),
    ].join('');
    const lv = lib.maxLevel == null ? Number(c.level) || 1 : lib.maxLevel;
    return `<details class="library" id="domainLib" ${lib.open ? 'open' : ''}>
      <summary>📚 從卡片庫選擇（共 ${DOMAIN_CARDS.length} 張）</summary>
      <div class="lib-filters">
        <select data-lib="domain">${opts}</select>
        <label>等級上限<input type="number" data-lib="level" min="1" max="10" value="${lv}"></label>
        <input type="text" data-lib="q" value="${esc(lib.q)}" placeholder="搜尋名稱或描述">
      </div>
      <div id="libResults">${libResultsHtml()}</div>
    </details>`;
  }

  function addFromLibrary(idx) {
    const src = DOMAIN_CARDS[idx];
    if (!src) return;
    const c = ch();
    if (c.domainCards.some((x) => x.name === src.name && x.domain === src.domain)) return;
    const card = TEMPLATES.domainCards();
    Object.assign(card, { domain: src.domain, type: src.type, recall: src.recall, name: src.name, desc: src.desc });
    Object.assign(card.fx, DOMAIN_CARD_FX[`${src.domain}|${src.name}`] || {});
    c.domainCards.push(card);
    Store.save();
    render();
    toast(`已加入「${src.name}」`);
  }

  function domainCardRow(card, i) {
    const p = `domainCards.${i}`;
    const target = EFFECT_TARGETS.find((t) => t.value === card.fx.target);
    const badge = card.fx.target !== 'none' ? `<em class="badge">${esc(target ? target.label : '')}</em>` : '';
    const opts = EFFECT_TARGETS.map(
      (t) => `<option value="${t.value}" ${card.fx.target === t.value ? 'selected' : ''}>${t.label}</option>`
    ).join('');
    return `<div class="dcard ${card.prepared ? 'prepared' : ''}">
      <div class="dcard-top">
        <label class="prep" title="準備（最多 ${MAX_PREPARED} 張）">${check(p + '.prepared', 'data-prep')}<span>準備</span></label>
        ${text(p + '.name', '卡片名稱')}
        ${text(p + '.domain', '領域', 'list="domainList"')}
        ${text(p + '.type', '類別')}
        <label class="recall">喚回 ${num(p + '.recall', 'min="0"')}</label>
        <button type="button" class="x" data-del="domainCards.${i}" aria-label="刪除領域卡">✕</button>
      </div>
      ${area(p + '.desc', 3, '卡片描述')}
      <details class="fx">
        <summary>擲骰設定 ${badge}</summary>
        <div class="fx-grid">
          <label>作用<select data-bind="${p}.fx.target">${opts}</select></label>
          <label>公式<input type="text" data-bind="${p}.fx.formula" value="${esc(card.fx.formula)}" placeholder="例：d8+2 或 d12"></label>
          <label class="inline">${check(p + '.fx.scaleProf')} 第一組骰子的數量乘以熟練值</label>
          <label>條件說明<input type="text" data-bind="${p}.fx.condLabel" value="${esc(card.fx.condLabel)}" placeholder="例：目標處於脆弱"></label>
          <label>條件成立時追加<input type="text" data-bind="${p}.fx.condFormula" value="${esc(card.fx.condFormula)}" placeholder="例：1d8"></label>
        </div>
      </details>
    </div>`;
  }

  /* ---------- 職業 / 子職 ---------- */
  // 用下拉選單而不是輸入框＋清單：瀏覽器的輸入清單會依已填的文字過濾選項，
  // 欄位有值時只剩一個選項，看起來像「選項沒有跟著職業變」。
  const CUSTOM = '__custom__';
  const opt = (value, label, selected) =>
    `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;

  function classSelect(slot, exclude) {
    const current = String(ch()[slot] || '').trim();
    const known = findClass(current);
    let h = opt('', '— 未選擇 —', !current);
    CLASSES.filter((c) => !exclude || c.name !== exclude.name).forEach((c) => {
      h += opt(c.name, c.name, known && known.name === c.name);
    });
    if (current && !known) h += opt(current, `${current}（自訂）`, true);
    return `<select data-pick="${slot}">${h}${opt(CUSTOM, '自訂…', false)}</select>`;
  }

  // 種族、背景下拉選單：做法與職業相同
  function originSelect(slot, list, find) {
    const current = String(ch()[slot] || '').trim();
    const known = find(current);
    let h = opt('', '— 未選擇 —', !current);
    list.forEach((x) => (h += opt(x.name, x.name, known && known.name === x.name)));
    if (current && !known) h += opt(current, `${current}（自訂）`, true);
    return `<select data-pick="${slot}">${h}${opt(CUSTOM, '自訂…', false)}</select>`;
  }

  // 選了「混合血統」才出現：特性 1 取自一個種族、特性 2 取自另一個種族
  function mixRow() {
    const c = ch();
    const mixed = findAncestry(c.ancestry);
    if (!mixed || !mixed.mixed) return '';
    const sel = (i, label) => {
      const other = findAncestry(c.ancestryMix[1 - i]);
      const cur = findAncestry(c.ancestryMix[i]);
      let h = opt('', '— 選擇種族 —', !cur);
      mixableAncestries()
        .filter((a) => !other || a.name !== other.name)
        .forEach((a) => (h += opt(a.name, `${classKey(a.name)}：${a.abilities[i].name}`, cur && cur.name === a.name)));
      return `<label class="hf"><span>${label}</span><select data-mix="${i}">${h}</select></label>`;
    };
    const rules = mixed.rules.map((r) => `<p><b>${esc(r.name)}</b><br>${esc(r.desc)}</p>`).join('');
    return `<section class="panel mix-row">
      <h2>混合血統</h2>
      <div class="mix-grid">
        ${sel(0, '種族特性 1 取自')}${sel(1, '種族特性 2 取自')}
        ${field('混合種族名稱', text('ancestryMixName', '例如：牙裔'))}
      </div>
      <details class="mix-rules"><summary>規則說明</summary>${rules}</details>
    </section>`;
  }

  // 職業已選時只列該職業的子職；還沒選職業時，依職業分組列出全部子職
  function subSelect(slot, cls) {
    const current = String(ch()[slot] || '').trim();
    const known = findSubclass(current, cls && cls.name);
    let h = opt('', '— 未選擇 —', !current);
    if (cls) {
      subclassesOf(cls.name).forEach((s) => (h += opt(s.name, s.name, known && known.name === s.name)));
    } else {
      CLASSES.forEach((k) => {
        const inner = subclassesOf(k.name).map((s) => opt(s.name, s.name, known && known.name === s.name)).join('');
        h += `<optgroup label="${esc(k.name)}">${inner}</optgroup>`;
      });
    }
    if (current && !known) h += opt(current, `${current}（自訂）`, true);
    return `<select data-pick="${slot}">${h}${opt(CUSTOM, '自訂…', false)}</select>`;
  }

  // 兼職領域：選了職業 Ⅱ 會自動帶入它的兩個領域，也可以手動修改
  function domains2Field() {
    const c = ch();
    if (!String(c.class2 || '').trim()) return '';
    return `<div class="multi-domain"><small>兼職領域（${esc(c.class2)}）</small>${text('domains2.0', '領域 1', 'list="domainList"')}${text('domains2.1', '領域 2', 'list="domainList"')}</div>`;
  }

  // 子職的專精、大師特性要到升級時才取得，所以交給玩家按鈕加入
  function subActions() {
    const c = ch();
    const row = (title, sub, slot) =>
      sub
        ? `<div class="sub-actions">
      <span>${title}：${esc(sub.name)}</span>
      <button type="button" class="add" data-subup="specialization" data-subslot="${slot}">＋ 加入專精特性</button>
      <button type="button" class="add" data-subup="mastery" data-subslot="${slot}">＋ 加入大師特性</button>
    </div>`
        : '';
    return row('子職 Ⅰ', currentSubclass(c), 1) + row('兼職子職', currentSubclass2(c), 2);
  }

  // 職業 / 子職下拉選單的選擇結果。slot：class1 / sub1 / class2 / sub2
  function onPick(slot, value) {
    const c = ch();
    let msg = '';

    if (value === CUSTOM) {
      // 自訂（團務獨創的職業等）：只記錄名稱，不帶入任何資料
      const t = prompt('請輸入自訂名稱：');
      value = t ? t.trim() : '';
      if (!value) return renderAll(); // 取消：選單回到原本的值
    }

    if (slot === 'ancestry') {
      const a = findAncestry(value);
      if (a) {
        applyAncestry(c, a);
        msg = a.mixed
          ? '混合血統：請在下方選擇特性 1、特性 2 各取自哪個種族'
          : `已套用種族「${a.name}」：${a.abilities.map((x) => x.name).join('、')}`;
      } else {
        c.ancestry = value;
        c.ancestryMix = ['', ''];
        c.ancestryMixName = '';
        removeAuto(c, ['ancestry']); // 不再是認得的種族，原本帶入的特性也移除
      }
    } else if (slot === 'transformation') {
      const t = findTransformation(value);
      if (t) {
        applyTransformation(c, t);
        msg = `已套用轉變「${t.name}」：${t.abilities.map((x) => x.name).join('、')}`;
      } else {
        c.transformation = value;
        removeAuto(c, ['transformation']);
      }
    } else if (slot === 'background') {
      const b = findBackground(value);
      if (b) {
        applyBackground(c, b);
        msg = `已套用背景「${b.name}」：${b.ability}`;
      } else {
        c.background = value;
        removeAuto(c, ['background']);
      }
    } else if (slot === 'class1') {
      const cls = findClass(value);
      if (cls) {
        applyClass(c, cls);
        msg = `已套用職業「${cls.name}」：閃避 ${statTotal(c, 'evasion')}、HP ${statTotal(c, 'hp')}、領域 ${cls.domains.join(' / ')}`;
      } else {
        c.class1 = value;
      }
    } else if (slot === 'sub1') {
      const sub = findSubclass(value, findClass(c.class1)?.name);
      if (sub) {
        // 子職屬於另一個職業（或還沒選職業）時，連職業一起帶入
        const cls = findClass(c.class1);
        if (!cls || classKey(cls.name) !== classKey(sub.class)) applyClass(c, findClass(sub.class));
        applySubclass(c, sub);
        msg = `已套用子職「${sub.name}」的基礎特性（施法屬性：${sub.spellAttr}）`;
      } else {
        c.sub1 = value;
        if (!value) clearSubclassTraits(c);
      }
    } else if (slot === 'class2') {
      const cls = findClass(value);
      if (cls) {
        applyClass2(c, cls);
        msg = `兼職「${cls.name}」：已帶入領域 ${cls.domains.join(' / ')} 與職業特性`;
      } else {
        c.class2 = value;
        c.domains2 = ['', ''];
        clearClass2Traits(c); // 不再是認得的職業，原本帶入的職業特性也移除
        if (!value) {
          c.sub2 = '';
          clearMulticlassTraits(c);
        }
      }
    } else if (slot === 'sub2') {
      const sub = findSubclass(value, findClass(c.class2)?.name);
      if (sub) {
        const cls = findClass(c.class2);
        if (!cls || classKey(cls.name) !== classKey(sub.class)) applyClass2(c, findClass(sub.class));
        applySubclass2(c, sub);
        msg = `已加入兼職子職「${sub.name}」的基礎特性`;
      } else {
        c.sub2 = value;
        if (!value) clearMulticlassTraits(c);
      }
    }

    Store.save();
    renderAll(); // 職業會影響閃避、領域、特性與下拉選項，整頁重畫
    if (msg) toast(msg);
  }

  function onSubTier(kind, slot) {
    const c = ch();
    const sub = slot === 2 ? currentSubclass2(c) : currentSubclass(c);
    if (!sub) return;
    const n = applySubclassTier(c, sub, kind, slot);
    Store.save();
    render();
    toast(n ? `已加入「${sub.name}」的${TIER_LABEL[kind]}特性` : `「${sub.name}」沒有${TIER_LABEL[kind]}特性資料`);
  }

  /* ---------- 整體畫面 ---------- */
  function render() {
    const c = ch();
    if (!c) return;

    const prevLib = root().querySelector('#domainLib'); // 重畫前記住各個資料庫面板是否展開
    if (prevLib) lib.open = prevLib.open;
    WeaponLib.captureOpen(root());
    LevelUp.captureOpen(root());
    ArmorLib.captureOpen(root());
    if (lib.charId !== c.id) {
      // 切換角色時，卡片庫的篩選條件回到預設
      Object.assign(lib, { charId: c.id, domain: 'mine', maxLevel: null, q: '' });
    }

    const attrBoxes = ATTRS.map(
      (a) => `<div class="stat-box attr">
        <span>${a.label}</span>
        ${num('attrs.' + a.key + '.value')}
        <label class="mark" title="已升級標記">${check('attrs.' + a.key + '.marked')}</label>
      </div>`
    ).join('');

    const experiences = c.experiences
      .map(
        (e, i) => `<div class="list-row">
          ${text(`experiences.${i}.name`, '經歷名稱')}
          ${num(`experiences.${i}.bonus`, 'class="narrow"')}
          <button type="button" class="x" data-del="experiences.${i}" aria-label="刪除經歷">✕</button>
        </div>`
      )
      .join('');

    const inventoryWeapons = c.inventoryWeapons
      .map(
        (_, i) => weaponRow(`inventoryWeapons.${i}`, `inventoryWeapons.${i}`)
      )
      .join('');

    const cards = c.domainCards.map(domainCardRow).join('');

    const items = c.items
      .map(
        (it, i) => `<div class="list-row items">
          ${text(`items.${i}.name`, '名稱')}
          ${num(`items.${i}.qty`, 'class="narrow" min="0"')}
          ${text(`items.${i}.desc`, '描述')}
          <button type="button" class="x" data-del="items.${i}" aria-label="刪除">✕</button>
        </div>`
      )
      .join('');

    const traits = c.traits
      .map(
        (t, i) => `<div class="list-row traits">
          ${text(`traits.${i}.source`, '來源')}
          ${text(`traits.${i}.name`, '名稱')}
          ${area(`traits.${i}.desc`, 2, '描述')}
          <button type="button" class="x" data-del="traits.${i}" aria-label="刪除">✕</button>
        </div>`
      )
      .join('');

    root().innerHTML = `
    <div class="sheet">
      <header class="sheet-head">
        <div class="brand"><b>DAGGERHEART 匕首之心</b><small>CHARACTER SHEET 角色卡</small></div>
        <div class="head-grid">
          ${field('角色', text('name'))}
          ${field('種族', originSelect('ancestry', ANCESTRIES, findAncestry))}
          ${field('職業 Ⅰ', classSelect('class1'))}
          ${field('職業 Ⅱ（兼職）', classSelect('class2', findClass(c.class1)))}
          ${field('玩家', text('player'))}
          ${field('背景', originSelect('background', BACKGROUNDS, findBackground))}
          ${field('子職 Ⅰ', subSelect('sub1', findClass(c.class1)))}
          ${field('子職 Ⅱ（兼職）', subSelect('sub2', findClass(c.class2)))}
        </div>
        <div class="level">等級${num('level', 'min="1" max="10" title="直接修改等級只會改等級，不會套用升級效果；要升級請按下面的「升級」"')}<button type="button" class="levelup-btn" data-levelup>⬆ 升級</button></div>
      </header>
      ${mixRow()}

      <div class="stats">
        <div class="stat-box"><span>閃避值</span>${totalNum('evasion')}</div>
        <div class="stat-box"><span>護甲值</span>${totalNum('armor', 'min="0" max="12"')}</div>
        ${attrBoxes}
      </div>
      <div class="armor-track"><span>護甲槽</span>${boxes('armor')}</div>

      <div class="cols">
        <div class="col">
          ${section(
            '傷害與健康',
            `<div class="thresholds">
              <div><small>輕度傷害 扣除 1 HP</small></div>
              ${totalNum('major')}
              <div><small>中度傷害 扣除 2 HP</small></div>
              ${totalNum('severe')}
              <div><small>嚴重傷害 扣除 3 HP</small></div>
            </div>
            <div class="track-row"><b>HP</b>${totalNum('hp', 'class="narrow" min="1" max="12"')}${boxes('hp')}</div>
            <div class="track-row"><b>壓力</b>${totalNum('stress', 'class="narrow" min="1" max="12"')}${boxes('stress')}</div>`
          )}
          ${section(
            '希望',
            `<p class="muted">花費希望來使用經歷、技能或幫助盟友</p>
             <div class="track-row"><b>希望</b>${boxes('hope')}</div>
             ${area('hopeFeature', 4, '特性')}`
          )}
          ${section(
            '經歷',
            `<div class="list-head"><span>名稱</span><span>加值</span></div>${experiences}
             <button type="button" class="add" data-add="experiences">＋ 新增經歷</button>`
          )}
        </div>

        <div class="col">
          ${section(
            `武器 <span class="prof">熟練值：${num('proficiency', 'class="narrow" min="1" max="6"')}</span>`,
            `${WeaponLib.html()}
             <div class="wlabel">主手武器
               <label class="hands">負荷
                 <select data-bind="weapons.main.hands">
                   ${['', '單手', '雙手'].map((v) => `<option value="${v}" ${val('weapons.main.hands') === v ? 'selected' : ''}>${v || '—'}</option>`).join('')}
                 </select>
               </label>
             </div>${weaponRow('weapons.main')}
             <fieldset class="off-slot" ${WeaponLib.isTwoHanded() ? 'disabled' : ''}>
               <div class="wlabel">副手武器
                 <span class="off-note" ${WeaponLib.isTwoHanded() ? '' : 'hidden'}>主手是雙手武器，無法配副手</span>
               </div>${weaponRow('weapons.off')}
             </fieldset>`
          )}
          ${section(
            '護甲',
            `${ArmorLib.html()}
             <div class="armor-grid">
              ${field('名稱', text('armor.name', '輸入或選擇護甲', 'list="armorList" data-armor="1"'))}
              ${field('基礎傷害閾值', text('armor.baseThreshold'))}
              ${field('基礎護甲值', text('armor.baseScore'))}
              ${field('特徵', area('armor.features', 2, '特徵'), 'wide')}
            </div>`
          )}
          ${section(
            '庫存武器',
            `${inventoryWeapons}
             <button type="button" class="add" data-add="inventoryWeapons">＋ 新增庫存武器</button>`
          )}
        </div>

        <div class="col side">
          ${section(
            '頭像',
            `<div class="portrait">${c.portrait ? `<img src="${esc(c.portrait)}" alt="頭像">` : '<span>頭像</span>'}</div>
             ${text('portrait', '圖片網址')}`
          )}
          ${section('領域', `${text('domains.0', '領域 1', 'list="domainList"')}${text('domains.1', '領域 2', 'list="domainList"')}${domains2Field()}`)}
          ${section('金幣', text('gold'))}
        </div>
      </div>

      ${section(
        `領域卡 <span class="prof">已準備 <b id="prepCount">${preparedCount()}</b>/${MAX_PREPARED}　持有 ${c.domainCards.length} 張</span>`,
        `${libHtml()}
         ${cards || '<p class="muted">尚未新增領域卡</p>'}
         <button type="button" class="add" data-add="domainCards">＋ 新增自訂領域卡</button>`
      )}

      ${LevelUp.recordHtml()}

      <div class="cols two">
        ${section('角色設定', area('backstory', 6))}
        <div class="col">
          ${section('個人資源', area('resources', 2))}
          ${section('轉變', originSelect('transformation', TRANSFORMATIONS, findTransformation))}
        </div>
      </div>

      ${section(
        '裝備與物品',
        `<div class="list-head items"><span>名稱</span><span>數量</span><span>描述</span></div>${items}
         <button type="button" class="add" data-add="items">＋ 新增物品</button>`
      )}

      ${section(
        '角色特性',
        `<div class="list-head traits"><span>來源</span><span>名稱</span><span>描述</span></div>${traits}
         ${subActions()}
         <button type="button" class="add" data-add="traits">＋ 新增特性</button>`
      )}
    </div>`;
  }

  /* ---------- 事件 ---------- */
  function updatePrepCount() {
    const el = document.getElementById('prepCount');
    if (el) el.textContent = preparedCount();
  }

  // 主手負荷改變時，更新副手欄的停用狀態與武器庫按鈕（不重畫整頁，避免失去輸入焦點）
  function refreshOffLock() {
    const locked = WeaponLib.isTwoHanded();
    const fs = root().querySelector('.off-slot');
    if (fs) {
      fs.disabled = locked;
      const note = fs.querySelector('.off-note');
      if (note) note.hidden = !locked;
    }
    WeaponLib.refresh();
  }

  // 主手改成雙手武器時，副手武器不能同時裝備：移到庫存並重畫
  function applyHandsRule() {
    const moved = enforceTwoHanded(ch());
    if (moved) {
      Store.save();
      render();
      toast(`主手是雙手武器，副手「${moved}」已移到庫存`);
    } else {
      refreshOffLock();
    }
  }

  function refreshLibResults() {
    const el = document.getElementById('libResults');
    if (el) el.innerHTML = libResultsHtml();
  }

  function onInput(e) {
    const el = e.target;

    // 武器庫、護甲庫的篩選條件
    if (el.dataset && el.dataset.wlib) {
      WeaponLib.onFilter(el);
      return;
    }
    if (el.dataset && el.dataset.alib) {
      ArmorLib.onFilter(el);
      return;
    }

    // 卡片庫的篩選條件
    if (el.dataset && el.dataset.lib) {
      if (el.dataset.lib === 'domain') lib.domain = el.value;
      else if (el.dataset.lib === 'q') lib.q = el.value;
      else if (el.dataset.lib === 'level') lib.maxLevel = el.value === '' ? null : Number(el.value);
      refreshLibResults();
      return;
    }

    const path = el.dataset && el.dataset.bind;
    if (!path) return;

    if (el.dataset.prep !== undefined && el.checked && preparedCount() >= MAX_PREPARED) {
      el.checked = false;
      toast(`最多只能準備 ${MAX_PREPARED} 張領域卡`);
      return;
    }

    let v;
    if (el.dataset.type === 'number') {
      v = el.value === '' ? 0 : Number(el.value);
      if (!Number.isFinite(v)) v = 0;
      if (el.dataset.total) v = statStoredFromTotal(ch(), el.dataset.total, v); // 畫面上是合計，存回去的是扣掉其他來源後的值
    } else if (el.dataset.type === 'bool') {
      v = el.checked;
    } else {
      v = el.value;
    }
    setPath(ch(), path, v);
    Store.save();

    if (path === 'name') refreshBar();
    if (path.startsWith('domains.') || path.startsWith('domains2.')) refreshLibResults();
    if (path === 'weapons.main.hands') applyHandsRule();
    // 這些欄位會影響合計（熟練值：加拉帕；護甲欄：護甲值與閾值；力量：護甲值寫「3 + 力」時）
    if (['proficiency', 'armor.baseScore', 'armor.baseThreshold', 'attrs.str.value'].includes(path)) refreshTotals();
    if (el.dataset.total) {
      el.title = statTitle(ch(), el.dataset.total); // 手動調整後，分項說明要立刻更新
      Object.keys(TRACKS).forEach((n) => TRACKS[n].stat === el.dataset.total && renderTrack(n)); // 上限改了，勾選格數量跟著變
    }
    if (el.dataset.prep !== undefined) {
      updatePrepCount();
      const card = el.closest('.dcard');
      if (card) card.classList.toggle('prepared', el.checked);
    }
  }

  function onChange(e) {
    const el = e.target;
    // 輸入的武器名稱符合武器清單時，自動帶入其他欄位
    if (el.dataset && el.dataset.weapon) {
      const w = WEAPONS.find((x) => x.name === el.value);
      if (w) {
        const prefix = el.dataset.weapon;
        WEAPON_FIELDS.forEach((f) => {
          setPath(ch(), `${prefix}.${f}`, w[f] || '');
          const inp = root().querySelector(`[data-bind="${prefix}.${f}"]`);
          if (inp) inp.value = w[f] || '';
        });
        Store.save();
        if (prefix === 'weapons.main') applyHandsRule();
      }
    }
    // 混合血統：選擇特性取自哪個種族
    if (el.dataset && el.dataset.mix !== undefined) {
      const c = ch();
      c.ancestryMix[Number(el.dataset.mix)] = el.value;
      const done = applyMix(c);
      Store.save();
      renderAll();
      if (done) toast('已加入混合血統的兩個種族特性');
      return;
    }

    // 選了職業 / 子職，自動帶入對應資料
    if (el.dataset && el.dataset.pick) {
      onPick(el.dataset.pick, el.value);
      return;
    }

    // 護甲名稱符合護甲清單時，自動帶入傷害閾值、特徵、護甲值
    if (el.dataset && el.dataset.armor) {
      const a = ARMORS.find((x) => x.name === el.value);
      if (a) {
        const fill = { 'armor.baseThreshold': `${a.major} / ${a.severe}`, 'armor.features': a.features, 'armor.baseScore': a.score };
        Object.keys(fill).forEach((path) => {
          setPath(ch(), path, fill[path]);
          const inp = root().querySelector(`[data-bind="${path}"]`);
          if (inp) inp.value = fill[path];
        });
        Store.save();
        refreshTotals(); // 護甲值與傷害閾值讀自護甲，跟著更新
      }
    }
    if (el.dataset && el.dataset.bind === 'portrait') render();
    if (el.dataset && el.dataset.bind === 'level') render();
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.levelup !== undefined) {
      LevelUp.open();
      return;
    }

    if (btn.dataset.upkey) {
      LevelUp.toggleBox(btn.dataset.uptier, btn.dataset.upkey, btn.dataset.upi);
      return;
    }

    if (btn.dataset.subup) {
      onSubTier(btn.dataset.subup, Number(btn.dataset.subslot) || 1);
      return;
    }

    if (btn.dataset.aadd !== undefined) {
      e.preventDefault();
      ArmorLib.add(Number(btn.dataset.aadd));
      return;
    }

    if (btn.dataset.wadd !== undefined) {
      e.preventDefault();
      WeaponLib.add(btn.dataset.slot, Number(btn.dataset.wadd));
      return;
    }

    if (btn.dataset.libadd !== undefined) {
      e.preventDefault(); // 按鈕在 <summary> 裡，避免同時展開/收合描述
      addFromLibrary(Number(btn.dataset.libadd));
      return;
    }

    if (btn.dataset.track) {
      const t = TRACKS[btn.dataset.track];
      const i = Number(btn.dataset.i);
      const cur = Math.min(Number(ch()[t.marked]) || 0, trackMax(btn.dataset.track));
      const next = i < cur ? i : i + 1;
      ch()[t.marked] = next;
      Store.save();
      [...btn.parentElement.children].forEach((b, idx) => b.classList.toggle('on', idx < next));
      return;
    }

    if (btn.dataset.add) {
      const list = btn.dataset.add;
      if (!TEMPLATES[list]) return;
      ch()[list].push(TEMPLATES[list]());
      Store.save();
      render();
      return;
    }

    if (btn.dataset.del) {
      const [list, idx] = btn.dataset.del.split('.');
      if (!Array.isArray(ch()[list])) return;
      ch()[list].splice(Number(idx), 1);
      Store.save();
      render();
    }
  }

  function init() {
    const r = root();
    r.addEventListener('input', onInput);
    r.addEventListener('change', onChange);
    r.addEventListener('click', onClick);
  }

  // 升級完成後：展開領域卡庫並捲到那裡，方便接著選領域卡
  function focusDomainLibrary() {
    const panel = document.getElementById('domainLib');
    if (panel) panel.open = true; // render() 開頭會讀取面板目前的展開狀態，所以要先改畫面上的
    lib.open = true;
    render();
    document.getElementById('domainLib')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  return { init, render, focusDomainLibrary };
})();
