/* 隊伍：在共享房間裡分享自己的角色卡摘要，並看到房間裡其他人的角色卡（只能看，不能改）。
   - 自己這邊：選要分享哪個角色，存檔後約 1.5 秒把摘要送到房間；頭像只有換掉時才重送
   - 別人那邊：「隊伍」分頁列出房間裡所有分享的角色卡摘要
   - 玩家關掉網頁後，角色卡仍留在房間裡（讓 GM 繼續看）；按「不分享」才會從房間移除
   摘要在送出端算好（閃避、閾值、HP 上限等合計），接收端不需要任何規則資料。
   別人送來的資料一律當不可信：字串截長度、顯示前跳脫、數字轉型、頭像只接受 data:image 的 base64。
   連線在 room-firebase.js（putSheet / putPortrait / removeSheet），由 room.js 在加入 / 離開房間時呼叫 attach / detach。 */
const Party = (() => {
  const KEY = 'dh-party';
  const DELAY = 1500;
  const INFO_MAX = 20000; // 與資料庫規則的長度上限一致
  const PORTRAIT_MAX = 400000;
  const PORTRAIT_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

  const st = {
    conn: null,
    share: 'active', // '' 不分享；'active' 目前選擇的角色；其他是角色 id
    sheets: {}, // uid -> { t, by, info }
    portraits: {}, // uid -> data URL
    sent: { info: null, portrait: null, shared: false },
    timer: null,
  };

  const root = () => document.getElementById('party');
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const str = (v, n = 60) => String(v == null ? '' : v).slice(0, n);
  const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY)) || {};
      if (typeof s.share === 'string') st.share = s.share;
    } catch (e) { /* 用預設值 */ }
  }
  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ share: st.share }));
    } catch (e) { /* 存不了就算了 */ }
  }

  const sharedChar = () => {
    if (!st.share) return null;
    if (st.share === 'active') return Store.active();
    return Store.get(st.share) || null;
  };

  /* ---------- 摘要 ---------- */

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(n)));
  const track = (marked, max) => [clamp(num(marked), 0, max), max];

  function summary(c) {
    const hpMax = clamp(statTotal(c, 'hp'), 1, 12);
    const stressMax = clamp(statTotal(c, 'stress'), 1, 12);
    const armorMax = clamp(statTotal(c, 'armor'), 0, 12);
    const hope = hopeMax(c);
    const mix = findAncestry(c.ancestry);
    const weapons = [
      ['主手', c.weapons.main],
      ['副手', c.weapons.off],
    ]
      .filter(([, w]) => w && String(w.name || '').trim())
      .map(([slot, w]) => [slot, str(w.name), str(w.damage, 20), str(w.range, 10), str(w.trait, 10)]);
    const beast = currentBeast(c);
    const cp = hasCompanion(c) ? c.companion : null;
    const out = {
      v: 1,
      name: str(c.name),
      player: str(c.player),
      level: num(c.level) || 1,
      ancestry: str(mix && mix.mixed && c.ancestryMixName ? c.ancestryMixName : c.ancestry),
      background: str(c.background),
      cls: [str(c.class1), str(c.sub1)],
      cls2: [str(c.class2), str(c.sub2)],
      evasion: statTotal(c, 'evasion'),
      armor: statTotal(c, 'armor'),
      major: statTotal(c, 'major'),
      severe: statTotal(c, 'severe'),
      hp: track(c.hpMarked, hpMax),
      stress: track(c.stressMarked, stressMax),
      hope: track(c.hopeMarked, hope),
      armorSlots: track(c.armorMarked, armorMax),
      prof: num(c.proficiency) || 1,
      attrs: ATTRS.map((a) => [a.label, num(c.attrs[a.key].value), beastAttrBonus(c, a.key)]),
      weapons,
      armorName: str(c.armor.name),
      exps: c.experiences.filter((e) => String(e.name || '').trim()).slice(0, 12).map((e) => [str(e.name, 40), num(e.bonus)]),
      cards: c.domainCards.filter((d) => d.prepared).slice(0, 10).map((d) => [str(d.name, 40), str(d.domain, 20), str(d.type, 10)]),
      traits: c.traits.filter((t) => String(t.name || '').trim()).slice(0, 40).map((t) => [str(t.source, 20), str(t.name, 40)]),
      beast: beast ? [str(beast.name), str(`${beast.attack.range} ${beast.attack.attr} ${beast.attack.damage}`, 40)] : null,
      companion: cp
        ? { name: str(cp.name, 40), evasion: companionEvasion(c), stress: track(cp.stressMarked, companionStressMax(c)), die: str(cp.die, 6), range: str(cp.range, 10) }
        : null,
      gold: str(c.gold, 40),
    };
    let text = JSON.stringify(out);
    if (text.length > INFO_MAX) {
      out.traits = out.traits.slice(0, 10);
      text = JSON.stringify(out).slice(0, INFO_MAX); // 理論上不會發生；截斷會讓接收端解析失敗並顯示錯誤
    }
    return text;
  }

  /* ---------- 送出 ---------- */

  function schedule() {
    if (!st.conn) return;
    clearTimeout(st.timer);
    st.timer = setTimeout(publishNow, DELAY);
  }

  async function publishNow() {
    clearTimeout(st.timer);
    const conn = st.conn;
    if (!conn || !conn.putSheet) return;
    const c = sharedChar();
    try {
      if (!c) {
        if (st.sent.shared) await conn.removeSheet();
        st.sent = { info: null, portrait: null, shared: false };
        return;
      }
      const info = summary(c);
      if (info !== st.sent.info) {
        await conn.putSheet(str(Room.st.name, 30), info);
        st.sent.info = info;
        st.sent.shared = true;
      }
      const p = c.portrait && PORTRAIT_RE.test(c.portrait) && c.portrait.length <= PORTRAIT_MAX ? c.portrait : '';
      if (p !== st.sent.portrait) {
        await conn.putPortrait(p || null);
        st.sent.portrait = p;
      }
    } catch (e) {
      st.sent.info = null; // 下次存檔時重送
      toast(/permission/i.test(String(e && (e.code || e.message)))
        ? '分享角色卡被拒絕：請更新 Firebase 資料庫規則（見 docs/共享擲骰設定.md）'
        : `分享角色卡失敗：${(e && e.message) || e}`);
    }
  }

  /* ---------- 接收 ---------- */

  function onSheet(uid, val) {
    if (!val || typeof val !== 'object') delete st.sheets[uid];
    else {
      let info = null;
      try {
        info = JSON.parse(String(val.info || ''));
      } catch (e) { info = null; }
      st.sheets[uid] = { t: num(val.t), by: str(val.by, 40), info: info && typeof info === 'object' ? info : null };
    }
    render();
  }

  function onPortrait(uid, val) {
    if (typeof val === 'string' && val.length <= PORTRAIT_MAX && PORTRAIT_RE.test(val)) st.portraits[uid] = val;
    else delete st.portraits[uid];
    render();
  }

  function attach(conn) {
    st.conn = conn;
    st.sent = { info: null, portrait: null, shared: false };
    publishNow();
    render();
  }

  function detach() {
    clearTimeout(st.timer);
    st.conn = null;
    st.sheets = {};
    st.portraits = {};
    render();
  }

  /* ---------- 畫面 ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  function when(t) {
    if (!t) return '';
    const d = new Date(t);
    const today = new Date().toDateString() === d.toDateString();
    return `${today ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function boxesHtml(tr, cls) {
    const [marked, max] = [num(arr(tr, 2)[0]), clamp(num(arr(tr, 2)[1]), 0, 12)];
    let h = '';
    for (let i = 0; i < max; i++) h += `<i class="pb ${cls} ${i < marked ? 'on' : ''}"></i>`;
    return `<span class="pboxes">${h}</span><small>${Math.min(marked, max)}/${max}</small>`;
  }

  const signed = (n) => (n >= 0 ? '+' : '') + n;
  const joinNames = (pair) => arr(pair, 2).map((x) => str(x)).filter(Boolean).join('・');

  function cardHtml(uid, s) {
    const i = s.info;
    const mine = st.conn && uid === st.conn.uid;
    const head = `<div class="pc-meta">${esc(s.by)}${mine ? '（我）' : ''}　<small>更新 ${esc(when(s.t))}</small></div>`;
    if (!i) return `<article class="pcard">${head}<p class="warn">角色卡資料無法讀取</p></article>`;
    const portrait = st.portraits[uid];
    const attrs = arr(i.attrs, 6)
      .map((a) => {
        const bonus = num(a[2]);
        return `<div class="pa ${bonus ? 'beast' : ''}" ${bonus ? `title="${num(a[1])}(角色)+${bonus}(野獸型態)"` : ''}><small>${esc(str(a[0], 4))}</small><b>${signed(num(a[1]) + bonus)}</b></div>`;
      })
      .join('');
    const list = (items, fmt) => (items.length ? items.map(fmt).join('、') : '—');
    const cls2 = joinNames(i.cls2);
    const comp = i.companion && typeof i.companion === 'object' ? i.companion : null;
    return `<article class="pcard ${mine ? 'mine' : ''}">
      ${head}
      <header class="pc-head">
        ${portrait ? `<img class="pc-portrait" src="${esc(portrait)}" alt="">` : '<div class="pc-portrait none">?</div>'}
        <div>
          <h3>${esc(str(i.name))} <small>Lv ${num(i.level)}</small></h3>
          <p>${esc([str(i.ancestry), str(i.background)].filter(Boolean).join('・'))}</p>
          <p>${esc(joinNames(i.cls))}${cls2 ? `　兼職：${esc(cls2)}` : ''}</p>
        </div>
      </header>
      <div class="pc-stats">
        <div><small>閃避</small><b>${num(i.evasion)}</b></div>
        <div><small>護甲</small><b>${num(i.armor)}</b></div>
        <div><small>閾值</small><b>${num(i.major)} / ${num(i.severe)}</b></div>
        <div><small>熟練</small><b>${num(i.prof)}</b></div>
      </div>
      <div class="pc-tracks">
        <div><b>HP</b>${boxesHtml(i.hp, 'hp')}</div>
        <div><b>壓力</b>${boxesHtml(i.stress, 'stress')}</div>
        <div><b>希望</b>${boxesHtml(i.hope, 'hope')}</div>
        <div><b>護甲槽</b>${boxesHtml(i.armorSlots, 'armor')}</div>
      </div>
      <div class="pc-attrs">${attrs}</div>
      ${i.beast ? `<p class="pc-beast">🐾 ${esc(str(arr(i.beast, 2)[0]))}　<small>${esc(str(arr(i.beast, 2)[1], 40))}</small></p>` : ''}
      <dl class="pc-list">
        <dt>武器</dt><dd>${list(arr(i.weapons, 2), (w) => `${esc(str(w[1]))} <small>${esc([str(w[2], 20), str(w[3], 10)].filter(Boolean).join(' '))}</small>`)}</dd>
        <dt>護甲</dt><dd>${esc(str(i.armorName)) || '—'}</dd>
        <dt>經歷</dt><dd>${list(arr(i.exps, 12), (e) => `${esc(str(e[0], 40))} ${signed(num(e[1]))}`)}</dd>
        <dt>領域卡</dt><dd>${list(arr(i.cards, 10), (d) => `${esc(str(d[0], 40))}`)}</dd>
        ${comp ? `<dt>夥伴</dt><dd>🐺 ${esc(str(comp.name, 40) || '夥伴')}　閃避 ${num(comp.evasion)}　${esc(str(comp.range, 10))} ${esc(str(comp.die, 6))}　壓力 ${boxesHtml(comp.stress, 'stress')}</dd>` : ''}
        ${str(i.gold, 40) ? `<dt>金幣</dt><dd>${esc(str(i.gold, 40))}</dd>` : ''}
      </dl>
      <details class="pc-traits"><summary>角色特性（${arr(i.traits, 40).length}）</summary>
        <ul>${arr(i.traits, 40).map((t) => `<li><small>${esc(str(t[0], 20))}</small> ${esc(str(t[1], 40))}</li>`).join('')}</ul>
      </details>
    </article>`;
  }

  function render() {
    const el = root();
    if (!el) return;
    const opts = [['', '不分享'], ['active', '目前選擇的角色'], ...Store.list().map((c) => [c.id, c.name || '(未命名)'])]
      .map(([v, l]) => `<option value="${esc(v)}" ${st.share === v ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');
    const controls = `<div class="panel party-bar">
        <label>分享我的角色卡：<select data-party="share">${opts}</select></label>
        <small class="muted">房間裡的人只能看、不能改。關掉網頁後角色卡仍會留在房間裡；選「不分享」會從房間移除。</small>
      </div>`;
    if (!st.conn) {
      el.innerHTML = `${controls}<p class="muted party-empty">加入「🌐 房間」後，這裡會列出房間裡大家分享的角色卡。</p>`;
      return;
    }
    const entries = Object.entries(st.sheets).sort(([, a], [, b]) => a.by.localeCompare(b.by, 'zh-Hant'));
    el.innerHTML = `${controls}${
      entries.length
        ? `<div class="party-grid">${entries.map(([uid, s]) => cardHtml(uid, s)).join('')}</div>`
        : '<p class="muted party-empty">房間裡還沒有人分享角色卡。</p>'
    }`;
  }

  function init() {
    loadSettings();
    Store.onSave(schedule);
    root().addEventListener('change', (e) => {
      if (!e.target.dataset || e.target.dataset.party !== 'share') return;
      st.share = e.target.value;
      saveSettings();
      publishNow();
      toast(st.share ? '已開始分享角色卡' : '已停止分享，角色卡會從房間移除');
    });
    render();
  }

  return { init, render, attach, detach, onSheet, onPortrait, publishNow, summary, st };
})();
