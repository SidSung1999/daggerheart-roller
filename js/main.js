/* 啟動、角色選單、匯入匯出、分頁切換 */

function refreshBar() {
  const sel = document.getElementById('charSelect');
  sel.innerHTML = Store.list()
    .map((c) => `<option value="${esc(c.id)}" ${c.id === Store.activeId() ? 'selected' : ''}>${esc(c.name || '(未命名)')}</option>`)
    .join('');
}

function renderAll() {
  refreshBar();
  Sheet.render();
  Roller.render();
}

function showView(name) {
  document.querySelectorAll('.main-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'roller') Roller.render(); // 切過來時重新讀取最新的角色卡資料
  if (name === 'party') Party.render();
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  const frameTag = (x) => (x.frame && x.frame !== '標準' ? `・${x.frame}` : '');
  const weaponOptions = (list) =>
    list
      .map((w) => `<option value="${esc(w.name)}" label="${esc(`T${w.tier}・${w.hands}・${w.trait}・${w.range}・${w.damage}${frameTag(w)}`)}"></option>`)
      .join('');
  document.getElementById('weaponList').innerHTML = weaponOptions(WEAPONS);
  document.getElementById('mainWeaponList').innerHTML = weaponOptions(WEAPONS.filter((w) => w.hands !== '副手'));
  document.getElementById('offWeaponList').innerHTML = weaponOptions(WEAPONS.filter((w) => w.hands === '副手'));
  document.getElementById('armorList').innerHTML = ARMORS.map(
    (a) => `<option value="${esc(a.name)}" label="${esc(`T${a.tier}・閾值 ${a.major}/${a.severe}・護甲值 ${a.score}${frameTag(a)}`)}"></option>`
  ).join('');

  const domainNames = [...new Set(DOMAIN_CARDS.map((c) => c.domain))];
  document.getElementById('domainList').innerHTML = domainNames.map((d) => `<option value="${esc(d)}"></option>`).join('');

  Sheet.init();
  Roller.init();
  LevelUp.init();
  FreeRoll.init();
  Party.init(); // 要在 Room.init 之前：Room 自動回到房間時會呼叫 Party.attach
  Room.init();
  GsImport.init();
  document.getElementById('btnGs').addEventListener('click', () => GsImport.open());
  renderAll();

  document.querySelectorAll('.main-tabs button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  document.getElementById('charSelect').addEventListener('change', (e) => {
    Store.setActive(e.target.value);
    renderAll();
  });

  document.getElementById('btnNew').addEventListener('click', () => {
    const name = prompt('新角色名稱：', '新角色');
    if (name === null) return;
    const c = blankCharacter();
    c.name = name.trim() || '新角色';
    c.id = uid();
    Store.add(c);
    renderAll();
  });

  document.getElementById('btnDel').addEventListener('click', () => {
    const c = Store.active();
    if (!confirm(`確定要刪除「${c.name}」嗎？此動作無法復原。`)) return;
    if (!Store.remove(c.id)) {
      toast('至少要保留一個角色');
      return;
    }
    renderAll();
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    const c = Store.active();
    downloadText(`${(c.name || 'character').replace(/[\\/:*?"<>|]/g, '_')}.json`, Store.exportActive());
  });

  const file = document.getElementById('fileImport');
  document.getElementById('btnImport').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const n = Store.importText(await f.text());
      if (!n) throw new Error('empty');
      renderAll();
      toast(`已匯入 ${n} 個角色`);
    } catch (err) {
      toast('匯入失敗：檔案格式不正確');
    }
  });
});
