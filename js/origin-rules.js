/* 種族 / 背景：查詢，以及把資料套用到角色（依賴 origins.js 的 ANCESTRIES、BACKGROUNDS，
   以及 class-rules.js 的 classKey、setAutoTraits、removeAuto）。只做資料運算，不碰畫面。 */

// 比對時只看第一個詞，所以輸入「矮人」或「矮人 Dwarf」都找得到
function findAncestry(text) {
  const k = classKey(text);
  return k ? ANCESTRIES.find((a) => classKey(a.name) === k) : undefined;
}

function findBackground(text) {
  const k = classKey(text);
  return k ? BACKGROUNDS.find((b) => classKey(b.name) === k) : undefined;
}

function findTransformation(text) {
  const k = classKey(text);
  return k ? TRANSFORMATIONS.find((t) => classKey(t.name) === k) : undefined;
}

const isMixedAncestry = (text) => !!findAncestry(text)?.mixed;

// 一般種族可以拿來混合（排除「混合血統」本身）
const mixableAncestries = () => ANCESTRIES.filter((a) => !a.mixed);

/* ---------- 套用到角色 ---------- */

// 套用種族：兩個種族特性加入角色特性。選「混合血統」時不加入特性，要再選兩個種族（見 applyMix）。
function applyAncestry(c, a) {
  c.ancestry = a.name;
  c.ancestryMix = ['', ''];
  c.ancestryMixName = '';
  removeAuto(c, ['ancestry']);
  if (!a.mixed) {
    setAutoTraits(c, 'ancestry', a.abilities.map((ab) => ({ source: '種族', name: ab.name, desc: ab.desc })));
  }
}

// 混合血統：特性 1 取自種族 A、特性 2 取自另一個種族 B。兩個都選好且不同才加入。
function applyMix(c) {
  const [nameA, nameB] = c.ancestryMix;
  const a = findAncestry(nameA);
  const b = findAncestry(nameB);
  removeAuto(c, ['ancestry']);
  if (!a || !b || a.mixed || b.mixed || classKey(a.name) === classKey(b.name)) return false;
  setAutoTraits(c, 'ancestry', [
    { source: `種族・${classKey(a.name)}`, name: a.abilities[0].name, desc: a.abilities[0].desc },
    { source: `種族・${classKey(b.name)}`, name: b.abilities[1].name, desc: b.abilities[1].desc },
  ]);
  return true;
}

// 套用轉變：兩個轉變能力加入角色特性
function applyTransformation(c, t) {
  c.transformation = t.name;
  setAutoTraits(c, 'transformation', t.abilities.map((ab) => ({ source: '轉變', name: ab.name, desc: ab.desc })));
}

// 套用背景：背景能力加入角色特性
function applyBackground(c, b) {
  c.background = b.name;
  setAutoTraits(c, 'background', [{ source: '背景', name: b.ability, desc: b.desc }]);
}
