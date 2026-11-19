/* 自由擲骰：不依賴角色卡，臨時需要擲骰（規則沒涵蓋到的地方、GM 臨時裁定）時使用。
   - 自訂公式：直接輸入 3d8+2d6-1，或用按鈕組出公式
   - 二元骰：希望骰與恐懼骰（預設 d12，可改 d20）、修正值、優勢 / 劣勢
   - 紀錄：最近的擲骰結果（只存在目前這個頁面，重新整理會清掉） */
const FreeRoll = (() => {
  const root = () => document.getElementById('freeroll');
  const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
  const QUICK_MODS = [-2, -1, 1, 2, 3];
  const HISTORY_MAX = 30;
  const history = [];

  const $ = (sel) => root().querySelector(sel);
  const signed = (n) => (n >= 0 ? '+' : '') + n;

  function html() {
    const dieOpts = (sel) => [12, 20].map((n) => `<option value="${n}" ${n === sel ? 'selected' : ''}>d${n}</option>`).join('');
    return `<div class="free">
      <div class="panel">
        <h2>自訂公式</h2>
        <input type="text" id="frFormula" class="fr-formula" placeholder="例：3d8+2d6+4" autocomplete="off" aria-label="骰子公式">
        <div class="fr-quick" aria-label="加入骰子">
          ${QUICK_DICE.map((n) => `<button type="button" data-fr="die" data-sides="${n}">＋d${n}</button>`).join('')}
        </div>
        <div class="fr-quick" aria-label="調整加值">
          ${QUICK_MODS.map((n) => `<button type="button" data-fr="mod" data-v="${n}">${signed(n)}</button>`).join('')}
          <button type="button" data-fr="clear" class="fr-clear">清除</button>
        </div>
        <button type="button" class="roll-btn" data-fr="roll">🎲 擲骰！</button>
      </div>

      <div class="panel">
        <h2>二元骰（希望 / 恐懼）</h2>
        <div class="fr-duality">
          <label class="hf"><span>希望骰</span><select id="frHope">${dieOpts(12)}</select></label>
          <label class="hf"><span>恐懼骰</span><select id="frFear">${dieOpts(12)}</select></label>
          <label class="hf"><span>修正值</span><input type="number" id="frMod" value="0"></label>
          <label class="hf"><span>優勢 / 劣勢</span>
            <select id="frAdv"><option value="0">無</option><option value="1">優勢（+d6）</option><option value="-1">劣勢（−d6）</option></select>
          </label>
        </div>
        <button type="button" class="roll-btn" data-fr="duality">🎲 擲二元骰</button>
      </div>

      <div id="frResult"></div>

      <div class="panel">
        <h2>紀錄 <button type="button" class="fr-clear" data-fr="clearlog">清空</button></h2>
        <ol class="fr-log" id="frLog"></ol>
      </div>
    </div>`;
  }

  /* ---------- 公式組合 ---------- */

  function setFormula(terms) {
    $('#frFormula').value = Dice.format(terms);
  }

  // 目前公式裡的項目；公式還不合法時回傳 null
  function currentTerms() {
    const r = Dice.parse($('#frFormula').value);
    return r.ok ? r.terms : null;
  }

  function addDie(sides) {
    const terms = currentTerms();
    if (!terms) return toast('公式格式不正確，請先修正或按「清除」');
    const same = terms.find((t) => t.kind === 'dice' && t.sign > 0 && t.sides === sides);
    if (same) {
      if (same.count >= Dice.MAX_COUNT) return toast(`同一種骰子最多 ${Dice.MAX_COUNT} 顆`);
      same.count += 1;
    } else {
      terms.push({ kind: 'dice', sign: 1, count: 1, sides });
    }
    setFormula(terms);
  }

  // 固定加值合併成一項：+2 之後再按 -1 會變成 +1
  function addMod(v) {
    const terms = currentTerms();
    if (!terms) return toast('公式格式不正確，請先修正或按「清除」');
    const flat = terms.filter((t) => t.kind === 'flat').reduce((sum, t) => sum + t.sign * t.value, 0) + v;
    const rest = terms.filter((t) => t.kind !== 'flat');
    if (flat) rest.push({ kind: 'flat', sign: flat < 0 ? -1 : 1, value: Math.abs(flat) });
    setFormula(rest);
  }

  /* ---------- 擲骰與顯示 ---------- */

  function log(label, total, extra = '') {
    history.unshift({ label, total, extra, time: new Date() });
    if (history.length > HISTORY_MAX) history.pop();
    drawLog();
  }

  function drawLog() {
    const pad = (n) => String(n).padStart(2, '0');
    $('#frLog').innerHTML = history.length
      ? history
          .map((h) => `<li><span class="fr-time">${pad(h.time.getHours())}:${pad(h.time.getMinutes())}:${pad(h.time.getSeconds())}</span> <b>${esc(h.label)}</b> → <span class="fr-total">${h.total}</span>${h.extra ? ` <small>${esc(h.extra)}</small>` : ''}</li>`)
          .join('')
      : '<li class="muted">還沒有擲骰紀錄</li>';
  }

  function rollFormula() {
    const raw = $('#frFormula').value;
    const r = Dice.parse(raw);
    if (!r.ok || !r.terms.length) {
      $('#frResult').innerHTML = `<div class="result err">${raw.trim() ? '公式格式不正確。可以用 d4、d6、d8、d10、d12、d20，例如：2d8+d6+3（單一種骰子最多 50 顆）' : '請先輸入公式，或按上面的按鈕加入骰子'}</div>`;
      return;
    }
    const rolled = Dice.rollTerms(r.terms);
    const label = Dice.format(r.terms);
    $('#frResult').innerHTML = `<div class="result">
      <div class="result-title">${esc(label)}</div>
      <div class="breakdown">${rolled.text.split('　').map((x) => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="total">${rolled.total}</div><small class="muted">總計</small>
    </div>`;
    log(label, rolled.total);
  }

  function rollDuality() {
    const hopeSides = Number($('#frHope').value) || 12;
    const fearSides = Number($('#frFear').value) || 12;
    const mod = Math.round(Number($('#frMod').value) || 0);
    const adv = Number($('#frAdv').value) || 0;
    const hope = Dice.roll(hopeSides);
    const fear = Dice.roll(fearSides);
    const advDie = adv ? Dice.roll(6) : 0;
    const total = hope + fear + mod + adv * advDie;

    let verdict = '<div class="verdict hope">☀ 帶著希望</div>';
    let verdictText = '帶著希望';
    if (hope === fear) {
      verdict = '<div class="verdict crit">✨ 關鍵成功！（Critical）</div>';
      verdictText = '關鍵成功';
    } else if (fear > hope) {
      verdict = '<div class="verdict fear">🌑 帶著恐懼</div>';
      verdictText = '帶著恐懼';
    }

    const lines = [`希望骰 d${hopeSides}：${hope}`, `恐懼骰 d${fearSides}：${fear}`];
    if (mod) lines.push(`修正值：${signed(mod)}`);
    if (adv) lines.push(`${adv > 0 ? '優勢' : '劣勢'} d6：${adv > 0 ? '+' : '−'}${advDie}`);

    $('#frResult').innerHTML = `<div class="result">
      <div class="dh">
        <div class="die hope"><small>☀ 希望骰 d${hopeSides}</small><b>${hope}</b></div>
        <div class="die fear"><small>🌑 恐懼骰 d${fearSides}</small><b>${fear}</b></div>
      </div>
      ${verdict}
      <div class="breakdown">${lines.map((x) => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="total">${total}</div><small class="muted">總計</small>
    </div>`;
    log(`二元骰 d${hopeSides}+d${fearSides}${mod ? signed(mod) : ''}${adv ? (adv > 0 ? ' 優勢' : ' 劣勢') : ''}`, total, `${hope} / ${fear}　${verdictText}`);
  }

  /* ---------- 事件 ---------- */

  function onClick(e) {
    const btn = e.target.closest('button[data-fr]');
    if (!btn) return;
    switch (btn.dataset.fr) {
      case 'die': return addDie(Number(btn.dataset.sides));
      case 'mod': return addMod(Number(btn.dataset.v));
      case 'clear':
        $('#frFormula').value = '';
        return $('#frFormula').focus();
      case 'roll': return rollFormula();
      case 'duality': return rollDuality();
      case 'clearlog':
        history.length = 0;
        return drawLog();
      default:
    }
  }

  function init() {
    root().innerHTML = html();
    drawLog();
    root().addEventListener('click', onClick);
    $('#frFormula').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') rollFormula();
    });
  }

  return { init };
})();
