/* 閃避、HP、壓力、護甲值、傷害閾值的合計：把各個來源另外記錄再疊加。
   畫面顯示合計，滑鼠移上去（title）顯示分項「數字(來源)」，例如「6(職業)+1(種族)」，數值是 0 的來源會省略。

   - 閃避、HP、壓力：存的是職業給的基礎值，再疊加種族加成。換職業時基礎值會被覆蓋，種族加成不會消失。
   - 護甲值、中度 / 重度傷害閾值：基礎值直接讀目前裝備的護甲（護甲區的「基礎護甲值」「基礎傷害閾值」），
     再疊加等級（閾值）、力量（護甲值寫「3 + 力」時）、種族加成。角色資料存的是「手動調整」的差額，
     所以換護甲時數字會自動跟著變。
   依賴 origin-rules.js（findAncestry）與 class-rules.js（classKey）。 */

// 各項數值存在角色資料裡的欄位。護甲值與閾值存的是手動調整的差額（預設 0）。
const STAT_FIELDS = {
  evasion: 'evasion',
  hp: 'hpMax',
  stress: 'stressMax',
  armor: 'armorAdj',
  major: 'majorAdj',
  severe: 'severeAdj',
};
const ARMOR_STATS = ['armor', 'major', 'severe']; // 基礎值來自裝備的護甲

// 手動維護：種族每個特性的數值加成。陣列依序是「特性 1、特性 2」，沒有數值加成的填 null。
// 數字是固定加成；'proficiency' 表示等於熟練值（會隨熟練值變動）。
// 混合血統只取「種族 A 的特性 1」與「種族 B 的特性 2」，所以加成要記在特性上，不是整個種族。
// 只收錄永久、無條件的數值加成。有條件的（例如妖精翅膀的閃避 +2）與要另外選擇對象的
// （例如智械的經歷 +1）不在這裡。
const ANCESTRY_BONUS = {
  '巨人 Giant': [{ hp: 1 }, null], // 耐力：額外生命槽
  '人類 Human': [{ stress: 1 }, null], // 高耐力：額外壓力槽
  '塞米亞 Simiah': [null, { evasion: 1 }], // 靈活：閃避值永久 +1
  '加拉帕 Galapa': [{ major: 'proficiency', severe: 'proficiency' }, null], // 龜甲：傷害閾值 + 熟練值
  '元素：大地族 Earthkin': [{ armor: 1, major: 1, severe: 1 }, null], // 石膚：護甲值與傷害閾值 +1
};

// 種族加成：[{ source:'種族', stat:'hp', value:1 }, ...]
function ancestryEntries(c) {
  const out = [];
  const add = (ability) => {
    Object.entries(ability || {}).forEach(([stat, v]) => {
      const value = v === 'proficiency' ? Number(c.proficiency) || 1 : v;
      if (value) out.push({ source: '種族', stat, value });
    });
  };
  const a = findAncestry(c.ancestry);
  if (!a) return out;
  if (!a.mixed) {
    (ANCESTRY_BONUS[a.name] || []).forEach(add);
  } else {
    const [x, y] = c.ancestryMix.map(findAncestry);
    if (x && y && !x.mixed && !y.mixed && classKey(x.name) !== classKey(y.name)) {
      add((ANCESTRY_BONUS[x.name] || [])[0]);
      add((ANCESTRY_BONUS[y.name] || [])[1]);
    }
  }
  return out;
}

// 從護甲區的文字讀出基礎值。基礎護甲值可能是「3」或「3 + 力」，基礎傷害閾值是「5 / 11」。
function armorBase(c, stat) {
  const a = c.armor || {};
  if (stat === 'armor') return parseInt(String(a.baseScore || '').match(/\d+/)?.[0], 10) || 0;
  const m = String(a.baseThreshold || '').match(/\d+/g) || [];
  return parseInt(m[stat === 'major' ? 0 : 1], 10) || 0;
}

// 某項數值的所有來源：[{ value, source }, ...]，合計就是全部相加
function statParts(c, stat) {
  const stored = Number(c[STAT_FIELDS[stat]]) || 0;
  const parts = [];
  if (ARMOR_STATS.includes(stat)) {
    parts.push({ value: armorBase(c, stat), source: '護甲' });
    if (stat === 'armor' && /\+\s*力/.test(String(c.armor?.baseScore || ''))) {
      parts.push({ value: Number(c.attrs?.str?.value) || 0, source: '力量' });
    }
    if (stat !== 'armor') parts.push({ value: Number(c.level) || 1, source: '等級' });
  } else {
    parts.push({ value: stored, source: '職業' });
  }
  ancestryEntries(c).filter((e) => e.stat === stat).forEach((e) => parts.push({ value: e.value, source: e.source }));
  if (ARMOR_STATS.includes(stat)) parts.push({ value: stored, source: '手動' });
  return parts;
}

const statTotal = (c, stat) => statParts(c, stat).reduce((sum, p) => sum + p.value, 0);

// 使用者直接在欄位輸入合計時，反推要存回去的值（存的欄位 = 輸入的合計 − 其他來源）
const statStoredFromTotal = (c, stat, total) => total - (statTotal(c, stat) - (Number(c[STAT_FIELDS[stat]]) || 0));

// 分項說明，只列「數字(來源)」。第一項一定顯示，其餘數值是 0 的省略。
function statTitle(c, stat) {
  const parts = statParts(c, stat);
  return parts
    .filter((p, i) => i === 0 || p.value !== 0)
    .map((p, i) => `${i === 0 || p.value < 0 ? '' : '+'}${p.value}(${p.source})`)
    .join('');
}
