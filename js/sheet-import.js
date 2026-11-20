/* 從 Google 試算表的「匯出頁」匯入角色（一次性，匯入成一個新角色）。
   匯出頁的格式見 docs/匯出頁格式.md。

   原則：匯出頁填的是角色卡上印的數字（合計）；匯入時先把種族、職業、護甲等資料套用好，
   再用 stat-bonus.js 的換算，把合計還原成程式內存的基礎值，所以不會重複計算。
   匯入的角色不會套用任何升級效果，數值就是表單上的數值；升級紀錄另外填。
   依賴 data.js、levelup.js、class-rules.js、origin-rules.js、stat-bonus.js。 */
const GsImport = (() => {
  const SETTINGS_KEY = 'dh-gs-import';
  const RANGE = 'A1:H500';

  /* ---------- 讀取 Google 試算表 ---------- */

  function parseSheetId(url) {
    const m = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : '';
  }

  async function fetchRows({ url, tab, key }) {
    const id = parseSheetId(url);
    if (!id) throw new Error('網址看起來不是 Google 試算表（應該包含 /spreadsheets/d/…）');
    if (!String(key || '').trim()) throw new Error('請填入 Google API Key');
    const range = `'${String(tab || '匯出頁').replace(/'/g, "''")}'!${RANGE}`;
    const endpoint =
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}` +
      `?key=${encodeURIComponent(key.trim())}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;

    let res;
    try {
      res = await fetch(endpoint);
    } catch (e) {
      throw new Error('連不上 Google，請檢查網路');
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch (e) { /* 沒有 JSON 內容就略過 */ }
      if (res.status === 403) throw new Error('沒有權限：請確認試算表共用設為「知道連結的人可檢視」，且 API Key 允許從這個網址使用 Sheets API');
      if (res.status === 404) throw new Error('找不到這份試算表，請確認網址');
      if (res.status === 400 && /range|parse/i.test(detail)) throw new Error(`找不到分頁「${tab || '匯出頁'}」，請確認分頁名稱`);
      if (res.status === 400 && /key/i.test(detail)) throw new Error('API Key 無效');
      if (res.status === 429) throw new Error('Google 回應請求太頻繁，請稍後再試');
      throw new Error(`讀取失敗（${res.status}）${detail ? '：' + detail : ''}`);
    }
    const data = await res.json();
    return data.values || [];
  }

  /* ---------- 轉換成角色 ---------- */

  const norm = (s) => String(s ?? '').replace(/[\s\u3000]+/g, '').toLowerCase();
  const text = (v) => String(v ?? '').trim();
  // 取出第一個數字。接受 "+2"、全形數字、"−1"（減號符號不同）、"2 (熟練)" 這類寫法
  const NUMBER_RE = /[-+]?\d+(?:\.\d+)?/;
  const cleanNumberText = (v) =>
    String(v ?? '')
      .replace(/[−－–—]/g, '-')
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/,/g, '');
  const num = (v, fallback = 0) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
    const m = cleanNumberText(v).match(NUMBER_RE);
    return m ? Number(m[0]) : fallback;
  };
  const isNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && /^[-+]?\d+(\.\d+)?$/.test(cleanNumberText(v).trim()));
  const TRUE_WORDS = ['true', '是', 'yes', 'y', '1', '✓', '✔', '☑', 'v'];
  const FALSE_WORDS = ['false', '否', 'no', 'n', '0', '✗', '✘', '☐', 'x', '-'];
  const word = (v) => String(v ?? '').trim().toLowerCase();
  // 看起來像勾選值：勾選框（true/false）、是/否、1/0 等
  const isFlag = (v) => typeof v === 'boolean' || v === 1 || v === 0 || TRUE_WORDS.includes(word(v)) || FALSE_WORDS.includes(word(v));
  const bool = (v) => v === true || v === 1 || TRUE_WORDS.includes(word(v));

  const SINGLE_KEYS = ['角色名', '玩家', '種族', '背景', '轉變', '職業', '子職', '職業2', '子職2', '等級', '熟練值', '金幣', '角色設定', '個人資源',
    '閃避', 'HP上限', '壓力上限', '護甲值', '中度傷害閾值', '重度傷害閾值', 'HP已標記', '壓力已標記', '護甲已標記', '希望', '領域'];
  const LIST_KEYS = ['屬性', '經歷', '主手武器', '副手武器', '庫存武器', '護甲', '領域卡', '物品', '特性', '升級紀錄', '混合血統'];
  const KNOWN_KEYS = new Set([...SINGLE_KEYS, ...LIST_KEYS, '欄位'].map(norm));
  const LIST_KEY_SET = new Set(LIST_KEYS.map(norm));
  const ATTR_LABELS = new Set(ATTRS.map((a) => norm(a.label)));
  const DOMAIN_NAMES = [...new Set(DOMAIN_CARDS.map((x) => x.domain))];

  // 升級紀錄的選項名稱 → 程式內的 key。正式名稱見 docs/匯出頁格式.md，也接受下面這些簡寫
  const UP_ALIASES = {
    屬性: 'attr', 屬性升級: 'attr',
    hp上限: 'hp', hp: 'hp', 生命: 'hp', 生命點: 'hp', 生命上限: 'hp',
    壓力上限: 'stress', 壓力: 'stress',
    經歷: 'exp',
    領域卡: 'card', 領域: 'card', 領域卡牌: 'card',
    閃避: 'evasion', 閃避值: 'evasion',
    升級子職業: 'sub', 升級子職: 'sub', 子職升級: 'sub', 子職業升級: 'sub', 子職業: 'sub', 子職: 'sub',
    熟練值: 'prof', 熟練: 'prof',
    兼職: 'multi',
  };

  // rows：試算表讀回來的二維陣列。回傳 { character, warnings }
  function characterFromRows(rows) {
    const warnings = [];
    const warn = (m) => warnings.push(m);

    // A 欄是欄位名稱，B 欄以後是值；同名的列代表清單的多筆
    // 也接受兩種寫法：A 欄留白的列沿用上一列的欄位名稱；直接用屬性名稱當欄位名稱（敏捷 | 2 | TRUE）
    const table = new Map();
    const unknown = new Set();
    let lastKey = '';
    const push = (k, cells) => {
      if (!table.has(k)) table.set(k, []);
      table.get(k).push(cells);
    };
    rows.forEach((r) => {
      const k = norm(r[0]);
      if (!k) {
        if (lastKey && LIST_KEY_SET.has(lastKey) && r.slice(1).some((x) => text(x) !== '')) push(lastKey, r.slice(1));
        return;
      }
      lastKey = k;
      if (ATTR_LABELS.has(k)) {
        lastKey = norm('屬性');
        return push(lastKey, [text(r[0]), ...r.slice(1)]);
      }
      if (!KNOWN_KEYS.has(k)) unknown.add(text(r[0]));
      push(k, r.slice(1));
    });
    if (unknown.size) warn(`忽略不認得的欄位：${[...unknown].join('、')}`);
    const list = (key) => table.get(norm(key)) || [];
    const one = (key) => text(list(key)[0]?.[0]);
    const has = (key) => list(key).length > 0 && one(key) !== '';

    const c = blankCharacter();
    c.id = uid();
    c.items = []; // 匯入的角色以表單上的物品為準，不帶入新角色的初始物品

    /* 1. 基本資料 */
    c.name = one('角色名') || '匯入的角色';
    c.player = one('玩家');
    c.level = Math.max(1, Math.min(LEVEL_MAX, Math.round(num(one('等級'), 1))));
    if (num(one('等級'), 1) > LEVEL_MAX) warn(`等級超過 ${LEVEL_MAX}，已改成 ${LEVEL_MAX}`);
    if (has('熟練值')) c.proficiency = num(one('熟練值'), 1);
    c.gold = one('金幣');
    c.backstory = one('角色設定');
    c.resources = one('個人資源');

    /* 2. 升級紀錄（要在套用職業之前，因為套用職業時會把升級選過的閃避、HP 加回去） */
    list('升級紀錄').forEach((cells) => {
      const tier = num(cells[0]);
      const key = UP_ALIASES[norm(cells[1])];
      if (![2, 3, 4].includes(tier) || !key || !optionsOfTier(tier).some((o) => o.key === key)) {
        return warn(`升級紀錄看不懂，已略過：階級 ${text(cells[0])}、選項「${text(cells[1])}」（階級要填 2、3、4；選項可用：屬性、HP上限、壓力上限、經歷、領域卡、閃避、升級子職業、熟練值、兼職，其中升級子職業、熟練值、兼職只有階級 3、4）`);
      }
      c.upgrades[upKey(tier)][key] = num(cells[2], 1);
    });

    /* 3. 屬性 */
    // 每列：名稱、數值、已升級。欄位順序不拘：名稱是對得上屬性名稱的那格，數字是數值，勾選值是已升級
    const attrsRead = [];
    list('屬性').forEach((cells) => {
      const nameAt = cells.findIndex((x) => ATTRS.some((a) => a.label === text(x)));
      if (nameAt < 0) return warn(`屬性列看不懂，已略過：${cells.map(text).join(' | ')}（名稱要是 敏捷／力量／技巧／直覺／風采／知識）`);
      const a = ATTRS.find((x) => x.label === text(cells[nameAt]));
      const rest = cells.filter((_, i) => i !== nameAt);
      const numbers = rest.filter(isNumeric);
      const flag = rest.find((x) => typeof x === 'boolean') ?? rest.find((x) => typeof x === 'string' && isFlag(x)) ?? (numbers.length > 1 ? numbers[1] : undefined);
      c.attrs[a.key].value = numbers.length ? num(numbers[0]) : num(rest.find((x) => text(x) !== ''), 0);
      c.attrs[a.key].marked = bool(flag);
      attrsRead.push(a.key);
    });
    if (!list('屬性').length) {
      warn('匯出頁沒有「屬性」列，六項屬性都維持 0（格式：屬性 | 名稱 | 數值 | 已升級）');
    } else if (new Set(attrsRead).size < ATTRS.length) {
      const missing = ATTRS.filter((a) => !attrsRead.includes(a.key)).map((a) => a.label);
      warn(`屬性只讀到 ${new Set(attrsRead).size} 項，缺少：${missing.join('、')}`);
    }

    /* 4. 護甲（數值換算要用到） */
    const armorRow = list('護甲')[0];
    if (armorRow && text(armorRow[0])) {
      const name = text(armorRow[0]);
      const known = ARMORS.find((a) => a.name === name);
      if (known) {
        Object.assign(c.armor, { name: known.name, baseThreshold: `${known.major} / ${known.severe}`, features: known.features, baseScore: known.score });
      } else {
        c.armor.name = name;
        warn(`護甲「${name}」不在護甲清單裡，已當成自訂護甲（請確認基礎傷害閾值與基礎護甲值）`);
      }
      if (text(armorRow[1])) c.armor.baseThreshold = text(armorRow[1]);
      if (text(armorRow[2])) c.armor.features = text(armorRow[2]);
      if (text(armorRow[3])) c.armor.baseScore = text(armorRow[3]);
    }

    /* 5. 種族、背景、轉變 */
    const ancestryText = one('種族');
    if (ancestryText) {
      const a = findAncestry(ancestryText);
      if (a) {
        applyAncestry(c, a);
        if (a.mixed) {
          const mix = list('混合血統')[0] || [];
          c.ancestryMix = [text(mix[0]), text(mix[1])];
          c.ancestryMixName = text(mix[2]);
          if (!applyMix(c)) warn('混合血統需要兩個不同的種族（混合血統列：種族 A、種族 B），目前沒有加入種族特性');
        }
      } else {
        c.ancestry = ancestryText;
        warn(`找不到種族「${ancestryText}」，已當成自訂名稱，沒有帶入種族特性`);
      }
    }
    const backgroundText = one('背景');
    if (backgroundText) {
      const b = findBackground(backgroundText);
      if (b) applyBackground(c, b);
      else {
        c.background = backgroundText;
        warn(`找不到背景「${backgroundText}」，已當成自訂名稱`);
      }
    }
    const transformText = one('轉變');
    if (transformText) {
      const t = findTransformation(transformText);
      if (t) applyTransformation(c, t);
      else {
        c.transformation = transformText;
        warn(`找不到轉變「${transformText}」，已當成自訂名稱`);
      }
    }

    /* 6. 職業、子職、兼職 */
    const classText = one('職業');
    if (classText) {
      const cls = findClass(classText);
      if (cls) applyClass(c, cls);
      else {
        c.class1 = classText;
        warn(`找不到職業「${classText}」，已當成自訂名稱，沒有帶入閃避、HP、領域與職業特性`);
      }
    }
    const subText = one('子職');
    if (subText) {
      const sub = findSubclass(subText, findClass(c.class1)?.name);
      if (sub) {
        applySubclass(c, sub);
        // 升級紀錄裡有「升級子職業」：階級 3 的是專精特性、階級 4 的是大師特性
        if (upgradeUsed(c, 3, 'sub') > 0) applySubclassTier(c, sub, 'specialization');
        if (upgradeUsed(c, 4, 'sub') > 0) applySubclassTier(c, sub, 'mastery');
      } else {
        c.sub1 = subText;
        warn(`找不到子職「${subText}」（或它不屬於「${c.class1}」），已當成自訂名稱`);
      }
    }
    const class2Text = one('職業2');
    if (class2Text) {
      const cls2 = findClass(class2Text);
      if (cls2) applyClass2(c, cls2);
      else {
        c.class2 = class2Text;
        warn(`找不到兼職職業「${class2Text}」，已當成自訂名稱`);
      }
    }
    const sub2Text = one('子職2');
    if (sub2Text) {
      const sub2 = findSubclass(sub2Text, findClass(c.class2)?.name);
      if (sub2) applySubclass2(c, sub2);
      else {
        c.sub2 = sub2Text;
        warn(`找不到兼職子職「${sub2Text}」，已當成自訂名稱`);
      }
    }
    const domainRow = list('領域')[0];
    if (domainRow && (text(domainRow[0]) || text(domainRow[1]))) c.domains = [text(domainRow[0]), text(domainRow[1])];

    /* 7. 數值：表單上印的合計 → 程式內的基礎值 */
    const totals = [['evasion', '閃避'], ['hp', 'HP上限'], ['stress', '壓力上限'], ['armor', '護甲值'], ['major', '中度傷害閾值'], ['severe', '重度傷害閾值']];
    totals.forEach(([stat, key]) => {
      if (!has(key)) return;
      c[STAT_FIELDS[stat]] = statStoredFromTotal(c, stat, num(one(key)));
    });
    if (has('HP已標記')) c.hpMarked = num(one('HP已標記'));
    if (has('壓力已標記')) c.stressMarked = num(one('壓力已標記'));
    if (has('護甲已標記')) c.armorMarked = num(one('護甲已標記'));
    if (has('希望')) c.hopeMarked = num(one('希望'));

    /* 8. 武器 */
    const weaponFrom = (cells, slot) => {
      const [name, trait, features, range, damage, type] = cells.map(text);
      const w = emptyWeapon();
      if (!name) return w;
      const known = WEAPONS.find((x) => x.name === name);
      if (known) {
        Object.assign(w, { name: known.name, trait: known.trait, features: known.features, range: known.range, damage: known.damage, type: known.type, hands: known.hands });
      } else {
        w.name = name;
        warn(`${slot}「${name}」不在武器清單裡，已當成自訂武器（請確認屬性、傷害與負荷）`);
      }
      if (trait) w.trait = trait;
      if (features) w.features = features;
      if (range) w.range = range;
      if (damage) w.damage = damage;
      if (type) w.type = type;
      return w;
    };
    if (list('主手武器')[0]) c.weapons.main = weaponFrom(list('主手武器')[0], '主手武器');
    if (list('副手武器')[0]) c.weapons.off = weaponFrom(list('副手武器')[0], '副手武器');
    const inv = list('庫存武器').map((cells) => weaponFrom(cells, '庫存武器')).filter((w) => w.name);
    if (inv.length) c.inventoryWeapons = inv;
    const moved = enforceTwoHanded(c);
    if (moved) warn(`主手是雙手武器，不能同時配副手，副手「${moved}」已移到庫存`);

    /* 9. 經歷、領域卡、物品、其他特性 */
    const exps = list('經歷').filter((cells) => text(cells[0]));
    if (exps.length) c.experiences = exps.map((cells) => ({ name: text(cells[0]), bonus: num(cells[1], 2) }));

    const cards = [];
    list('領域卡').forEach((cells) => {
      const name = text(cells[0]);
      if (!name) return;
      // 名稱之後的格子順序不拘：對得上領域名稱的是領域，勾選值是已準備
      let domain = '';
      let isPrepared = false;
      cells.slice(1).forEach((x) => {
        if (isFlag(x)) isPrepared = isPrepared || bool(x);
        else if (text(x) && (!domain || DOMAIN_NAMES.some((d) => classKey(d) === classKey(text(x))))) domain = text(x);
      });
      const src = DOMAIN_CARDS.find((x) => x.name === name && (!domain || classKey(x.domain) === classKey(domain))) || DOMAIN_CARDS.find((x) => x.name === name);
      const card = TEMPLATES.domainCards();
      if (src) {
        Object.assign(card, { domain: src.domain, type: src.type, recall: src.recall, name: src.name, desc: src.desc });
        Object.assign(card.fx, DOMAIN_CARD_FX[`${src.domain}|${src.name}`] || {});
      } else {
        Object.assign(card, { name, domain });
        warn(`領域卡「${name}」不在卡片庫裡，已建立只有名稱的卡片，請自行補上內容`);
      }
      card.prepared = isPrepared;
      card._raw = cells.slice(1); // 診斷用，匯入完成前會移除
      cards.push(card);
    });
    let prepared = 0;
    cards.forEach((card) => {
      if (!card.prepared) return;
      if (++prepared > MAX_PREPARED) {
        card.prepared = false;
        warn(`已準備的領域卡最多 ${MAX_PREPARED} 張，「${card.name}」改成未準備`);
      }
    });
    if (cards.length && !cards.some((x) => x.prepared)) {
      warn(`讀到 ${cards.length} 張領域卡，但沒有任何一張被判斷為「已準備」。第一張卡名稱後面的欄位內容是：${JSON.stringify(cards[0]._raw)}（已準備請填勾選框的 TRUE／FALSE，或「是」「否」）`);
    }
    cards.forEach((x) => delete x._raw);
    c.domainCards = cards;

    c.items = list('物品')
      .filter((cells) => text(cells[0]))
      .map((cells) => ({ name: text(cells[0]), qty: num(cells[1], 1), desc: text(cells[2]) }));

    list('特性').forEach((cells) => {
      if (text(cells[1]) || text(cells[2])) c.traits.push({ source: text(cells[0]), name: text(cells[1]), desc: text(cells[2]), auto: '' });
    });

    // 升級紀錄比等級應有的少時提醒（匯入後可以到角色卡的「升級紀錄」補登）
    const short = UPGRADE_TIERS.filter((t) => picksRecorded(c, t) < picksExpected(c.level, t));
    if (short.length) warn(`升級紀錄不完整（階級 ${short.join('、')}），之後升級時可選的選項可能不準，請到角色卡的「升級紀錄」補登`);

    // 讀到什麼：匯入結果視窗會列出來，方便核對
    const preparedN = c.domainCards.filter((x) => x.prepared).length;
    const summary = [
      `屬性：${ATTRS.map((a) => `${a.label} ${c.attrs[a.key].value}${c.attrs[a.key].marked ? '（已升級）' : ''}`).join('、')}`,
      `經歷 ${c.experiences.filter((e) => e.name).length} 項、物品 ${c.items.length} 項、角色特性 ${c.traits.length} 列`,
      `領域卡 ${c.domainCards.length} 張（已準備 ${preparedN} 張）`,
      `武器：主手 ${c.weapons.main.name || '無'}、副手 ${c.weapons.off.name || '無'}、庫存 ${c.inventoryWeapons.filter((w) => w.name).length} 把；護甲 ${c.armor.name || '無'}`,
    ];

    return { character: c, warnings, summary };
  }

  /* ---------- 匯入視窗 ---------- */

  const box = () => document.getElementById('gsimport');
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  };
  const save = (s) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) { /* 存不了就算了，下次重填 */ }
  };

  // js/config.js 裡設定的 API Key（測試時可以替換 config.key）
  const config = { key: () => (typeof GOOGLE_API_KEY !== 'undefined' ? String(GOOGLE_API_KEY).trim() : '') };

  function drawForm(message = '', busy = false) {
    const s = load();
    const configured = !!config.key();
    box().innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="從 Google 試算表匯入">
      <h2>從 Google 試算表匯入</h2>
      <p class="muted">一次性匯入成一個新角色。試算表要共用為「知道連結的人可檢視」，並有一個「匯出頁」分頁（格式見 docs/匯出頁格式.md）。</p>
      <div class="gs-form">
        <label class="hf"><span>試算表網址</span><input type="text" id="gsUrl" value="${esc(s.url || '')}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
        <label class="hf"><span>分頁名稱</span><input type="text" id="gsTab" value="${esc(s.tab || '匯出頁')}"></label>
        ${configured ? '' : `<label class="hf"><span>Google API Key</span><input type="text" id="gsKey" value="${esc(s.key || '')}" placeholder="AIza…"></label>
        <p class="muted">也可以把金鑰填進 js/config.js 的 GOOGLE_API_KEY，之後就不用再輸入。</p>`}
      </div>
      <p class="lu-err">${message ? esc(message) : '&nbsp;'}</p>
      <div class="lu-actions">
        <button type="button" data-gs="cancel">取消</button>
        <button type="button" class="primary" data-gs="go" ${busy ? 'disabled' : ''}>${busy ? '讀取中…' : '匯入'}</button>
      </div>
    </div>`;
  }

  function drawResult(character, warnings, summary = []) {
    box().innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="匯入完成">
      <h2>已匯入「${esc(character.name)}」</h2>
      <p class="muted">Lv ${character.level}　${esc(character.ancestry || '')}　${esc(character.class1 || '')} ${esc(character.sub1 || '')}</p>
      <p class="lu-title"><b>讀到的內容</b></p>
      <ul class="lu-list">${summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${warnings.length
        ? `<p class="lu-title"><b>請確認以下 ${warnings.length} 項</b></p><ul class="lu-list todo">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
        : '<p class="lu-title">沒有需要處理的項目。</p>'}
      <div class="lu-actions"><button type="button" class="primary" data-gs="done">完成</button></div>
    </div>`;
  }

  function open() {
    box().hidden = false;
    drawForm();
  }

  function close() {
    box().hidden = true;
    box().innerHTML = '';
  }

  async function run() {
    const val = (id) => document.getElementById(id)?.value || '';
    // 已經在 config.js 設定金鑰時直接使用，不另外存一份到瀏覽器
    const configured = !!config.key();
    const settings = { url: val('gsUrl').trim(), tab: val('gsTab').trim() || '匯出頁', key: configured ? config.key() : val('gsKey').trim() };
    save({ url: settings.url, tab: settings.tab, key: configured ? '' : settings.key });
    drawForm('', true); // 重畫時會讀回剛存的設定
    try {
      const rows = await fetchRows(settings);
      if (!rows.length) throw new Error(`分頁「${settings.tab}」是空的`);
      const { character, warnings, summary } = characterFromRows(rows);
      Store.add(character);
      renderAll();
      drawResult(Store.active(), warnings, summary);
    } catch (e) {
      const hint = configured && /API Key/.test(e.message || '') ? '（請檢查 js/config.js 的 GOOGLE_API_KEY）' : '';
      drawForm((e.message || '匯入失敗') + hint);
    }
  }

  function init() {
    box().addEventListener('click', (e) => {
      if (e.target === box()) return close();
      const btn = e.target.closest('button[data-gs]');
      if (!btn) return;
      if (btn.dataset.gs === 'go') run();
      else close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !box().hidden) close();
    });
  }

  return { init, open, parseSheetId, fetchRows, characterFromRows, config };
})();
