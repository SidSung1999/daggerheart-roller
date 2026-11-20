/* 骰子公式：解析、格式化、擲骰。純函式，不依賴 DOM。 */
const Dice = (() => {
  const MAX_COUNT = 50;
  const MAX_SIDES = 1000;

  function roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // "d8+2" -> { ok:true, terms:[{kind:'dice',sign:1,count:1,sides:8},{kind:'flat',sign:1,value:2}] }
  // 也支援取高 / 取低：3d6kh1 = 擲 3 顆 d6 只留最高 1 顆；4d6kh3、2d20kl1 同理（kh、kl 後面沒寫數字就是 1）。
  // 這種骰子項會多一個 keep: { mode: 'h' | 'l', n }
  function parse(str) {
    const s = String(str == null ? '' : str)
      .replace(/\s+/g, '')
      .replace(/＋/g, '+')
      .replace(/[－−]/g, '-')
      .toLowerCase();
    if (!s) return { ok: true, terms: [] };

    const re = /([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d*))?|(\d+))/y;
    const terms = [];
    let idx = 0;
    while (idx < s.length) {
      re.lastIndex = idx;
      const m = re.exec(s);
      if (!m) return { ok: false, terms: [] };
      if (idx > 0 && !m[1]) return { ok: false, terms: [] }; // 第二項起必須有正負號
      const sign = m[1] === '-' ? -1 : 1;
      if (m[3] !== undefined) {
        const count = m[2] === '' ? 1 : parseInt(m[2], 10);
        const sides = parseInt(m[3], 10);
        if (count < 1 || count > MAX_COUNT || sides < 2 || sides > MAX_SIDES) {
          return { ok: false, terms: [] };
        }
        const term = { kind: 'dice', sign, count, sides };
        if (m[4]) {
          const n = m[5] === '' ? 1 : parseInt(m[5], 10);
          if (n < 1) return { ok: false, terms: [] };
          if (n < count) term.keep = { mode: m[4], n }; // 全部都留下來就等於沒有取高 / 取低
        }
        terms.push(term);
      } else {
        terms.push({ kind: 'flat', sign, value: parseInt(m[6], 10) });
      }
      idx = re.lastIndex;
    }
    return { ok: true, terms };
  }

  // 整個公式重複 n 次：骰子數量與固定加值都乘以 n。例如 1d20+2 乘 3 變成 3d20+6。
  // 呼叫前要先確認骰子數量不會超過 MAX_COUNT（超過的會被截到上限）。
  function multiply(terms, n) {
    const k = Math.max(1, Math.floor(n) || 1);
    return terms.map((t) => (t.kind === 'dice' ? { ...t, count: Math.min(t.count * k, MAX_COUNT) } : { ...t, value: t.value * k }));
  }

  // 轉回字串，開頭不帶 +
  function format(terms) {
    const out = terms
      .map((t) => {
        const sg = t.sign < 0 ? '-' : '+';
        const keep = t.keep ? `k${t.keep.mode}${t.keep.n}` : '';
        return t.kind === 'dice' ? `${sg}${t.count}d${t.sides}${keep}` : `${sg}${t.value}`;
      })
      .join('');
    return out.replace(/^\+/, '');
  }

  // 第一個正的骰子項的數量乘以 mult（例如熟練值）
  function scaleFirstDice(terms, mult) {
    let done = false;
    return terms.map((t) => {
      if (!done && t.kind === 'dice' && t.sign > 0) {
        done = true;
        return { ...t, count: Math.min(t.count * Math.max(1, mult), MAX_COUNT) };
      }
      return t;
    });
  }

  // 擲一組項目，回傳總和與說明文字
  function rollTerms(terms, rng = roll) {
    let total = 0;
    const pieces = [];
    terms.forEach((t) => {
      if (t.kind === 'dice') {
        const rolls = [];
        for (let i = 0; i < t.count; i++) rolls.push(rng(t.sides));
        // 取高 / 取低：只計入留下來的骰子，沒留下的在說明裡用括號標示
        const kept = new Set(rolls.map((_, i) => i));
        if (t.keep) {
          const order = rolls.map((_, i) => i).sort((a, b) => (t.keep.mode === 'h' ? rolls[b] - rolls[a] : rolls[a] - rolls[b]) || a - b);
          kept.clear();
          order.slice(0, t.keep.n).forEach((i) => kept.add(i));
        }
        const sum = rolls.reduce((a, r, i) => a + (kept.has(i) ? r : 0), 0);
        total += t.sign * sum;
        const shown = rolls.map((r, i) => (kept.has(i) ? r : `(${r})`)).join(', ');
        const keepLabel = t.keep ? `k${t.keep.mode}${t.keep.n}` : '';
        pieces.push(`${t.sign < 0 ? '-' : ''}${t.count}d${t.sides}${keepLabel} [${shown}] = ${sum}`);
      } else {
        total += t.sign * t.value;
        pieces.push(`${t.sign < 0 ? '-' : '+'}${t.value}`);
      }
    });
    return { total, text: pieces.join('　') };
  }

  return { roll, parse, format, scaleFirstDice, multiply, rollTerms, MAX_COUNT };
})();

if (typeof module !== 'undefined') module.exports = Dice;
