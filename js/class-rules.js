/* 職業 / 子職：查詢，以及把職業資料套用到角色（依賴 classes.js 的 CLASSES、SUBCLASSES）。
   這裡只做資料運算，不碰畫面。 */

const classKey = (s) => String(s == null ? '' : s).trim().split(/\s+/)[0]; // 「盜賊 Rogue」->「盜賊」

// 比對時只看第一個詞，所以輸入「盜賊」或「盜賊 Rogue」都找得到
function findClass(text) {
  const k = classKey(text);
  return k ? CLASSES.find((c) => classKey(c.name) === k) : undefined;
}

function subclassesOf(className) {
  const k = classKey(className);
  return k ? SUBCLASSES.filter((s) => classKey(s.class) === k) : [];
}

// className 有值時只在該職業的子職中找
function findSubclass(text, className) {
  const k = classKey(text);
  if (!k) return undefined;
  const pool = className ? subclassesOf(className) : SUBCLASSES;
  return pool.find((s) => classKey(s.name) === k);
}

// 目前角色的主職業與子職（兩者都認得時才回傳）
function currentSubclass(c) {
  const cls = findClass(c.class1);
  return cls ? findSubclass(c.sub1, cls.name) : undefined;
}

// 把「【名稱】描述【名稱】描述」切成多筆
function splitTraits(text) {
  const marks = [...String(text || '').matchAll(/【([^】]+)】/g)];
  const src = String(text || '');
  if (!marks.length) return src.trim() ? [{ name: '', desc: src.trim() }] : [];
  const out = [];
  const lead = src.slice(0, marks[0].index).trim();
  if (lead) out.push({ name: '', desc: lead });
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    out.push({ name: m[1].trim(), desc: src.slice(m.index + m[0].length, end).trim() });
  });
  return out;
}

/* ---------- 套用到角色 ---------- */

// 自動加入的特性以 auto 欄位標記種類，之後換職業 / 子職時可以只替換這些列，不動玩家自己寫的。
// 子職 Ⅰ 用 foundation / specialization / mastery；兼職（職業 Ⅱ、子職 Ⅱ）用 class2 與 multiclass 系列。
const AUTO_ORDER = [
  'ancestry', 'background', 'transformation',
  'class', 'foundation', 'specialization', 'mastery',
  'class2', 'multiclass', 'multiclass-specialization', 'multiclass-mastery',
  'beastform', // 德魯伊野獸型態的能力，變身時加入、解除時移除（見 beast-rules.js）
];
const SUB1_KINDS = ['foundation', 'specialization', 'mastery'];
const SUB2_KINDS = { foundation: 'multiclass', specialization: 'multiclass-specialization', mastery: 'multiclass-mastery' };
const TIER_LABEL = { foundation: '基礎', specialization: '專精', mastery: '大師' };

function setAutoTraits(c, kind, rows) {
  c.traits = c.traits.filter((t) => t.auto !== kind);
  const rank = AUTO_ORDER.indexOf(kind);
  let at = 0;
  c.traits.forEach((t, i) => {
    if (t.auto && AUTO_ORDER.indexOf(t.auto) < rank) at = i + 1;
  });
  const made = rows.map((r) => {
    const t = { ...TEMPLATES.traits(), ...r, auto: kind };
    applyTraitFx(t); // 套用這個特性的預設擲骰設定（如果有）
    return t;
  });
  c.traits.splice(at, 0, ...made);
}

const removeAuto = (c, kinds) => {
  c.traits = c.traits.filter((t) => !kinds.includes(t.auto));
};
const clearSubclassTraits = (c) => removeAuto(c, SUB1_KINDS);
const clearMulticlassTraits = (c) => removeAuto(c, Object.values(SUB2_KINDS)); // 子職 Ⅱ 的特性
const clearClass2Traits = (c) => removeAuto(c, ['class2']); // 職業 Ⅱ 的職業特性

// 套用職業：閃避、HP、領域、希望特性、職業特性。換成別的職業時，原本屬於其他職業的子職會被清掉。
function applyClass(c, cls) {
  c.class1 = cls.name;
  // 職業給的是 1 級的基礎值；升級選過的「閃避 / HP 上限」要保留，所以加回升級紀錄裡的次數
  c.evasion = cls.evasion + upgradeTotal(c, 'evasion');
  c.hpMax = cls.hp + upgradeTotal(c, 'hp');
  c.domains = [...cls.domains];
  c.hopeFeature = cls.hopeFeature;
  setAutoTraits(c, 'class', splitTraits(cls.features).map((t) => ({ source: '職業', ...t })));

  const known = findSubclass(c.sub1);
  if (known && classKey(known.class) !== classKey(cls.name)) {
    c.sub1 = '';
    clearSubclassTraits(c);
  }
}

// 選定子職：先清掉舊子職的自動特性，再加入基礎特性
function applySubclass(c, sub) {
  c.sub1 = sub.name;
  clearSubclassTraits(c);
  applySubclassTier(c, sub, 'foundation');
}

/* ---------- 兼職（職業 Ⅱ / 子職 Ⅱ） ----------
   兼職不會改閃避、HP、主職業的領域或希望特性。
   選了職業 Ⅱ 會帶入它的兩個領域與職業特性；選了子職 Ⅱ 會加入它的基礎特性；
   專精、大師特性和子職 Ⅰ 一樣用按鈕加入。 */

function applyClass2(c, cls) {
  c.class2 = cls.name;
  c.domains2 = [...cls.domains];
  setAutoTraits(c, 'class2', splitTraits(cls.features).map((t) => ({ source: '兼職・職業', ...t })));

  const known = findSubclass(c.sub2);
  if (known && classKey(known.class) !== classKey(cls.name)) {
    c.sub2 = '';
    clearMulticlassTraits(c);
  }
}

function applySubclass2(c, sub) {
  c.sub2 = sub.name;
  clearMulticlassTraits(c);
  applySubclassTier(c, sub, 'foundation', 2);
}

// 目前角色的職業 Ⅱ 與子職 Ⅱ（兩者都認得時才回傳）
function currentSubclass2(c) {
  const cls = findClass(c.class2);
  return cls ? findSubclass(c.sub2, cls.name) : undefined;
}

// 加入（或替換）子職某一階段的特性：tier 為 foundation / specialization / mastery，slot 1 是子職 Ⅰ、2 是子職 Ⅱ（兼職）
function applySubclassTier(c, sub, tier, slot = 1) {
  const label = `${slot === 2 ? '兼職' : '子職'}・${TIER_LABEL[tier]}`;
  const rows = splitTraits(sub[tier]).map((t) => ({ source: label, ...t }));
  setAutoTraits(c, slot === 2 ? SUB2_KINDS[tier] : tier, rows);
  return rows.length;
}
