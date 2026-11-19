/* 設定。
   GOOGLE_API_KEY：從 Google 試算表匯入角色時使用的 API key。
   這個 key 會公開在網頁程式碼裡，所以一定要在 Google Cloud Console 限制：
   「應用程式限制」選 HTTP 參照網址，只放你的網站（例如 https://你的帳號.github.io/*，
   本機測試再加 http://localhost:8080/*）；「API 限制」只勾 Google Sheets API。
   留空也可以，匯入視窗裡可以自己貼上，會存在這台瀏覽器。 */
const GOOGLE_API_KEY = 'AIzaSyArSBfwhqSCDMHF-3MP6KGeIx0dw4n1788';
