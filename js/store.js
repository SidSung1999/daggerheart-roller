/* 資料存取層。目前存在瀏覽器 localStorage，之後要接 Firebase 只需替換這一層。 */
const Store = (() => {
  const KEY = 'dh-roller-v1';
  let state = { activeId: null, characters: {} };
  const listeners = []; // 存檔後通知（例如共享房間的角色卡分享）

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      console.warn('讀取存檔失敗，改用預設資料', e);
      state = { activeId: null, characters: {} };
    }
    if (!state.characters || !Object.keys(state.characters).length) {
      const c = normalizeCharacter(sampleCharacter());
      state = { activeId: c.id, characters: { [c.id]: c } };
    }
    Object.values(state.characters).forEach(normalizeCharacter);
    if (!state.characters[state.activeId]) state.activeId = Object.keys(state.characters)[0];
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('儲存失敗：瀏覽器儲存空間不足或被停用');
    }
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.warn(e); }
    });
  }

  const list = () => Object.values(state.characters).map((c) => ({ id: c.id, name: c.name }));
  const active = () => state.characters[state.activeId];
  const activeId = () => state.activeId;
  const get = (id) => state.characters[id];
  const onSave = (fn) => listeners.push(fn);

  function setActive(id) {
    if (state.characters[id]) {
      state.activeId = id;
      save();
    }
  }

  function add(char) {
    const c = normalizeCharacter(char);
    state.characters[c.id] = c;
    state.activeId = c.id;
    save();
    return c;
  }

  function remove(id) {
    if (Object.keys(state.characters).length <= 1) return false;
    delete state.characters[id];
    if (state.activeId === id) state.activeId = Object.keys(state.characters)[0];
    save();
    return true;
  }

  function exportActive() {
    return JSON.stringify({ app: 'daggerheart-roller', version: 1, characters: [active()] }, null, 2);
  }

  // 匯入時一律產生新 id，避免覆蓋現有角色
  function importText(text) {
    const data = JSON.parse(text);
    const chars = Array.isArray(data.characters) ? data.characters : [data];
    let count = 0;
    chars.forEach((c) => {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return;
      const copy = JSON.parse(JSON.stringify(c));
      copy.id = uid();
      add(copy);
      count++;
    });
    return count;
  }

  return { load, save, list, active, activeId, get, onSave, setActive, add, remove, exportActive, importText };
})();
