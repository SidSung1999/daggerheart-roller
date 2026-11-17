/* 護甲庫：依條件篩選全部護甲，再「裝備」到角色卡（護甲只有一個欄位，裝備會取代目前的護甲）。 */
const ArmorLib = (() => {
  const LIMIT = 60;
  const DEFAULTS = { tier: 'upto', score: '', frame: '', q: '' };
  const st = { open: false, charId: null, ...DEFAULTS };

  const ch = () => Store.active();
  const myTier = () => tierOfLevel(Number(ch().level) || 1);
  const uniq = (key) => [...new Set(ARMORS.map((a) => a[key]).filter(Boolean))];
  const thresholdText = (a) => `${a.major} / ${a.severe}`;

  // 護甲值多半是數字，也有「3 + 力」這種文字，數字在前、依大小排序
  const scoreOptions = () =>
    uniq('score').sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b));

  function matches() {
    const q = st.q.trim().toLowerCase();
    const tier = myTier();
    return ARMORS.map((a, idx) => ({ a, idx })).filter(({ a }) => {
      if (st.tier === 'upto') {
        if (a.tier > tier) return false;
      } else if (st.tier !== 'all' && a.tier !== Number(st.tier)) {
        return false;
      }
      if (st.score && a.score !== st.score) return false;
      if (st.frame && a.frame !== st.frame) return false;
      return !q || `${a.name} ${a.features}`.toLowerCase().includes(q);
    });
  }

  function resultsHtml() {
    const found = matches();
    if (!found.length) return '<p class="muted">沒有符合條件的護甲</p>';
    const current = ch().armor.name;
    const rows = found.slice(0, LIMIT).map(({ a, idx }) => {
      const equipped = current === a.name;
      const frame = a.frame && a.frame !== '標準' ? `・${a.frame}` : '';
      return `<details class="lib-item">
        <summary>
          <span class="lib-name">${esc(a.name)}</span>
          <span class="lib-meta">T${a.tier}・閾值 ${esc(thresholdText(a))}・護甲值 ${esc(a.score)}${esc(frame)}</span>
          <button type="button" class="lib-add" data-aadd="${idx}" ${equipped ? 'disabled' : ''}>${equipped ? '已裝備' : '裝備'}</button>
        </summary>
        <p>${a.features ? esc(a.features) : '（無特徵）'}</p>
      </details>`;
    });
    const total = found.length > LIMIT ? `共 ${found.length} 件，僅顯示前 ${LIMIT} 件，請縮小篩選條件` : `共 ${found.length} 件`;
    return rows.join('') + `<p class="muted">${total}</p>`;
  }

  function select(key, label, options) {
    const opts = options
      .map(([v, l]) => `<option value="${esc(v)}" ${String(st[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');
    return `<label>${label}<select data-alib="${key}">${opts}</select></label>`;
  }

  function html() {
    const c = ch();
    if (st.charId !== c.id) Object.assign(st, DEFAULTS, { charId: c.id }); // 換角色時重設條件
    const all = ['', '全部'];
    const tiers = [['upto', `≤ 我的階級（${myTier()}）`], ['all', '全部階級'], [1, '階級 1'], [2, '階級 2'], [3, '階級 3'], [4, '階級 4']];
    return `<details class="library" id="armorLib" ${st.open ? 'open' : ''}>
      <summary>📚 從護甲庫選擇（共 ${ARMORS.length} 件）</summary>
      <div class="wlib-filters">
        ${select('tier', '階級', tiers)}
        ${select('score', '護甲值', [all, ...scoreOptions().map((v) => [v, v])])}
        ${select('frame', '框架', [all, ...uniq('frame').map((v) => [v, v])])}
      </div>
      <input type="text" class="wlib-q" data-alib="q" value="${esc(st.q)}" placeholder="搜尋名稱或特徵">
      <div id="alibResults" class="lib-results">${resultsHtml()}</div>
    </details>`;
  }

  // 重畫前呼叫，記住面板是否展開
  function captureOpen(root) {
    const el = root.querySelector('#armorLib');
    if (el) st.open = el.open;
  }

  function onFilter(el) {
    st[el.dataset.alib] = el.value;
    const box = document.getElementById('alibResults');
    if (box) box.innerHTML = resultsHtml();
  }

  function add(idx) {
    const a = ARMORS[idx];
    if (!a) return;
    Object.assign(ch().armor, { name: a.name, baseThreshold: thresholdText(a), features: a.features, baseScore: a.score });
    Store.save();
    Sheet.render();
    toast(`已裝備護甲：${a.name}`);
  }

  return { html, captureOpen, onFilter, add };
})();
