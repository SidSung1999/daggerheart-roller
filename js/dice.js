/* 骰子公式：解析、格式化、擲骰。純函式，不依賴 DOM。 */
const Dice = (() => {
  const MAX_COUNT = 50;
  const MAX_SIDES = 1000;

  function roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // "d8+2" -> { ok:true, terms:[{kind:'dice',sign:1,count:1,sides:8},{kind:'flat',sign:1,value:2}] }
  function parse(str) {
    const s = String(str == null ? '' : str)
      .replace(/\s+/g, '')
      .replace(/＋/g, '+')
      .replace(/[－−]/g, '-')
      .toLowerCase();
    if (!s) return { ok: true, terms: [] };

    const re = /([+-]?)(?:(\d*)d(\d+)|(\d+))/y;
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
        terms.push({ kind: 'dice', sign, count, sides });
      } else {
        terms.push({ kind: 'flat', sign, value: parseInt(m[4], 10) });
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
        return t.kind === 'dice' ? `${sg}${t.count}d${t.sides}` : `${sg}${t.value}`;
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
        const sum = rolls.reduce((a, b) => a + b, 0);
        total += t.sign * sum;
        pieces.push(`${t.sign < 0 ? '-' : ''}${t.count}d${t.sides} [${rolls.join(', ')}] = ${sum}`);
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
