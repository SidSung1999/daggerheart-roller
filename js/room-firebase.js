/* 共享房間的連線層：Firebase Realtime Database。
   只負責「匿名登入、連上房間、送出一筆擲骰、收到別人的擲骰、知道誰在線上」，不碰畫面。
   之後要換成別的連線方式（例如 WebRTC 點對點），只要實作同樣的 create() / connect() 介面即可。

   資料結構（rooms/<房間代碼>/ 底下）：
     rolls/<自動產生的key>   一筆擲骰：{ uid, t, by, ch, kind, title, text, total, hope?, fear?, hs?, fs?, v? }
     presence/<自動產生的key> 在線的人：{ uid, name }，斷線時自動刪除（同一人開兩個分頁會有兩筆）
   uid 是 Firebase 匿名登入給這個瀏覽器的身分代碼，資料庫規則用它限制「只能寫自己的資料」。
   匿名登入不需要玩家操作；身分記在瀏覽器裡，換瀏覽器、無痕視窗或清除網站資料會變成新的身分。
   設定在 js/config.js 的 FIREBASE_CONFIG，建立步驟與資料庫規則見 docs/共享擲骰設定.md。 */
const RoomFirebase = (() => {
  const VERSION = '13.4.0';
  const CDN = `https://www.gstatic.com/firebasejs/${VERSION}/`;
  const HISTORY = 50; // 加入房間時帶入最近幾筆

  // 要用到才載入，沒有加入房間的人不會多下載任何東西
  async function loadModules() {
    const [app, db, auth] = await Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-database.js'),
      import(CDN + 'firebase-auth.js'),
    ]);
    return { app, db, auth };
  }

  // Firebase 的路徑不能含 . $ # [ ] /，所以把這些字元與空白換成底線
  const safeCode = (code) => String(code || '').trim().replace(/[.$#[\]/\s]+/g, '_').slice(0, 40);

  // 匿名登入：先等瀏覽器裡記住的身分載入，沒有才建立新的。回傳 uid。
  async function signIn(m, app) {
    const auth = m.auth.getAuth(app);
    try {
      if (auth.authStateReady) await auth.authStateReady();
      if (!auth.currentUser) await m.auth.signInAnonymously(auth);
    } catch (e) {
      const code = String((e && e.code) || '');
      if (/operation-not-allowed|admin-restricted-operation/.test(code)) {
        throw new Error('Firebase 還沒有啟用匿名登入：請到 Firebase 主控台 Authentication → 登入方式，啟用「匿名」（見 docs/共享擲骰設定.md）');
      }
      if (/network/.test(code)) throw new Error('匿名登入失敗：網路連線有問題');
      throw new Error(`匿名登入失敗：${(e && e.message) || code || e}`);
    }
    return auth.currentUser.uid;
  }

  // modules 只給測試用：可以塞假的 Firebase 進來
  function create(modules) {
    return {
      async connect({ code, name, onRoll, onPresence, onError }) {
        const cfg = typeof FIREBASE_CONFIG !== 'undefined' ? FIREBASE_CONFIG : {};
        if (!cfg.databaseURL) {
          throw new Error('還沒有設定 Firebase：請把 firebaseConfig 填進 js/config.js（步驟見 docs/共享擲骰設定.md）');
        }
        const room = safeCode(code);
        if (!room) throw new Error('請輸入房間代碼');

        let m = modules;
        if (!m) {
          try {
            m = await loadModules();
          } catch (e) {
            throw new Error('載入 Firebase 失敗，請檢查網路');
          }
        }
        const { initializeApp, getApps } = m.app;
        const app = getApps().find((a) => a.name === 'dh-room') || initializeApp(cfg, 'dh-room');
        const uid = await signIn(m, app);
        const db = m.db.getDatabase(app);
        const rollsRef = m.db.ref(db, `rooms/${room}/rolls`);
        const presenceRef = m.db.ref(db, `rooms/${room}/presence`);
        const me = m.db.push(presenceRef);

        // 連線建立（含斷線重連）時，重新登記在線並設定斷線自動移除
        const offConnected = m.db.onValue(m.db.ref(db, '.info/connected'), (snap) => {
          if (!snap.val()) return;
          m.db.onDisconnect(me).remove();
          m.db.set(me, { uid, name }).catch(() => {});
        });
        const offPresence = m.db.onValue(
          presenceRef,
          (snap) => onPresence(Object.values(snap.val() || {}).map((p) => String(p && p.name ? p.name : '?'))),
          (err) => onError && onError(err)
        );
        const offRolls = m.db.onChildAdded(
          m.db.query(rollsRef, m.db.limitToLast(HISTORY)),
          (snap) => onRoll(snap.val(), snap.key),
          (err) => onError && onError(err)
        );

        return {
          room,
          uid,
          push: (roll) => m.db.set(m.db.push(rollsRef), { ...roll, uid }),
          async leave() {
            offConnected();
            offPresence();
            offRolls();
            await m.db.remove(me).catch(() => {});
          },
        };
      },
    };
  }

  return { create, safeCode };
})();
