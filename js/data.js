/* 常數、預設資料、共用小工具 */

const ATTRS = [
  { key: 'agi', label: '敏捷' },
  { key: 'str', label: '力量' },
  { key: 'fin', label: '技巧' },
  { key: 'ins', label: '直覺' },
  { key: 'pre', label: '風采' },
  { key: 'kno', label: '知識' },
];

const MAX_PREPARED = 5;

// 範例武器。之後換成 Excel 武器分頁的完整資料即可。
// damage 的骰數代表「乘以熟練值」，例如 d8+4 在熟練值 3 時為 3d8+4。
const WEAPONS = [
  { name: '(範例) 武器 A', trait: '敏捷', range: '近戰', damage: 'd8+4', type: '物理', features: '' },
  { name: '(範例) 武器 B', trait: '力量', range: '近戰', damage: 'd12', type: '物理', features: '' },
  { name: '(範例) 武器 C', trait: '技巧', range: '遠距離', damage: 'd4+6', type: '物理', features: '' },
];

const EFFECT_TARGETS = [
  { value: 'none', label: '無（僅記錄）' },
  { value: 'damage', label: '加到傷害' },
  { value: 'check', label: '加到檢定' },
  { value: 'standalone', label: '獨立傷害（法術）' },
];

function emptyWeapon() {
  return { name: '', trait: '', features: '', range: '', damage: '', type: '' };
}

const TEMPLATES = {
  experiences: () => ({ name: '', bonus: 2 }),
  inventoryWeapons: () => emptyWeapon(),
  domainCards: () => ({
    domain: '',
    type: '',
    recall: 0,
    prepared: false,
    name: '',
    desc: '',
    fx: { target: 'none', formula: '', scaleProf: false, condLabel: '', condFormula: '' },
  }),
  items: () => ({ name: '', qty: 1, desc: '' }),
  traits: () => ({ source: '', name: '', desc: '' }),
};

function blankCharacter() {
  const attrs = {};
  ATTRS.forEach((a) => {
    attrs[a.key] = { value: 0, marked: false };
  });
  return {
    id: '',
    name: '新角色',
    player: '',
    ancestry: '',
    background: '',
    class1: '',
    class2: '',
    sub1: '',
    sub2: '',
    level: 1,
    portrait: '',
    evasion: 0,
    armorSlots: 0,
    armorMarked: 0,
    attrs,
    proficiency: 1,
    majorThreshold: 1,
    severeThreshold: 1,
    hpMax: 6,
    hpMarked: 0,
    stressMax: 6,
    stressMarked: 0,
    hopeMarked: 2,
    hopeFeature: '',
    experiences: [TEMPLATES.experiences()],
    weapons: { main: emptyWeapon(), off: emptyWeapon() },
    inventoryWeapons: [emptyWeapon(), emptyWeapon()],
    armor: { name: '', baseThreshold: '', features: '', baseScore: '' },
    domains: ['', ''],
    domainCards: [],
    gold: '',
    backstory: '',
    resources: '',
    transformation: '',
    items: [],
    traits: [],
  };
}

// 第一次開啟時的示範角色（對照使用者提供的空白角色卡）
function sampleCharacter() {
  const c = blankCharacter();
  c.name = '範例角色';
  c.class1 = '盜賊 Rogue';
  c.sub1 = '辛迪加 Syndicate';
  c.domains = ['午夜 Midnight', '寓言 Grace'];
  c.gold = '10G';
  c.hopeFeature = '【閃身伎倆】花費 3 希望點，直到下次攻擊成功命中你之前，你的閃避值獲得 +2 加值。否則，此加值持續到你下次休息。';
  c.items = [
    { name: '冒險者套組', qty: 1, desc: '火把、50英尺長的繩索、基本補給品（帳篷、睡袋、火絨盒、口糧等）' },
    { name: '小型治療藥劑', qty: 1, desc: '恢復 1d4 生命點' },
    { name: '小型精力藥', qty: 1, desc: '減少 1d4 壓力' },
  ];
  c.domainCards = [
    {
      domain: '午夜 Midnight',
      type: '法術',
      recall: 1,
      prepared: true,
      name: '滂沱劍雨',
      desc: '花費 1 希望點進行一次施法檢定，召喚出數把投擲利劍，攻擊鄰近範圍內的所有目標。你成功對抗的目標將受到使用你的熟練值的 d8+2 點魔法傷害。如果你命中的目標處於脆弱狀態，其會額外受到 1d8 點傷害。',
      fx: { target: 'standalone', formula: 'd8+2', scaleProf: true, condLabel: '目標處於脆弱', condFormula: '1d8' },
    },
  ];
  return c;
}

/* ---------- 共用小工具 ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function uid() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, val) {
  const keys = path.split('.');
  if (keys.some((k) => UNSAFE_KEYS.includes(k))) return;
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = val;
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2500);
}

// 補齊缺少的欄位（舊資料或匯入資料用）
function fillDefaults(target, defaults) {
  Object.keys(defaults).forEach((k) => {
    const d = defaults[k];
    if (target[k] === undefined || target[k] === null) {
      target[k] = JSON.parse(JSON.stringify(d));
    } else if (d && typeof d === 'object' && !Array.isArray(d) && typeof target[k] === 'object') {
      fillDefaults(target[k], d);
    }
  });
  return target;
}

function normalizeCharacter(c) {
  fillDefaults(c, blankCharacter());
  ['experiences', 'inventoryWeapons', 'domainCards', 'items', 'traits'].forEach((k) => {
    if (!Array.isArray(c[k])) c[k] = [];
    c[k] = c[k].map((it) => fillDefaults(it && typeof it === 'object' ? it : {}, TEMPLATES[k]()));
  });
  if (!Array.isArray(c.domains)) c.domains = ['', ''];
  if (!c.id) c.id = uid();
  return c;
}
