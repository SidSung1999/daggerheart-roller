/* 升級規則（依據 data/ 的升級表 PDF）：各階級的選項與格數、升級時要套用的效果。只做資料運算，不碰畫面。

   重點：角色資料裡存的永遠是「目前的結果」（屬性、HP 上限、閃避、熟練值…已經含升級）。
   升級精靈只對「從 N 級升到 N+1 級」這一步套用差額；直接匯入或修改等級不會重複套用任何升級效果。
   每個階級已經選過哪些選項，另外記在角色資料的 upgrades（升級紀錄），用來判斷還能選什麼。
   匯入的高等級角色沒有升級紀錄時，可以在角色卡的「升級紀錄」補登（只記錄，不改數值）。
   依賴 data.js（tierOfLevel、TEMPLATES）、class-rules.js（currentSubclass、applySubclassTier）。 */

const LEVEL_MAX = 10;

// 各階級的升級選項。cap：該階級最多可選幾次；width：畫面上每次選擇要標記幾格。
const UPGRADE_OPTIONS = [
  { key: 'attr', short: '屬性', label: '兩項未升級的角色屬性 +1，並勾選對應的升級標記', cap: 3, tiers: [2, 3, 4] },
  { key: 'hp', short: 'HP 上限', label: '永久增加一個生命點上限', cap: 2, tiers: [2, 3, 4] },
  { key: 'stress', short: '壓力上限', label: '永久增加一個壓力上限', cap: 2, tiers: [2, 3, 4] },
  { key: 'exp', short: '經歷', label: '選擇兩項經歷，各 +1 加值', cap: 1, tiers: [2, 3, 4] },
  { key: 'card', short: '領域卡', label: '獲得一張不高於目前等級的領域卡（已兼職時，可從兼職領域選等級不高於目前等級一半的卡）', cap: 1, tiers: [2, 3, 4] },
  { key: 'evasion', short: '閃避值', label: '閃避值 +1', cap: 1, tiers: [2, 3, 4] },
  { key: 'sub', short: '升級子職業', label: '升級子職業：獲得子職業的進階特性（會同時佔用「兼職」選項）', cap: 1, tiers: [3, 4] },
  { key: 'prof', short: '熟練值', label: '熟練值 +1（同時標記兩格）', cap: 1, width: 2, tiers: [3, 4] },
  { key: 'multi', short: '兼職', label: '兼職（同時標記兩格）：獲得額外的職業、子職業與一個領域，並佔用「升級子職業」；此後不能再選兼職', cap: 1, width: 2, tiers: [3, 4] },
];

const UPGRADE_TIERS = [2, 3, 4];
const upKey = (tier) => 't' + tier;
const optionsOfTier = (tier) => UPGRADE_OPTIONS.filter((o) => o.tiers.includes(tier));
const isTierStart = (level) => level === 2 || level === 5 || level === 8; // 到達 2、5、8 級時多一次階級獎勵

// 空的升級紀錄：{ t2: { attr: 0, ... }, t3: { ... }, t4: { ... } }，數字是「選了幾次」
function blankUpgrades() {
  const out = {};
  UPGRADE_TIERS.forEach((t) => {
    out[upKey(t)] = {};
    optionsOfTier(t).forEach((o) => (out[upKey(t)][o.key] = 0));
  });
  return out;
}

const upgradeUsed = (c, tier, key) => Number(c.upgrades?.[upKey(tier)]?.[key]) || 0;
// 選一次要算幾個選項：熟練值與兼職一次標記兩格，所以選了就用掉全部 2 個名額
const pickWeight = (key) => UPGRADE_OPTIONS.find((o) => o.key === key)?.width || 1;
const upgradeTotal = (c, key) => UPGRADE_TIERS.reduce((sum, t) => sum + upgradeUsed(c, t, key), 0);
const picksRecorded = (c, tier) => optionsOfTier(tier).reduce((sum, o) => sum + upgradeUsed(c, tier, o.key) * pickWeight(o.key), 0);

// 升到該等級為止，這個階級應該已經用掉幾個名額（每次升級 2 個；熟練值、兼職一次用掉 2 個）
function picksExpected(level, tier) {
  const lv = Math.max(1, Math.min(LEVEL_MAX, Number(level) || 1));
  const [from, to] = { 2: [1, 4], 3: [4, 7], 4: [7, 10] }[tier];
  return 2 * Math.max(0, Math.min(lv, to) - from);
}

const isMulticlassed = (c) => upgradeTotal(c, 'multi') > 0 || String(c.class2 || '').trim() !== '';

// 該階級某選項還能再選幾次（0 表示不能選）
function upgradeLeft(c, tier, key) {
  const opt = UPGRADE_OPTIONS.find((o) => o.key === key);
  if (!opt || !opt.tiers.includes(tier)) return 0;
  // 升級子職業與兼職共用格子：其中一個選了，另一個在同階級就不能選
  if ((key === 'sub' || key === 'multi') && upgradeUsed(c, tier, 'sub') + upgradeUsed(c, tier, 'multi') > 0) return 0;
  if (key === 'multi' && isMulticlassed(c)) return 0;
  return Math.max(0, opt.cap - upgradeUsed(c, tier, key));
}

// 畫面上要填滿幾格（用來畫升級紀錄的勾選格）
function upgradeBoxesFilled(c, tier, key) {
  const opt = UPGRADE_OPTIONS.find((o) => o.key === key);
  const used = upgradeUsed(c, tier, key);
  if (key === 'sub') return upgradeUsed(c, tier, 'sub') + upgradeUsed(c, tier, 'multi') > 0 ? 1 : 0;
  if (key === 'multi') return upgradeUsed(c, tier, 'sub') + upgradeUsed(c, tier, 'multi') > 0 ? 2 : 0;
  return used * (opt.width || 1);
}

// 手動補登：點一格切換紀錄（只改紀錄，不改角色數值）
function toggleUpgradeBox(c, tier, key, index) {
  const opt = UPGRADE_OPTIONS.find((o) => o.key === key);
  if (!opt) return;
  const u = c.upgrades[upKey(tier)];
  if (key === 'sub' || key === 'multi') {
    const was = u.sub + u.multi > 0;
    u.sub = 0;
    u.multi = 0;
    if (!was) u[key] = 1;
  } else if (opt.width === 2) {
    u[key] = u[key] ? 0 : 1;
  } else {
    u[key] = index < u[key] ? index : index + 1;
  }
}

/* ---------- 升級精靈 ---------- */

// sel = { counts: { hp: 1, evasion: 1 }, attrs: ['str', 'kno'], exps: [0, 2] }
// 回傳錯誤訊息字串，沒有問題則回傳空字串
function validateLevelUp(c, sel) {
  const level = Number(c.level) || 1;
  const to = level + 1;
  if (to > LEVEL_MAX) return `已經是最高等級（${LEVEL_MAX} 級）`;
  const tier = tierOfLevel(to);
  const counts = sel.counts || {};
  const keys = Object.keys(counts).filter((k) => counts[k] > 0);
  const total = keys.reduce((sum, k) => sum + counts[k] * pickWeight(k), 0);
  if (total !== 2) return `請選滿 2 個名額（熟練值、兼職一次算 2 個；目前 ${total} 個）`;

  for (const k of keys) {
    if (counts[k] > upgradeLeft(c, tier, k)) return `「${UPGRADE_OPTIONS.find((o) => o.key === k).short}」在這個階級已經不能再選了`;
  }
  if ((counts.sub || 0) + (counts.multi || 0) > 1) return '升級子職業與兼職只能選其中一個';

  if (counts.attr) {
    const attrs = sel.attrs || [];
    if (attrs.length !== counts.attr * 2) return `請選擇 ${counts.attr * 2} 項屬性（目前 ${attrs.length} 項）`;
    if (new Set(attrs).size !== attrs.length) return '屬性不能重複';
    const cleared = to === 5 || to === 8; // 到 5、8 級時先清除升級標記，所以都可以選
    for (const a of attrs) {
      if (!c.attrs[a]) return '屬性不存在';
      if (!cleared && c.attrs[a].marked) return '只能選還沒升級過的屬性';
    }
  }
  if (counts.exp) {
    const named = c.experiences.map((e, i) => (String(e.name || '').trim() ? i : -1)).filter((i) => i >= 0);
    const exps = sel.exps || [];
    const need = Math.min(2, named.length);
    if (!named.length) return '還沒有填寫名稱的經歷';
    if (exps.length !== need) return `請選擇 ${need} 項經歷（目前 ${exps.length} 項）`;
    if (new Set(exps).size !== exps.length || exps.some((i) => !named.includes(i))) return '經歷選擇不正確';
  }
  if (counts.sub && !currentSubclass(c)) return '升級子職業需要先在表頭選好職業與子職業';
  return '';
}

// 套用升級。回傳 { ok, error, changes: [...], reminders: [...] }
function applyLevelUp(c, sel) {
  const error = validateLevelUp(c, sel);
  if (error) return { ok: false, error, changes: [], reminders: [] };

  const to = (Number(c.level) || 1) + 1;
  const tier = tierOfLevel(to);
  const counts = sel.counts;
  const changes = [`等級 ${to - 1} → ${to}（階級 ${tier}）`];
  const reminders = [];

  c.level = to;

  // 階級獎勵：到達 2、5、8 級
  if (isTierStart(to)) {
    c.experiences.push({ ...TEMPLATES.experiences(), bonus: 2 });
    c.proficiency = (Number(c.proficiency) || 1) + 1;
    changes.push('階級獎勵：新增一項 +2 經歷、熟練值 +1');
    reminders.push('請替新增的經歷填上名稱');
    if (to === 5 || to === 8) {
      ATTRS.forEach((a) => (c.attrs[a.key].marked = false));
      changes.push('清除所有屬性升級標記');
    }
  }

  const attrLabel = (k) => ATTRS.find((a) => a.key === k).label;
  if (counts.attr) {
    sel.attrs.forEach((k) => {
      c.attrs[k].value = (Number(c.attrs[k].value) || 0) + 1;
      c.attrs[k].marked = true;
    });
    changes.push(`屬性 +1：${sel.attrs.map(attrLabel).join('、')}（已勾選升級標記）`);
  }
  if (counts.hp) {
    c.hpMax = (Number(c.hpMax) || 0) + counts.hp;
    changes.push(`HP 上限 +${counts.hp}`);
  }
  if (counts.stress) {
    c.stressMax = (Number(c.stressMax) || 0) + counts.stress;
    changes.push(`壓力上限 +${counts.stress}`);
  }
  if (counts.exp) {
    sel.exps.forEach((i) => (c.experiences[i].bonus = (Number(c.experiences[i].bonus) || 0) + 1));
    changes.push(`經歷 +1：${sel.exps.map((i) => c.experiences[i].name).join('、')}`);
  }
  if (counts.evasion) {
    c.evasion = (Number(c.evasion) || 0) + counts.evasion;
    changes.push(`閃避值 +${counts.evasion}`);
  }
  if (counts.prof) {
    c.proficiency = (Number(c.proficiency) || 1) + counts.prof;
    changes.push(`熟練值 +${counts.prof}`);
  }
  if (counts.sub) {
    const sub = currentSubclass(c);
    const kind = tier === 3 ? 'specialization' : 'mastery'; // 階級 3 取得專精特性，階級 4 取得大師特性
    applySubclassTier(c, sub, kind);
    changes.push(`子職業升級：已加入「${sub.name}」的${TIER_LABEL[kind]}特性`);
  }
  if (counts.multi) {
    reminders.push('兼職：請在表頭選擇職業 Ⅱ 與子職業 Ⅱ，並從兼職領域挑一張等級不高於目前等級一半的領域卡');
  }
  if (counts.card) {
    reminders.push(`領域卡選項：再多選一張不高於 ${to} 級的領域卡`);
  }

  changes.push('傷害閾值 +1（等級提高，自動計算）');
  reminders.push(`每次升級都要選一張不高於 ${to} 級的領域卡（可用領域卡區的卡片庫）`);

  // 記錄這個階級用掉的選項
  const u = c.upgrades[upKey(tier)];
  Object.keys(counts).forEach((k) => {
    if (counts[k] > 0) u[k] = (Number(u[k]) || 0) + counts[k];
  });

  return { ok: true, error: '', changes, reminders };
}
