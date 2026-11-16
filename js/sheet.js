/* 角色卡畫面 */
const Sheet = (() => {
  const root = () => document.getElementById('sheet');
  const ch = () => Store.active();

  // 勾選格軌道：已標記數量欄位、上限欄位（null 表示固定）、上限範圍
  const TRACKS = {
    hp: { marked: 'hpMarked', max: 'hpMax', min: 1, cap: 12, label: 'HP' },
    stress: { marked: 'stressMarked', max: 'stressMax', min: 1, cap: 12, label: '壓力' },
    hope: { marked: 'hopeMarked', max: null, fixed: 6, label: '希望' },
    armor: { marked: 'armorMarked', max: 'armorSlots', min: 0, cap: 12, label: '護甲' },
  };

  const WEAPON_FIELDS = ['name', 'trait', 'features', 'range', 'damage', 'type'];

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
  const check = (path, extra = '') =>
    `<input type="checkbox" data-bind="${path}" data-type="bool" ${getPath(ch(), path) ? 'checked' : ''} ${extra}>`;
  const field = (label, inner, cls = '') => `<label class="hf ${cls}"><span>${label}</span>${inner}</label>`;
  const section = (title, inner, cls = '') =>
    `<section class="panel ${cls}"><h2>${title}</h2>${inner}</section>`;

  /* ---------- 勾選格 ---------- */
  function trackMax(name) {
    const t = TRACKS[name];
    if (t.fixed) return t.fixed;
    const n = Math.floor(Number(ch()[t.max]) || 0);
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
  function weaponRow(prefix) {
    return `<div class="wgrid">
      <input list="weaponList" data-bind="${prefix}.name" data-weapon="${prefix}" value="${esc(val(prefix + '.name'))}" placeholder="武器名稱">
      ${text(prefix + '.trait', '屬性')}
      ${text(prefix + '.features', '特徵')}
      ${text(prefix + '.range', '射程')}
      ${text(prefix + '.damage', '例：d8+4')}
      ${text(prefix + '.type', '類型')}
    </div>`;
  }

  const weaponHead = `<div class="wgrid whead"><span>名稱</span><span>屬性</span><span>特徵</span><span>射程</span><span>傷害數值</span><span>傷害類型</span></div>`;

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
    const mine = c.domains.filter((d) => d && d.trim());
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
    return `<details class="library" ${lib.open ? 'open' : ''}>
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

  /* ---------- 整體畫面 ---------- */
  function render() {
    const c = ch();
    if (!c) return;

    const prevLib = root().querySelector('.library'); // 重畫前記住卡片庫是否展開
    if (prevLib) lib.open = prevLib.open;
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
        (_, i) => `<div class="inv-row">${weaponRow(`inventoryWeapons.${i}`)}<button type="button" class="x" data-del="inventoryWeapons.${i}" aria-label="刪除">✕</button></div>`
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
          ${text(`traits.${i}.desc`, '描述')}
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
          ${field('種族', text('ancestry'))}
          ${field('職業 Ⅰ', text('class1'))}
          ${field('職業 Ⅱ', text('class2'))}
          ${field('玩家', text('player'))}
          ${field('背景', text('background'))}
          ${field('子職 Ⅰ', text('sub1'))}
          ${field('子職 Ⅱ', text('sub2'))}
        </div>
        <div class="level">等級${num('level', 'min="1" max="10"')}</div>
      </header>

      <div class="stats">
        <div class="stat-box"><span>閃避值</span>${num('evasion')}</div>
        <div class="stat-box"><span>護甲值</span>${num('armorSlots', 'min="0" max="12"')}</div>
        ${attrBoxes}
      </div>
      <div class="armor-track"><span>護甲槽</span>${boxes('armor')}</div>

      <div class="cols">
        <div class="col">
          ${section(
            '傷害與健康',
            `<div class="thresholds">
              <div><small>輕度傷害 扣除 1 HP</small></div>
              ${num('majorThreshold')}
              <div><small>中度傷害 扣除 2 HP</small></div>
              ${num('severeThreshold')}
              <div><small>嚴重傷害 扣除 3 HP</small></div>
            </div>
            <div class="track-row"><b>HP</b>${num('hpMax', 'class="narrow" min="1" max="12" title="HP 上限"')}${boxes('hp')}</div>
            <div class="track-row"><b>壓力</b>${num('stressMax', 'class="narrow" min="1" max="12" title="壓力上限"')}${boxes('stress')}</div>`
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
            `${weaponHead}
             <div class="wlabel">主手武器</div>${weaponRow('weapons.main')}
             <div class="wlabel">副手武器</div>${weaponRow('weapons.off')}`
          )}
          ${section(
            '護甲',
            `<div class="armor-grid">
              ${field('名稱', text('armor.name'))}
              ${field('基礎傷害閾值', text('armor.baseThreshold'))}
              ${field('特徵', text('armor.features'))}
              ${field('基礎護甲值', text('armor.baseScore'))}
            </div>`
          )}
          ${section(
            '庫存武器',
            `${weaponHead}${inventoryWeapons}
             <button type="button" class="add" data-add="inventoryWeapons">＋ 新增庫存武器</button>`
          )}
        </div>

        <div class="col side">
          ${section(
            '頭像',
            `<div class="portrait">${c.portrait ? `<img src="${esc(c.portrait)}" alt="頭像">` : '<span>頭像</span>'}</div>
             ${text('portrait', '圖片網址')}`
          )}
          ${section('領域', `${text('domains.0', '領域 1', 'list="domainList"')}${text('domains.1', '領域 2', 'list="domainList"')}`)}
          ${section('金幣', text('gold'))}
        </div>
      </div>

      ${section(
        `領域卡 <span class="prof">已準備 <b id="prepCount">${preparedCount()}</b>/${MAX_PREPARED}　持有 ${c.domainCards.length} 張（等級 ${c.level} 可持有 ${Number(c.level) + 1} 張）</span>`,
        `${libHtml()}
         ${cards || '<p class="muted">尚未新增領域卡</p>'}
         <button type="button" class="add" data-add="domainCards">＋ 新增自訂領域卡</button>`
      )}

      <div class="cols two">
        ${section('角色設定', area('backstory', 6))}
        <div class="col">
          ${section('個人資源', area('resources', 2))}
          ${section('轉變', area('transformation', 2))}
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
         <button type="button" class="add" data-add="traits">＋ 新增特性</button>`
      )}
    </div>`;
  }

  /* ---------- 事件 ---------- */
  function updatePrepCount() {
    const el = document.getElementById('prepCount');
    if (el) el.textContent = preparedCount();
  }

  function refreshLibResults() {
    const el = document.getElementById('libResults');
    if (el) el.innerHTML = libResultsHtml();
  }

  function onInput(e) {
    const el = e.target;

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
    } else if (el.dataset.type === 'bool') {
      v = el.checked;
    } else {
      v = el.value;
    }
    setPath(ch(), path, v);
    Store.save();

    if (path === 'name') refreshBar();
    if (path.startsWith('domains.')) refreshLibResults();
    if (['hpMax', 'stressMax', 'armorSlots'].includes(path)) {
      Object.keys(TRACKS).forEach((n) => TRACKS[n].max === path && renderTrack(n));
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
      }
    }
    if (el.dataset && el.dataset.bind === 'portrait') render();
    if (el.dataset && el.dataset.bind === 'level') render();
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

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

  return { init, render };
})();
