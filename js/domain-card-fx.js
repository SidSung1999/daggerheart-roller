/* 領域卡的預設擲骰設定（手動維護）。
   鍵為「領域|卡名」。沒列在這裡的卡，加入角色時作用預設為「無（僅記錄）」，
   玩家可以在角色卡的「擲骰設定」自行調整。
   欄位：target = damage | check | standalone | none
         formula = 骰子公式、scaleProf = 第一組骰子乘以熟練值
         condLabel / condFormula = 條件成立時追加的公式 */
const DOMAIN_CARD_FX = {
  '午夜 Midnight|滂沱劍雨': {
    target: 'standalone',
    formula: 'd8+2',
    scaleProf: true,
    condLabel: '目標處於脆弱',
    condFormula: '1d8',
  },
};
