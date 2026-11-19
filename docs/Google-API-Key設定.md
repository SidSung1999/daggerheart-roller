# 設定 Google API Key（給「Google 匯入」用）

做一次就好，之後所有人共用同一把金鑰。整個流程大約 10 分鐘。

> 介面文字依 Google 帳號的語言顯示。下面用英文名稱，括號內是中文介面常見的字樣，位置可能因 Google 改版略有不同。

## 事前準備

- 用**個人 Google 帳號**登入，不要用公司帳號。公司帳號可能被管理員限制建立專案，也不適合放個人的遊戲專案。
- 先確認你的角色卡試算表已經建好「匯出頁」分頁（格式見 `匯出頁格式.md`）。

## 步驟 1：建立 Google Cloud 專案

1. 開 <https://console.cloud.google.com/>，第一次使用要同意服務條款。
2. 畫面最上方的專案選單（顯示 "Select a project" 或目前專案名稱）→ **New project**（新增專案）。
3. 專案名稱隨意，例如 `daggerheart-roller`。「Organization / Location」維持預設（沒有組織）→ **Create**（建立）。
4. 建好後，確認上方專案選單顯示的是剛建的專案。後面的步驟都要在這個專案下操作。

## 步驟 2：啟用 Google Sheets API

1. 左上選單 → **APIs & Services**（API 和服務）→ **Library**（程式庫）。
2. 搜尋 `Google Sheets API`，點進去 → **Enable**（啟用）。
   - 也可以直接開 <https://console.cloud.google.com/apis/library/sheets.googleapis.com>，確認上方專案是剛建的那個，再按啟用。

## 步驟 3：建立 API Key

1. 左上選單 → **APIs & Services** → **Credentials**（憑證）。
2. **Create credentials**（建立憑證）→ **API key**（API 金鑰）。
3. 跳出視窗會顯示金鑰（一串 `AIza` 開頭的字）。先不要關，按 **Edit API key**（編輯 API 金鑰），或之後在憑證列表點金鑰名稱進入編輯頁。
4. 名稱改成好認的，例如 `daggerheart-web`。

## 步驟 4：限制金鑰（這一步不能省）

金鑰會公開在網頁程式碼裡，任何人都看得到，所以要限制它只能從你的網站使用、只能呼叫 Sheets API。

**Application restrictions（應用程式限制）**

1. 選 **Websites**（HTTP referrers / 網站）。
2. 在 **Website restrictions**（網站限制）按 **Add an item**（新增項目），逐一加入：
   - `https://你的帳號.github.io/*`（把「你的帳號」換成 GitHub 帳號，例如 `https://g23598750.github.io/*`）
   - `http://localhost:8080/*`（本機測試用，不測試可以不加）
3. 規則說明：一定要以 `/*` 結尾，前面的網址要含 `https://` 或 `http://` 和網域。因為瀏覽器對跨網站請求只會送出網站的根網址，所以寫網域加 `/*` 就能涵蓋你網站底下所有頁面。

**API restrictions（API 限制）**

1. 選 **Restrict key**（限制金鑰）。
2. 下拉清單勾選 **Google Sheets API**。清單裡找不到的話，代表步驟 2 還沒啟用成功或專案選錯了。
3. 按 **OK**，最後按頁面下方的 **Save**（儲存）。

限制生效最多可能要等幾分鐘。

## 步驟 5：把金鑰放進網頁

兩種方式擇一：

- **放進程式碼（推薦，朋友就不用各自貼）**：打開 `js/config.js`，把金鑰貼進單引號：
  ```js
  const GOOGLE_API_KEY = 'AIza這裡貼你的金鑰';
  ```
  存檔、commit、push。因為步驟 4 已經限制網址與 API，放在公開的程式碼裡是可以接受的。
- **每個人自己貼**：不改程式碼，在網頁「Google 匯入」視窗的 API Key 欄貼上，只會存在那台瀏覽器。

## 步驟 6：試試看

1. 試算表右上角「共用」→ 一般存取權改成「知道連結的任何人」，角色「檢視者」。
2. 開網頁，按「Google 匯入」，貼上試算表網址，按匯入。

## 出錯時

| 看到的訊息 | 可能原因 |
|---|---|
| 沒有權限：請確認試算表共用…… | 試算表還沒設成「知道連結的人可檢視」；或網站網址不在金鑰的允許清單；或剛改完限制還沒生效，等幾分鐘 |
| API Key 無效 | 金鑰貼錯（前後多了空白或引號）；或金鑰剛建好還沒生效 |
| 找不到分頁「匯出頁」 | 分頁名稱不一致，或匯入視窗的「分頁名稱」欄填錯 |
| 找不到這份試算表 | 網址貼錯，要包含 `/spreadsheets/d/` 那一段 |
| 連不上 Google | 網路問題 |

**注意：不要用瀏覽器網址列直接開 API 網址來測試。** 金鑰限制了網站來源後，網址列直接開沒有「來源網站」，一定會被擋，回應會寫 referer 是空的。這是正常的，請改用網頁裡的匯入按鈕測試。

## 費用與額度

Google Sheets API 本身不收費，有每分鐘請求數量的上限，一場遊戲幾個人偶爾匯入幾次遠遠不會達到。建立專案與啟用這個 API 通常不需要綁定付款方式；如果過程中 Google 要求你綁定，請先停下來確認是不是點到了其他付費服務。

## 參考

- Google：[啟用 API](https://developers.google.com/workspace/guides/enable-apis)
- Google：[替 API 金鑰加上限制](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)
