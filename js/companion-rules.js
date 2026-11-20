/* 遊俠（馴獸師）的動物夥伴：資料、訓練選項與數值計算（依據 data/ 的遊俠夥伴角色卡 PDF）。只做資料運算，不碰畫面。

   角色資料存在 c.companion（見 data.js 的 blankCompanion）。
   - 傷害骰（die）、距離（range）、經歷加值存的是目前的結果；升級精靈選「聰慧」「兇猛」時直接改這些值。
   - 閃避值、壓力上限、角色的希望槽數由訓練次數算出來：
       閃避值 = 10 + 警覺 × 2 + 手動調整（evasionAdj）
       壓力上限 = 3 + 堅韌
       角色希望槽 = 6 + 黑暗中的光芒
   - 訓練次數記在 c.companion.training，角色卡上可以點格子補登（只改紀錄；閃避、壓力、希望格數會跟著變）。
   依賴 class-rules.js（classKey）。 */

const COMPANION_BASE_EVASION = 10;
const COMPANION_BASE_STRESS = 3;
const COMPANION_DICE = ['d6', 'd8', 'd10', 'd12'];
const COMPANION_RANGES = ['近戰', '鄰近', '近距離', '遠距離', '極遠'];

// 夥伴訓練：每次角色升級時選一項。cap 是最多可選幾次（PDF 上的格數）。
const COMPANION_TRAINING = [
  { key: 'clever', name: '聰慧', cap: 3, desc: '一項經歷獲得 +1。' },
  { key: 'light', name: '黑暗中的光芒', cap: 1, desc: '你的角色獲得額外一個希望槽。' },
  { key: 'armored', name: '裝甲', cap: 1, desc: '當你的夥伴受到傷害時，你可以自己標記一格護甲槽代替夥伴標記一點壓力。' },
  { key: 'vicious', name: '兇猛', cap: 3, desc: '增加你夥伴的傷害骰（如 d6 到 d8）或範圍（如近戰到鄰近）一個等級。' },
  { key: 'resilient', name: '堅韌', cap: 3, desc: '增加一個額外的壓力槽。' },
  { key: 'bonded', name: '羈絆', cap: 1, desc: '當你標記最後一個生命槽時，你的夥伴會衝到你身邊安慰你。擲出等同於他們可用壓力槽數量的 d6，並標記這些壓力。如果擲出 6，他們會讓你振作起來。清除你的最後一個生命槽並返回場景。' },
  { key: 'aware', name: '警覺', cap: 3, desc: '夥伴的閃避 +2。' },
];

function blankCompanion() {
  const training = {};
  COMPANION_TRAINING.forEach((t) => (training[t.key] = 0));
  return {
    name: '',
    desc: '',
    portrait: '',
    experiences: [{ name: '', bonus: 2 }, { name: '', bonus: 2 }],
    attack: '', // 攻擊方式（例如：撕咬）
    range: '近戰',
    die: 'd6',
    evasionAdj: 0, // 閃避值的手動調整
    stressMarked: 0,
    training,
  };
}

// 子職 Ⅰ 或子職 Ⅱ 是馴獸師時才有夥伴
const hasCompanion = (c) => [c.sub1, c.sub2].some((x) => classKey(x) === '馴獸師');

const trainingUsed = (c, key) => Number(c.companion?.training?.[key]) || 0;
const trainingLeft = (c, key) => {
  const t = COMPANION_TRAINING.find((x) => x.key === key);
  return t ? Math.max(0, t.cap - trainingUsed(c, key)) : 0;
};

// 夥伴閃避值的分項：[{ value, source }]，第一項是基礎值
function companionEvasionParts(c) {
  return [
    { value: COMPANION_BASE_EVASION, source: '基礎' },
    { value: trainingUsed(c, 'aware') * 2, source: '警覺' },
    { value: Number(c.companion?.evasionAdj) || 0, source: '手動' },
  ];
}
const companionEvasion = (c) => companionEvasionParts(c).reduce((s, p) => s + p.value, 0);
const companionEvasionTitle = (c) =>
  companionEvasionParts(c)
    .filter((p, i) => i === 0 || p.value !== 0)
    .map((p, i) => `${i === 0 || p.value < 0 ? '' : '+'}${p.value}(${p.source})`)
    .join('');

const companionStressMax = (c) => COMPANION_BASE_STRESS + trainingUsed(c, 'resilient');
// 角色的希望槽數：基本 6 格，有夥伴且選了「黑暗中的光芒」時多 1 格
const hopeMax = (c) => 6 + (hasCompanion(c) ? trainingUsed(c, 'light') : 0);

const stepUp = (list, v) => {
  const i = list.indexOf(v);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : null;
};

// 角色卡上點訓練格補登（只改紀錄）
function toggleTrainingBox(c, key, index) {
  const t = COMPANION_TRAINING.find((x) => x.key === key);
  if (!t) return;
  const cur = trainingUsed(c, key);
  c.companion.training[key] = Math.min(t.cap, index < cur ? index : index + 1);
}

/* ---------- 升級精靈 ----------
   sel.train：選的訓練 key；sel.trainExp：聰慧要加的夥伴經歷索引；sel.trainVicious：兇猛提升 'die' 或 'range' */

const anyTrainingLeft = (c) => COMPANION_TRAINING.some((t) => trainingLeft(c, t.key) > 0);

function companionTrainingError(c, sel) {
  if (!hasCompanion(c) || !anyTrainingLeft(c)) return '';
  const key = sel.train;
  if (!key) return '請選一項夥伴訓練';
  if (!trainingLeft(c, key)) return '這項夥伴訓練已經選滿了';
  const cp = c.companion;
  if (key === 'clever') {
    const e = cp.experiences[sel.trainExp];
    if (!e || !String(e.name || '').trim()) return '聰慧：請選一項有名稱的夥伴經歷';
  }
  if (key === 'vicious') {
    if (sel.trainVicious === 'die' && !stepUp(COMPANION_DICE, cp.die)) return '兇猛：傷害骰已經是最大（d12）';
    if (sel.trainVicious === 'range' && !stepUp(COMPANION_RANGES, cp.range)) return '兇猛：距離已經不能再提升';
    if (!['die', 'range'].includes(sel.trainVicious)) return '兇猛：請選擇提升傷害骰或距離';
  }
  return '';
}

// 套用訓練，回傳說明文字（沒有套用時回傳空字串）
function applyCompanionTraining(c, sel) {
  if (!hasCompanion(c) || !sel.train) return '';
  const t = COMPANION_TRAINING.find((x) => x.key === sel.train);
  const cp = c.companion;
  cp.training[t.key] = trainingUsed(c, t.key) + 1;
  let detail = '';
  if (t.key === 'clever') {
    const e = cp.experiences[sel.trainExp];
    e.bonus = (Number(e.bonus) || 0) + 1;
    detail = `：${e.name} +${e.bonus}`;
  } else if (t.key === 'vicious') {
    if (sel.trainVicious === 'die') {
      const from = cp.die;
      cp.die = stepUp(COMPANION_DICE, from);
      detail = `：傷害骰 ${from} → ${cp.die}`;
    } else {
      const from = cp.range;
      cp.range = stepUp(COMPANION_RANGES, from);
      detail = `：距離 ${from} → ${cp.range}`;
    }
  } else if (t.key === 'aware') detail = `：夥伴閃避值 ${companionEvasion(c)}`;
  else if (t.key === 'resilient') detail = `：夥伴壓力槽 ${companionStressMax(c)} 格`;
  else if (t.key === 'light') detail = `：希望槽 ${hopeMax(c)} 格`;
  return `夥伴訓練「${t.name}」${detail}`;
}
