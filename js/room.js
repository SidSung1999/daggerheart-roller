/* 共享房間：加入同一個房間代碼的人，會即時看到彼此的擲骰結果。
   - 擲骰器與自由擲骰每次擲完，都會呼叫 Room.publish() 把結果送到房間（沒加入房間或關掉「分享」時什麼都不做）
   - 畫面右下角的「擲骰紀錄」列出房間裡所有人的結果，包含加入前最近的幾筆
   - 連線方式在 room-firebase.js，這裡只透過 connect() / push() / leave() 使用它，方便日後替換
   別人送來的資料一律當成不可信：所有欄位顯示前都會跳脫，數值與判定結果只接受固定格式。 */
const Room = (() => {
  const KEY = 'dh-room';
  const LOG_MAX = 100;
  const VERDICTS = { hope: '☀ 帶著希望', fear: '🌑 帶著恐懼', crit: '✨ 關鍵成功' };

  const st = {
    factory: () => RoomFirebase.create(), // 測試時可以換成假的連線
    conn: null,
    joined: false,
    busy: false,
    code: '',
    name: '',
    share: true,
    joinedAt: 0,
    rolls: [],
    seen: new Set(),
    people: [],
    unread: 0,
    dockOpen: true,
    message: '',
  };

  const dlg = () => document.getElementById('roomdlg');
  const dock = () => document.getElementById('roomdock');
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  /* ---------- 設定的保存 ---------- */

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ code: st.code, name: st.name, joined: st.joined, share: st.share }));
    } catch (e) { /* 存不了就算了 */ }
  }

  const defaultName = () => {
    const c = typeof Store !== 'undefined' && Store.active && Store.active();
    return st.name || (c && (c.player || c.name)) || '';
  };

  /* ---------- 加入 / 離開 ---------- */

  async function join(code, name) {
    code = String(code || '').trim();
    name = String(name || '').trim().slice(0, 30);
    if (!code) return fail('請輸入房間代碼');
    if (!name) return fail('請輸入你的顯示名稱');
    if (st.joined) await leave(false);

    st.busy = true;
    st.message = '連線中…';
    drawDialog();
    Object.assign(st, { code, name, rolls: [], seen: new Set(), people: [], unread: 0, joinedAt: Date.now() });
    try {
      st.conn = await st.factory().connect({
        code,
        name,
        onRoll: receive,
        onPresence: (names) => {
          st.people = names;
          drawDock();
        },
        onError: (err) => {
          st.message = describeError(err);
          toast(st.message);
        },
      });
      st.joined = true;
      st.message = '';
      saveSettings();
      closeDialog();
      toast(`已加入房間「${code}」`);
    } catch (e) {
      st.conn = null;
      st.joined = false;
      st.message = e && e.message ? e.message : '連線失敗';
    } finally {
      st.busy = false;
      drawDialog();
      drawDock();
      drawButton();
    }
  }

  function fail(message) {
    st.message = message;
    drawDialog();
  }

  async function leave(redraw = true) {
    const conn = st.conn;
    st.conn = null;
    st.joined = false;
    st.rolls = [];
    st.seen = new Set();
    st.people = [];
    saveSettings();
    if (conn) await conn.leave().catch(() => {});
    if (redraw) {
      drawDock();
      drawButton();
      drawDialog();
      toast('已離開房間');
    }
  }

  const describeError = (err) =>
    /permission/i.test(String(err && (err.code || err.message)))
      ? '沒有權限讀寫這個房間：請確認 Firebase 的資料庫規則（見 docs/共享擲骰設定.md）'
      : `連線發生問題：${(err && err.message) || err}`;

  /* ---------- 送出與接收擲骰 ---------- */

  // evt：{ kind, title, lines: [文字], total, dice?: { hope, fear, hs, fs, v } }
  function publish(evt) {
    if (!st.joined || !st.share || !st.conn) return;
    const c = typeof Store !== 'undefined' && Store.active && Store.active();
    const roll = {
      t: Date.now(),
      by: st.name,
      ch: (c && c.name) || '',
      kind: String(evt.kind || 'free'),
      title: String(evt.title || '').slice(0, 190),
      text: (evt.lines || []).join('\n').slice(0, 2900),
      total: num(evt.total),
    };
    if (evt.dice) {
      Object.assign(roll, { hope: num(evt.dice.hope), fear: num(evt.dice.fear), hs: num(evt.dice.hs), fs: num(evt.dice.fs), v: String(evt.dice.v || '') });
    }
    Promise.resolve(st.conn.push(roll)).catch((e) => toast(describeError(e)));
  }

  function receive(roll, key) {
    if (!roll || typeof roll !== 'object' || (key && st.seen.has(key))) return;
    if (key) st.seen.add(key);
    const item = {
      key,
      t: num(roll.t),
      uid: String(roll.uid || ''),
      by: String(roll.by || '?').slice(0, 40),
      ch: String(roll.ch || '').slice(0, 40),
      title: String(roll.title || '').slice(0, 200),
      text: String(roll.text || '').slice(0, 3000),
      total: num(roll.total),
      dice: roll.v && VERDICTS[roll.v] ? { hope: num(roll.hope), fear: num(roll.fear), hs: num(roll.hs) || 12, fs: num(roll.fs) || 12, v: roll.v } : null,
      live: num(roll.t) >= st.joinedAt, // 加入之後才擲的是新結果，之前的是歷史紀錄
    };
    st.rolls.push(item);
    if (st.rolls.length > LOG_MAX) st.rolls.shift();
    if (item.live && !st.dockOpen) st.unread += 1;
    drawDock();
  }

  /* ---------- 畫面 ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => {
    const d = new Date(t);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  function itemHtml(r) {
    // 自己的擲骰：有 uid 時用 uid 判斷（顯示名稱可能重複），舊紀錄沒有 uid 才比名稱
    const myUid = st.conn && st.conn.uid;
    const mine = r.uid && myUid ? r.uid === myUid : r.by === st.name;
    const who = `${esc(r.by)}${r.ch && r.ch !== r.by ? `<small>（${esc(r.ch)}）</small>` : ''}`;
    const dice = r.dice
      ? `<div class="rd-dice"><span class="hope">☀ d${r.dice.hs}：${r.dice.hope}</span><span class="fear">🌑 d${r.dice.fs}：${r.dice.fear}</span><span class="verdict-tag ${esc(r.dice.v)}">${esc(VERDICTS[r.dice.v])}</span></div>`
      : '';
    return `<li data-key="${esc(r.key || '')}" class="rd-item ${mine ? 'mine' : ''} ${r.live ? 'live' : ''}">
      <details>
        <summary><span class="rd-time">${clock(r.t)}</span> <b>${who}</b> ${esc(r.title)} → <span class="rd-total">${r.total}</span>${r.dice ? ` <span class="verdict-tag ${esc(r.dice.v)}">${esc(VERDICTS[r.dice.v])}</span>` : ''}</summary>
        <div class="rd-detail">${dice}<pre>${esc(r.text)}</pre></div>
      </details>
    </li>`;
  }

  function drawDock() {
    const el = dock();
    if (!el) return;
    el.hidden = !st.joined;
    if (!st.joined) return;
    const names = st.people.length ? st.people.join('、') : st.name;
    const wasOpen = [...el.querySelectorAll('details[open]')].map((d) => d.closest('li').dataset.key);
    el.innerHTML = `<div class="rd-head">
        <button type="button" class="rd-toggle" data-rd="toggle" aria-expanded="${st.dockOpen}">
          🎲 房間「${esc(st.code)}」${st.unread ? `<span class="rd-badge">${st.unread}</span>` : ''} <span class="rd-caret">${st.dockOpen ? '▾' : '▴'}</span>
        </button>
        <span class="rd-people" title="${esc(names)}">在線 ${st.people.length || 1} 人</span>
      </div>
      <div class="rd-body" ${st.dockOpen ? '' : 'hidden'}>
        <div class="rd-tools">
          <label><input type="checkbox" data-rd="share" ${st.share ? 'checked' : ''}> 分享我的擲骰</label>
          <button type="button" data-rd="leave">離開房間</button>
        </div>
        <p class="rd-who muted">${esc(names)}</p>
        <ol class="rd-log">${
          st.rolls.length
            ? [...st.rolls].reverse().map(itemHtml).join('')
            : '<li class="muted">還沒有人擲骰</li>'
        }</ol>
      </div>`;
    // 重畫後，保留使用者原本展開的項目
    el.querySelectorAll('li[data-key]').forEach((li) => {
      if (wasOpen.includes(li.dataset.key)) li.querySelector('details').open = true;
    });
  }

  function drawButton() {
    const b = document.getElementById('btnRoom');
    if (b) b.textContent = st.joined ? `🌐 房間：${st.code}` : '🌐 房間';
  }

  function drawDialog() {
    const el = dlg();
    if (!el || el.hidden) return;
    const configured = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.databaseURL;
    const saved = loadSettings();
    el.innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="共享擲骰房間">
      <h2>共享擲骰房間</h2>
      <p class="muted">加入同一個房間代碼的人，會即時看到彼此的擲骰結果。把房間代碼告訴同桌的朋友就好。</p>
      ${configured ? '' : '<p class="lu-warn">尚未設定 Firebase：請先把 firebaseConfig 填進 js/config.js，步驟見 docs/共享擲骰設定.md。</p>'}
      ${st.joined
        ? `<p class="lu-title">目前在房間「<b>${esc(st.code)}</b>」，名稱：<b>${esc(st.name)}</b></p>
           <div class="lu-actions"><button type="button" data-room="close">關閉</button><button type="button" class="primary" data-room="leave">離開房間</button></div>`
        : `<div class="gs-form">
             <label class="hf"><span>房間代碼</span><input type="text" id="roomCode" maxlength="40" value="${esc(st.code || saved.code || '')}" placeholder="例：週五團"></label>
             <label class="hf"><span>你的顯示名稱</span><input type="text" id="roomName" maxlength="30" value="${esc(defaultName())}" placeholder="例：阿明"></label>
           </div>
           <p class="lu-err">${st.message ? esc(st.message) : '&nbsp;'}</p>
           <div class="lu-actions"><button type="button" data-room="close">取消</button><button type="button" class="primary" data-room="join" ${st.busy ? 'disabled' : ''}>${st.busy ? '連線中…' : '加入'}</button></div>`}
    </div>`;
  }

  function openDialog() {
    dlg().hidden = false;
    st.message = '';
    drawDialog();
  }

  function closeDialog() {
    dlg().hidden = true;
    dlg().innerHTML = '';
  }

  /* ---------- 事件與啟動 ---------- */

  function init() {
    document.getElementById('btnRoom').addEventListener('click', openDialog);

    dlg().addEventListener('click', (e) => {
      if (e.target === dlg()) return closeDialog();
      const btn = e.target.closest('button[data-room]');
      if (!btn) return;
      if (btn.dataset.room === 'join') join(document.getElementById('roomCode').value, document.getElementById('roomName').value);
      else if (btn.dataset.room === 'leave') leave().then(closeDialog);
      else closeDialog();
    });
    dlg().addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('room')) join(document.getElementById('roomCode').value, document.getElementById('roomName').value);
    });

    dock().addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-rd]');
      if (!btn) return;
      if (btn.dataset.rd === 'toggle') {
        st.dockOpen = !st.dockOpen;
        if (st.dockOpen) st.unread = 0;
        drawDock();
      } else if (btn.dataset.rd === 'leave') {
        leave();
      }
    });
    dock().addEventListener('change', (e) => {
      if (e.target.dataset && e.target.dataset.rd === 'share') {
        st.share = e.target.checked;
        saveSettings();
        toast(st.share ? '已開始分享你的擲骰' : '你的擲骰不會分享給房間（仍會看到別人的）');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dlg().hidden) closeDialog();
    });

    // 上次還在房間裡，重新整理後自動回去
    const saved = loadSettings();
    st.share = saved.share !== false;
    if (saved.joined && saved.code && saved.name) {
      st.code = saved.code;
      st.name = saved.name;
      join(saved.code, saved.name).then(() => {
        if (!st.joined) toast(`無法自動回到房間「${saved.code}」：${st.message}`);
      });
    } else {
      st.name = saved.name || '';
    }
    drawButton();
    drawDock();
  }

  return { init, join, leave, publish, receive, st };
})();
