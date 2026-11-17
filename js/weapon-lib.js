/* 武器庫：依條件篩選全部武器，再放進主手 / 副手 / 庫存。
   規則：主手放單手或雙手武器；副手欄只放「副手」類武器，且主手是雙手武器時不能配副手。 */
const WeaponLib = (() => {
  const LIMIT = 60;
  const DEFAULTS = { tier: 'upto', hands: '', trait: '', range: '', type: '', frame: '', q: '' };
  const st = { open: false, charId: null, ...DEFAULTS };

  const uniq = (key) => [...new Set(WEAPONS.map((w) => w[key]).filter(Boolean))];
  const ch = () => Store.active();
  const myTier = () => tierOfLevel(Number(ch().level) || 1);
  const isTwoHanded = () => ch().weapons.main.hands === '雙手';

  function matches() {
    const q = st.q.trim().toLowerCase();
    const tier = myTier();
    return WEAPONS.map((w, idx) => ({ w, idx })).filter(({ w }) => {
      if (st.tier === 'upto') {
        if (w.tier > tier) return false;
      } else if (st.tier !== 'all' && w.tier !== Number(st.tier)) {
        return false;
      }
      for (const k of ['hands', 'trait', 'range', 'type', 'frame']) {
        if (st[k] && w[k] !== st[k]) return false;
      }
      return !q || `${w.name} ${w.features}`.toLowerCase().includes(q);
    });
  }

  function resultsHtml() {
    const found = matches();
    if (!found.length) return '<p class="muted">沒有符合條件的武器</p>';
    const locked = isTwoHanded();
    const rows = found.slice(0, LIMIT).map(({ w, idx }) => {
      const canMain = w.hands !== '副手';
      const canOff = w.hands === '副手' && !locked;
      const mainTip = canMain ? '' : '副手類武器不能放在主手';
      const offTip = canOff ? '' : w.hands !== '副手' ? '只有「副手」類武器能放在副手欄' : '主手是雙手武器，無法配副手';
      const frame = w.frame && w.frame !== '標準' ? `・${w.frame}` : '';
      return `<details class="lib-item">
        <summary>
          <span class="lib-name">${esc(w.name)}</span>
          <span class="lib-meta">T${w.tier}・${esc(w.hands)}・${esc(w.trait)}・${esc(w.range)}・${esc(w.damage)}・${esc(w.type)}${esc(frame)}</span>
          <button type="button" class="lib-add" data-wadd="${idx}" data-slot="main" ${canMain ? '' : `disabled title="${mainTip}"`}>主手</button>
          <button type="button" class="lib-add" data-wadd="${idx}" data-slot="off" ${canOff ? '' : `disabled title="${offTip}"`}>副手</button>
          <button type="button" class="lib-add" data-wadd="${idx}" data-slot="inv">庫存</button>
        </summary>
        <p>${w.features ? esc(w.features) : '（無特徵）'}</p>
      </details>`;
    });
    const total = found.length > LIMIT ? `共 ${found.length} 把，僅顯示前 ${LIMIT} 把，請縮小篩選條件` : `共 ${found.length} 把`;
    return rows.join('') + `<p class="muted">${total}</p>`;
  }

  function select(key, label, options) {
    const opts = options
      .map(([v, l]) => `<option value="${esc(v)}" ${String(st[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');
    return `<label>${label}<select data-wlib="${key}">${opts}</select></label>`;
  }

  function html() {
    const c = ch();
    if (st.charId !== c.id) Object.assign(st, DEFAULTS, { charId: c.id }); // 換角色時重設條件
    const all = ['', '全部'];
    const tiers = [['upto', `≤ 我的階級（${myTier()}）`], ['all', '全部階級'], [1, '階級 1'], [2, '階級 2'], [3, '階級 3'], [4, '階級 4']];
    const list = (key) => [all, ...uniq(key).map((v) => [v, v])];
    return `<details class="library" id="weaponLib" ${st.open ? 'open' : ''}>
      <summary>📚 從武器庫選擇（共 ${WEAPONS.length} 把）</summary>
      <div class="wlib-filters">
        ${select('tier', '階級', tiers)}
        ${select('hands', '負荷', list('hands'))}
        ${select('trait', '屬性', list('trait'))}
        ${select('range', '距離', list('range'))}
        ${select('type', '傷害類型', list('type'))}
        ${select('frame', '框架', list('frame'))}
      </div>
      <input type="text" class="wlib-q" data-wlib="q" value="${esc(st.q)}" placeholder="搜尋名稱或特徵">
      <div id="wlibResults" class="lib-results">${resultsHtml()}</div>
    </details>`;
  }

  // 重畫前呼叫，記住面板是否展開
  function captureOpen(root) {
    const el = root.querySelector('#weaponLib');
    if (el) st.open = el.open;
  }

  function refresh() {
    const el = document.getElementById('wlibResults');
    if (el) el.innerHTML = resultsHtml();
  }

  function onFilter(el) {
    st[el.dataset.wlib] = el.value;
    refresh();
  }

  function add(slot, idx) {
    const w = WEAPONS[idx];
    if (!w) return;
    const c = ch();
    const data = { name: w.name, trait: w.trait, features: w.features, range: w.range, damage: w.damage, type: w.type, hands: w.hands };

    if (slot === 'main') {
      if (w.hands === '副手') return toast('副手類武器不能放在主手');
      Object.assign(c.weapons.main, data);
      const moved = enforceTwoHanded(c);
      toast(moved ? `主手：${w.name}。雙手武器不能配副手，「${moved}」已移到庫存` : `主手：${w.name}`);
    } else if (slot === 'off') {
      if (w.hands !== '副手') return toast('只有「副手」類武器能放在副手欄');
      if (isTwoHanded()) return toast('主手是雙手武器，無法配副手');
      Object.assign(c.weapons.off, data);
      toast(`副手：${w.name}`);
    } else {
      const empty = c.inventoryWeapons.find((x) => !x.name.trim());
      if (empty) Object.assign(empty, data);
      else c.inventoryWeapons.push({ ...data });
      toast(`已放入庫存：${w.name}`);
    }
    Store.save();
    Sheet.render();
  }

  return { html, captureOpen, refresh, onFilter, add, isTwoHanded };
})();
