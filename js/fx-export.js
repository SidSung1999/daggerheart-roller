/* 匯出擲骰設定：掃描這個瀏覽器裡所有角色，找出玩家自己調整過、和專案預設不同的擲骰設定，
   產生可以直接貼進 js/domain-card-fx.js（DOMAIN_CARD_FX）與 js/trait-fx.js（TRAIT_FX）的文字。
   - 領域卡：只收卡片庫裡有的卡（以「領域|卡名」對應），自訂卡不收
   - 角色特性：只收自動加入的特性（種族、職業、子職、野獸型態…），以特性名稱對應；手動新增的不收
   - 作用是「無」且專案也沒有預設的不收；和專案預設完全相同的不收
   - 同一張卡 / 同一個特性有多種不同設定時全部列出，並註明是哪些角色設的，由維護者挑一個 */
const FxExport = (() => {
  const box = () => document.getElementById('fxexport');
  const FIELDS = Object.keys(defaultFx());

  const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;

  // 只留和 defaultFx() 不同的欄位，並統一型別
  function clean(fx) {
    const d = defaultFx();
    const out = {};
    FIELDS.forEach((k) => {
      let v = fx ? fx[k] : undefined;
      if (v === undefined || v === null) v = d[k];
      if (typeof d[k] === 'boolean') v = !!v;
      else if (typeof d[k] === 'number') v = Number(v) || 0;
      else v = String(v).trim();
      if (v !== d[k]) out[k] = v;
    });
    if (!out.target) out.target = 'none'; // target 一定要寫出來
    return out;
  }

  const literal = (o) =>
    `{ ${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? q(v) : v}`).join(', ')} }`;
  const same = (a, b) => literal(a) === literal(b);

  // 回傳 { cards: [{ key, current, variants: [{ fx, chars }] }], traits: [...] }
  function collect() {
    const known = new Set(DOMAIN_CARDS.map((x) => `${x.domain}|${x.name}`));
    const groups = { cards: new Map(), traits: new Map() };
    const add = (kind, key, projectFx, fx, charName) => {
      const current = projectFx ? clean(projectFx) : null;
      const mine = clean(fx);
      if (current ? same(mine, current) : mine.target === 'none') return;
      if (!groups[kind].has(key)) groups[kind].set(key, { key, current, variants: [] });
      const g = groups[kind].get(key);
      const v = g.variants.find((x) => same(x.fx, mine));
      if (v) {
        if (!v.chars.includes(charName)) v.chars.push(charName);
      } else g.variants.push({ fx: mine, chars: [charName] });
    };
    Store.list().forEach(({ id }) => {
      const c = Store.get(id);
      const who = c.name || '(未命名)';
      c.domainCards.forEach((card) => {
        const key = `${card.domain}|${card.name}`;
        if (known.has(key)) add('cards', key, DOMAIN_CARD_FX[key], card.fx, who);
      });
      c.traits.forEach((t) => {
        const name = String(t.name || '').trim();
        if (t.auto && name) add('traits', name, TRAIT_FX[name], t.fx, who);
      });
    });
    return { cards: [...groups.cards.values()], traits: [...groups.traits.values()] };
  }

  function section(title, list) {
    if (!list.length) return '';
    const lines = [`// ===== ${title} =====`];
    list.forEach((g) => {
      if (g.variants.length > 1) lines.push(`// ⚠ 「${g.key}」有 ${g.variants.length} 種不同設定，請只保留一行`);
      if (g.current) lines.push(`// 專案目前的預設：${q(g.key)}: ${literal(g.current)}`);
      g.variants.forEach((v) => {
        const note = v.fx.target === 'none' ? '（玩家改成「無」）' : '';
        lines.push(`${q(g.key)}: ${literal(v.fx)}, // 角色：${v.chars.join('、')}${note}`);
      });
    });
    return lines.join('\n');
  }

  function text() {
    const r = collect();
    const parts = [
      section('貼到 js/domain-card-fx.js 的 DOMAIN_CARD_FX', r.cards),
      section('貼到 js/trait-fx.js 的 TRAIT_FX', r.traits),
    ].filter(Boolean);
    return { text: parts.join('\n\n'), count: r.cards.length + r.traits.length };
  }

  function open() {
    const { text: t, count } = text();
    box().hidden = false;
    box().innerHTML = `<div class="lu-modal" role="dialog" aria-modal="true" aria-label="匯出擲骰設定">
      <h2>匯出擲骰設定</h2>
      <p class="muted">列出這個瀏覽器所有角色中，和專案預設不同的領域卡、角色特性擲骰設定（${count} 項）。
        複製後傳給維護者，貼進對應的檔案即可成為新的預設。</p>
      ${count
        ? `<textarea class="fx-out" readonly rows="14" aria-label="擲骰設定">${esc(t)}</textarea>
           <div class="lu-actions"><button type="button" data-fxe="close">關閉</button><button type="button" class="primary" data-fxe="copy">複製</button></div>`
        : `<p class="lu-title">沒有和預設不同的設定。</p><div class="lu-actions"><button type="button" class="primary" data-fxe="close">關閉</button></div>`}
    </div>`;
  }

  function close() {
    box().hidden = true;
    box().innerHTML = '';
  }

  async function copy() {
    const ta = box().querySelector('.fx-out');
    if (!ta) return;
    try {
      await navigator.clipboard.writeText(ta.value);
      toast('已複製');
    } catch (e) {
      ta.select(); // 不能用剪貼簿時，選取文字讓使用者自己複製
      toast('請按 Ctrl+C 複製選取的文字');
    }
  }

  function init() {
    document.getElementById('btnFx').addEventListener('click', open);
    box().addEventListener('click', (e) => {
      if (e.target === box()) return close();
      const b = e.target.closest('button[data-fxe]');
      if (!b) return;
      if (b.dataset.fxe === 'copy') copy();
      else close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !box().hidden) close();
    });
  }

  return { init, collect, text, open };
})();
