/* 升級畫面：升級精靈（蓋在整個畫面上的對話框）與角色卡上的「升級紀錄」。規則在 levelup.js。 */
const LevelUp = (() => {
  const box = () => document.getElementById('levelup');
  const ch = () => Store.active();
  const st = { logOpen: false, counts: {}, attrs: [], exps: [], train: '', trainExp: -1, trainVicious: 'die', result: null };
  const blankPick = () => ({ counts: {}, attrs: [], exps: [], train: '', trainExp: -1, trainVicious: 'die', result: null });

  // 已用掉幾個名額：熟練值、兼職一次算 2 個
  const total = () => Object.keys(st.counts).reduce((sum, k) => sum + st.counts[k] * pickWeight(k), 0);
  const selection = () => ({ counts: { ...st.counts }, attrs: [...st.attrs], exps: [...st.exps], train: st.train, trainExp: st.trainExp, trainVicious: st.trainVicious });
  const TIER_RANGE = { 2: '等級 2–4', 3: '等級 5–7', 4: '等級 8–10' };

  /* ---------- 角色卡上的升級紀錄 ---------- */

  function recordHtml() {
    const c = ch();
    const level = Number(c.level) || 1;
    let incomplete = false;
    const tiers = UPGRADE_TIERS.map((t) => {
      const expected = picksExpected(level, t);
      const recorded = picksRecorded(c, t);
      if (recorded < expected) incomplete = true;
      const rows = optionsOfTier(t)
        .map((o) => {
          const filled = upgradeBoxesFilled(c, t, o.key);
          let boxes = '';
          for (let i = 0; i < o.cap * (o.width || 1); i++) {
            boxes += `<button type="button" class="ubox ${i < filled ? 'on' : ''}" data-uptier="${t}" data-upkey="${o.key}" data-upi="${i}" aria-label="${esc(o.short)} 第 ${i + 1} 格"></button>`;
          }
          return `<div class="up-row"><span class="up-boxes">${boxes}</span><span class="up-label">${esc(o.label)}</span></div>`;
        })
        .join('');
      const status = expected || recorded ? `<span class="up-count ${recorded < expected ? 'warn' : ''}">已記錄 ${recorded} / 應有 ${expected} 個選項</span>` : '';
      return `<div class="up-tier"><h3>階級 ${t}（${TIER_RANGE[t]}）${status}</h3>${rows}</div>`;
    }).join('');

    return `<section class="panel"><details class="up-log" id="upLog" ${st.logOpen ? 'open' : ''}>
      <summary>⬆ 升級紀錄${incomplete ? ' <em class="warn">（紀錄不完整）</em>' : ''}</summary>
      <p class="muted">記錄各階級已經選過的升級選項。用「升級」按鈕升級時會自動記錄；匯入的高等級角色請在這裡補登已選過的選項（只記錄，不會改任何數值）。</p>
      <div class="up-tiers">${tiers}</div>
    </details></section>`;
  }

  function captureOpen(root) {
    const el = root.querySelector('#upLog');
    if (el) st.logOpen = el.open;
  }

  function toggleBox(tier, key, index) {
    toggleUpgradeBox(ch(), Number(tier), key, Number(index));
    Store.save();
    Sheet.render();
  }

  /* ---------- 升級精靈 ---------- */

  function open() {
    if ((Number(ch().level) || 1) >= LEVEL_MAX) return toast(`已經是最高等級（${LEVEL_MAX} 級）`);
    Object.assign(st, blankPick());
    box().hidden = false;
    draw();
  }

  function close() {
    box().hidden = true;
    box().innerHTML = '';
  }

  // 選項改變後，把不再需要的屬性 / 經歷選擇收掉
  function trimSelection() {
    st.attrs = st.counts.attr ? st.attrs.slice(0, st.counts.attr * 2) : [];
    st.exps = st.counts.exp ? st.exps.slice(0, 2) : [];
  }

  function draw() {
    if (st.result) return drawResult();
    const c = ch();
    const to = (Number(c.level) || 1) + 1;
    const tier = tierOfLevel(to);
    const clearsMarks = to === 5 || to === 8;
    const unmarked = (k) => clearsMarks || !c.attrs[k].marked;
    const unmarkedCount = ATTRS.filter((a) => unmarked(a.key)).length;
    const named = c.experiences.map((e, i) => ({ e, i })).filter(({ e }) => String(e.name || '').trim());
    const sub = currentSubclass(c);
    const sum = total();

    const startBox = isTierStart(to)
      ? `<div class="lu-start"><b>階級獎勵（${to} 級）</b>
          <ul><li>獲得一項額外 +2 經歷（會新增一列，請再填名稱）</li><li>熟練值 +1</li>${clearsMarks ? '<li>清除所有屬性升級標記</li>' : ''}</ul></div>`
      : '';

    const expected = picksExpected(to - 1, tier);
    const recorded = picksRecorded(c, tier);
    const warn = recorded < expected
      ? `<p class="lu-warn">升級紀錄不完整：階級 ${tier} 應該已經選過 ${expected} 個選項，目前只記錄了 ${recorded} 個。下面顯示的剩餘次數可能比實際多，可以先到角色卡的「升級紀錄」補登。</p>`
      : '';

    const rows = optionsOfTier(tier).map((o) => {
      let left = upgradeLeft(c, tier, o.key);
      let reason = left ? '' : '（本階級已不能再選）';
      if (left && o.key === 'attr' && unmarkedCount < 2) { left = 0; reason = '（未升級的屬性不足 2 項）'; }
      if (left && o.key === 'exp' && !named.length) { left = 0; reason = '（還沒有填寫名稱的經歷）'; }
      if (left && o.key === 'sub' && !sub) { left = 0; reason = '（需要先在表頭選好職業與子職業）'; }
      const n = st.counts[o.key] || 0;
      const exclusive = (o.key === 'sub' && st.counts.multi) || (o.key === 'multi' && st.counts.sub);
      if (exclusive) reason = '（與升級子職業 / 兼職互相排斥）';
      const canInc = !exclusive && n < left && sum + pickWeight(o.key) <= 2;
      return `<div class="lu-opt ${n ? 'on' : ''} ${left || n ? '' : 'off'}">
        <span class="lu-label">${esc(o.label)} <small class="muted">${left ? `剩 ${left} 次` : ''}${esc(reason)}</small></span>
        <span class="lu-step">
          <button type="button" data-lu="dec" data-key="${o.key}" ${n ? '' : 'disabled'} aria-label="減少">−</button>
          <b>${n}</b>
          <button type="button" data-lu="inc" data-key="${o.key}" ${canInc ? '' : 'disabled'} aria-label="增加">＋</button>
        </span>
      </div>`;
    }).join('');

    let pickers = '';
    if (st.counts.attr) {
      const need = st.counts.attr * 2;
      pickers += `<div class="lu-pick"><b>選擇 ${need} 項屬性</b>（已選 ${st.attrs.length}）<div class="lu-chks">${ATTRS.map((a) => {
        const on = st.attrs.includes(a.key);
        const dis = !unmarked(a.key) || (!on && st.attrs.length >= need);
        const v = Number(c.attrs[a.key].value) || 0;
        return `<label class="lu-chk ${on ? 'on' : ''} ${dis ? 'off' : ''}"><input type="checkbox" data-lu="attr" data-key="${a.key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${a.label} ${v} → ${v + 1}${unmarked(a.key) ? '' : '（已升級）'}</label>`;
      }).join('')}</div></div>`;
    }
    if (st.counts.exp) {
      const need = Math.min(2, named.length);
      pickers += `<div class="lu-pick"><b>選擇 ${need} 項經歷</b>（已選 ${st.exps.length}）<div class="lu-chks">${named.map(({ e, i }) => {
        const on = st.exps.includes(i);
        const dis = !on && st.exps.length >= need;
        const b = Number(e.bonus) || 0;
        return `<label class="lu-chk ${on ? 'on' : ''} ${dis ? 'off' : ''}"><input type="checkbox" data-lu="exp" data-key="${i}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${esc(e.name)} +${b} → +${b + 1}</label>`;
      }).join('')}</div></div>`;
    }

    const train = trainingStep(c);
    const err = validateLevelUp(c, selection());
    box().innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="升級">
      <h2>升級　Lv ${to - 1} → Lv ${to}　<small>階級 ${tier}</small></h2>
      ${startBox}${warn}
      <p class="lu-title"><b>步驟 1</b>　從清單選 2 個名額（已選 ${sum} / 2；熟練值、兼職一次算 2 個）</p>
      <div class="lu-opts">${rows}</div>
      ${pickers}
      ${train}
      <p class="lu-title"><b>步驟 ${train ? 3 : 2}</b>　傷害閾值 +1（等級提高自動計算）；升級後再選一張不高於 ${to} 級的領域卡</p>
      <p class="lu-err">${err ? esc(err) : '&nbsp;'}</p>
      <div class="lu-actions">
        <button type="button" data-lu="cancel">取消</button>
        <button type="button" class="primary" data-lu="ok" ${err ? 'disabled' : ''}>確定升級</button>
      </div>
    </div>`;
  }

  // 有夥伴時多一個步驟：選一項夥伴訓練（規則在 companion-rules.js）
  function trainingStep(c) {
    if (!hasCompanion(c)) return '';
    const cp = c.companion;
    if (!anyTrainingLeft(c)) return '<p class="lu-title"><b>步驟 2</b>　夥伴訓練已全部選滿</p>';
    const rows = COMPANION_TRAINING.map((t) => {
      const left = trainingLeft(c, t.key);
      const on = st.train === t.key;
      let extra = '';
      if (on && t.key === 'clever') {
        const named = cp.experiences.map((e, i) => ({ e, i })).filter(({ e }) => String(e.name || '').trim());
        extra = named.length
          ? `<select data-lu="trainExp"><option value="-1">選擇夥伴經歷</option>${named.map(({ e, i }) => `<option value="${i}" ${st.trainExp === i ? 'selected' : ''}>${esc(e.name)} +${Number(e.bonus) || 0} → +${(Number(e.bonus) || 0) + 1}</option>`).join('')}</select>`
          : '<em class="warn">夥伴還沒有填寫名稱的經歷</em>';
      }
      if (on && t.key === 'vicious') {
        const die = stepUp(COMPANION_DICE, cp.die);
        const rng = stepUp(COMPANION_RANGES, cp.range);
        const radio = (v, label, ok) => `<label class="lu-chk ${ok ? '' : 'off'}"><input type="radio" name="luVicious" data-lu="vicious" value="${v}" ${st.trainVicious === v ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${esc(label)}</label>`;
        extra = radio('die', die ? `傷害骰 ${cp.die} → ${die}` : '傷害骰已是 d12', !!die) + radio('range', rng ? `距離 ${cp.range} → ${rng}` : '距離不能再提升', !!rng);
      }
      return `<label class="lu-opt ${on ? 'on' : ''} ${left ? '' : 'off'}">
        <span class="lu-label"><input type="radio" name="luTrain" data-lu="train" value="${t.key}" ${on ? 'checked' : ''} ${left ? '' : 'disabled'}>
          ${esc(t.name)} <small class="muted">${left ? `剩 ${left} 次` : '（已選滿）'}　${esc(t.desc)}</small></span>
      </label>${extra ? `<div class="lu-pick lu-chks">${extra}</div>` : ''}`;
    }).join('');
    return `<p class="lu-title"><b>步驟 2</b>　夥伴訓練：替${esc(cp.name || '夥伴')}選一項</p><div class="lu-opts">${rows}</div>`;
  }

  function drawResult() {
    const r = st.result;
    box().innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="升級完成">
      <h2>升級完成</h2>
      <ul class="lu-list">${r.changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="lu-title"><b>接下來請手動處理</b></p>
      <ul class="lu-list todo">${r.reminders.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="lu-actions"><button type="button" class="primary" data-lu="done">完成，前往領域卡</button></div>
    </div>`;
  }

  function confirmLevelUp() {
    const res = applyLevelUp(ch(), selection());
    if (!res.ok) return draw();
    Store.save();
    st.result = res;
    renderAll(); // 數值、特性、勾選格都可能改變，整頁重畫
    draw();
  }

  function onClick(e) {
    if (e.target === box()) return close(); // 點背景
    const btn = e.target.closest('button[data-lu]');
    if (!btn) return;
    const key = btn.dataset.key;
    switch (btn.dataset.lu) {
      case 'cancel': return close();
      case 'done': close(); return Sheet.focusDomainLibrary();
      case 'ok': return confirmLevelUp();
      case 'inc':
        st.counts[key] = (st.counts[key] || 0) + 1;
        break;
      case 'dec':
        st.counts[key] = Math.max(0, (st.counts[key] || 0) - 1);
        if (!st.counts[key]) delete st.counts[key];
        break;
      default: return;
    }
    trimSelection();
    draw();
  }

  function onChange(e) {
    const el = e.target;
    if (!el.dataset || !el.dataset.lu) return;
    if (el.dataset.lu === 'train') { st.train = el.value; return draw(); }
    if (el.dataset.lu === 'trainExp') { st.trainExp = Number(el.value); return draw(); }
    if (el.dataset.lu === 'vicious') { st.trainVicious = el.value; return draw(); }
    const list = el.dataset.lu === 'attr' ? st.attrs : el.dataset.lu === 'exp' ? st.exps : null;
    if (!list) return;
    const v = el.dataset.lu === 'exp' ? Number(el.dataset.key) : el.dataset.key;
    const at = list.indexOf(v);
    if (el.checked && at < 0) list.push(v);
    if (!el.checked && at >= 0) list.splice(at, 1);
    draw();
  }

  function init() {
    box().addEventListener('click', onClick);
    box().addEventListener('change', onChange);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !box().hidden) close();
    });
  }

  return { init, recordHtml, captureOpen, toggleBox, open };
})();
