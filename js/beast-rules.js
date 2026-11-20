/* 德魯伊野獸型態：查詢與套用（依賴 beastforms.js 的 BEASTFORMS、class-rules.js）。
   角色資料存：
     c.beastForm：選的型態名稱，空字串表示沒有變身
     c.beastPick：特殊型態的選擇 { base, forms, advantages, abilities }
       - 進化（special = evolve，傳說 / 神話巨獸）：base = 要強化的原型態
       - 混種（special = hybrid）：forms = 選的原型態，advantages = 選的優勢行動，
         abilities = 選的能力（「型態名稱|能力名稱」，因為不同型態可能有同名能力，例如載運）
   變身期間的效果都由這裡算出來，不改角色存的數值：
   - 閃避值、傷害閾值：在 stat-bonus.js 的分項裡多一項「野獸型態」
   - 屬性加值：只加在擲骰器的屬性按鈕上
   - 攻擊：擲骰器的傷害來源多一個「野獸型態攻擊」
   - 能力：以自動特性（auto = 'beastform'）加到角色特性，解除變身時移除 */

// 進化型態的加成：階級 3 傳說巨獸、階級 4 神話巨獸。damage 是固定加值（不乘熟練值）
const BEAST_EVOLVE = {
  3: { baseTiers: [1], damage: 6, attr: 1, evasion: 2, dieUp: false },
  4: { baseTiers: [1, 2], damage: 9, attr: 2, evasion: 3, dieUp: true },
};
// 混種型態：從哪些階級的一般型態挑、各挑幾個，變身時額外標記幾點壓力
const BEAST_HYBRID = {
  3: { baseTiers: [1, 2], forms: 2, advantages: 4, abilities: 2, stress: 1 },
  4: { baseTiers: [1, 2, 3], forms: 3, advantages: 5, abilities: 3, stress: 2 },
};
const BEAST_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];

const blankBeastPick = () => ({ base: '', forms: [], advantages: [], abilities: [] });

const isDruid = (c) => [c.class1, c.class2].some((x) => classKey(x) === '德魯伊');

const findBeastForm = (name) => {
  const n = String(name || '').trim();
  return n ? BEASTFORMS.find((f) => f.name === n) : undefined;
};
const findNormalForm = (name) => {
  const f = findBeastForm(name);
  return f && !f.special ? f : undefined;
};

// 角色目前階級可以選的型態（階級不超過角色的階級，含進化與混種）
const beastFormsFor = (c) => BEASTFORMS.filter((f) => f.tier <= tierOfLevel(Number(c.level) || 1));

// 進化 / 混種可以選的原型態
const beastBaseChoices = (form) => {
  const rule = form.special === 'evolve' ? BEAST_EVOLVE[form.tier] : BEAST_HYBRID[form.tier];
  return rule ? BEASTFORMS.filter((f) => !f.special && rule.baseTiers.includes(f.tier)) : [];
};

const abilityKey = (formName, a) => `${formName}|${a.name}`;

// 混種：從選的原型態收集可選的優勢行動（去重）與能力
function hybridPool(c) {
  const forms = (c.beastPick.forms || []).map(findNormalForm).filter(Boolean);
  const advantages = [...new Set(forms.flatMap((f) => f.advantages))];
  const abilities = forms.flatMap((f) => f.abilities.map((a) => ({ key: abilityKey(f.name, a), from: f.name, ...a })));
  return { forms, advantages, abilities };
}

function dieUp(damage) {
  return damage.replace(/^d(\d+)/, (m) => {
    const i = BEAST_DICE.indexOf(m);
    return i >= 0 && i < BEAST_DICE.length - 1 ? BEAST_DICE[i + 1] : m;
  });
}
const addFlat = (damage, n) => {
  const m = damage.match(/^(d\d+)(?:\+(\d+))?$/);
  return m ? `${m[1]}+${(Number(m[2]) || 0) + n}` : damage;
};

/* 目前實際生效的型態。回傳統一的格式：
   { form, name, attr, attrBonus, evasion, attack, advantages, abilities, extraStress, note }
   特殊型態還沒選完時回傳 { form, incomplete: '說明' }；沒有變身回傳 undefined。 */
function resolveBeast(c) {
  const form = findBeastForm(c.beastForm);
  if (!form) return undefined;
  const pick = c.beastPick || blankBeastPick();
  if (!form.special) {
    return { form, name: form.name, attr: form.attr, attrBonus: form.attrBonus, evasion: form.evasion,
      attack: form.attack, advantages: form.advantages, abilities: form.abilities, extraStress: 0, note: '' };
  }
  if (form.special === 'evolve') {
    const rule = BEAST_EVOLVE[form.tier];
    const base = beastBaseChoices(form).find((f) => f.name === pick.base);
    if (!rule || !base) return { form, incomplete: '請選擇要進化的原型態' };
    let damage = base.attack.damage;
    if (rule.dieUp) damage = dieUp(damage);
    damage = addFlat(damage, rule.damage);
    return {
      form, name: `${form.name}（${base.name}）`, attr: base.attr, attrBonus: base.attrBonus + rule.attr,
      evasion: base.evasion + rule.evasion, attack: { ...base.attack, damage },
      advantages: base.advantages, abilities: base.abilities, extraStress: 0,
      note: `進化：傷害 +${rule.damage}${rule.dieUp ? '、骰型升一級' : ''}、${base.attr} +${rule.attr}、閃避值 +${rule.evasion}`,
    };
  }
  const rule = BEAST_HYBRID[form.tier];
  const pool = hybridPool(c);
  const advantages = pick.advantages.filter((a) => pool.advantages.includes(a));
  const abilities = pool.abilities.filter((a) => pick.abilities.includes(a.key));
  if (!rule) return { form, incomplete: '資料錯誤' };
  if (pool.forms.length !== rule.forms) return { form, incomplete: `請選 ${rule.forms} 種原型態（已選 ${pool.forms.length}）` };
  if (advantages.length !== rule.advantages) return { form, incomplete: `請選 ${rule.advantages} 項優勢行動（已選 ${advantages.length}）` };
  if (abilities.length !== rule.abilities) return { form, incomplete: `請選 ${rule.abilities} 項能力（已選 ${abilities.length}）` };
  return {
    form, name: `${form.name}（${pool.forms.map((f) => f.name).join('＋')}）`, attr: form.attr, attrBonus: form.attrBonus,
    evasion: form.evasion, attack: form.attack, advantages,
    abilities: abilities.map((a) => ({ name: a.name, desc: a.desc, from: a.from })),
    extraStress: rule.stress, note: `混種：變身時額外標記 ${rule.stress} 點壓力`,
  };
}

// 已經完整生效的型態（特殊型態還沒選完時回傳 undefined，不套用任何加成）
const currentBeast = (c) => {
  const b = resolveBeast(c);
  return b && !b.incomplete ? b : undefined;
};

// 能力裡寫明「你的傷害閾值 +N / -N」的固定加成（厚皮、物理防禦、無懼、中空骨骼）
function beastThresholdBonus(beast) {
  let sum = 0;
  (beast ? beast.abilities : []).forEach((a) => {
    const m = a.desc.match(/你的傷害閾值[^\d+\-−]*([+\-−])\s*(\d+)/);
    if (m) sum += (m[1] === '+' ? 1 : -1) * Number(m[2]);
  });
  return sum;
}

// 給 stat-bonus.js 用：[{ source:'野獸型態', stat, value }]
function beastEntries(c) {
  const b = currentBeast(c);
  if (!b) return [];
  const t = beastThresholdBonus(b);
  return [
    { stat: 'evasion', value: b.evasion },
    { stat: 'major', value: t },
    { stat: 'severe', value: t },
  ].filter((e) => e.value).map((e) => ({ ...e, source: '野獸型態' }));
}

// 屬性 key（agi、str…）在野獸型態下的加值
function beastAttrBonus(c, key) {
  const b = currentBeast(c);
  const a = b && ATTRS.find((x) => x.label === b.attr);
  return a && a.key === key ? b.attrBonus : 0;
}

// 依目前的型態與選擇，重新放入能力特性（特殊型態沒選完時先不放）
function refreshBeastTraits(c) {
  const b = currentBeast(c);
  const rows = b
    ? b.abilities.map((a) => ({ source: `野獸型態・${a.from || b.name}`, name: a.name, desc: a.desc }))
    : [];
  setAutoTraits(c, 'beastform', rows);
}

// 變身（name 為空字串表示解除）。換了型態時清掉特殊型態的選擇。回傳選到的型態資料。
function applyBeastForm(c, name) {
  const f = findBeastForm(name);
  const next = f ? f.name : '';
  if (next !== c.beastForm) c.beastPick = blankBeastPick();
  c.beastForm = next;
  refreshBeastTraits(c);
  return f;
}

// 特殊型態的選擇：kind = base / forms / advantages / abilities；on 為勾選或取消（base 直接指定）
function setBeastPick(c, kind, value, on = true) {
  const form = findBeastForm(c.beastForm);
  if (!form || !form.special) return '';
  const p = c.beastPick;
  if (kind === 'base') {
    p.base = value;
  } else {
    const rule = BEAST_HYBRID[form.tier];
    const limit = { forms: rule.forms, advantages: rule.advantages, abilities: rule.abilities }[kind];
    if (!limit) return '';
    const list = p[kind];
    const at = list.indexOf(value);
    if (on && at < 0) {
      if (list.length >= limit) return `最多選 ${limit} 項`;
      list.push(value);
    }
    if (!on && at >= 0) list.splice(at, 1);
    if (kind === 'forms') {
      // 換了原型態：移除已不在可選範圍內的優勢行動與能力
      const pool = hybridPool(c);
      p.advantages = p.advantages.filter((a) => pool.advantages.includes(a));
      p.abilities = p.abilities.filter((k) => pool.abilities.some((a) => a.key === k));
    }
  }
  refreshBeastTraits(c);
  return '';
}
