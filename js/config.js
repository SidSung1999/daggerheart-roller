/* 設定。
   GOOGLE_API_KEY：從 Google 試算表匯入角色時使用的 API key。
   這個 key 會公開在網頁程式碼裡，所以一定要在 Google Cloud Console 限制：
   「應用程式限制」選 HTTP 參照網址，只放你的網站（例如 https://你的帳號.github.io/*，
   本機測試再加 http://localhost:8080/*）；「API 限制」只勾 Google Sheets API。
   留空也可以，匯入視窗裡可以自己貼上，會存在這台瀏覽器。 */
const GOOGLE_API_KEY = 'AIzaSyArSBfwhqSCDMHF-3MP6KGeIx0dw4n1788';

/* FIREBASE_CONFIG：共享擲骰房間使用的 Firebase 設定（Realtime Database）。
   把 Firebase 主控台「專案設定 → 您的應用程式 → SDK 設定與配置」裡的 firebaseConfig 貼進來，
   一定要有 databaseURL。這些值本來就會公開在網頁裡，安全靠的是資料庫規則，
   設定步驟與規則見 docs/共享擲骰設定.md。留空的話，其他功能照常，只是不能加入房間。 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyALAWeCznPMVDh_dEyJ85opPahG-kJKZsc",
  authDomain: "daggerheart-roller.firebaseapp.com",
  databaseURL: "https://daggerheart-roller-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "daggerheart-roller",
  storageBucket: "daggerheart-roller.firebasestorage.app",
  messagingSenderId: "64791352243",
  appId: "1:64791352243:web:163562f69e1f42f72fb1c6"
};
