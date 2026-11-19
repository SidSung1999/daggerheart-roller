/* 領域卡的預設擲骰設定（手動維護）。
   鍵為「領域|卡名」。沒列在這裡的卡，加入角色時作用預設為「無（僅記錄）」，
   玩家可以在角色卡的「擲骰設定」自行調整。
   欄位：target = damage | check | standalone | none
         formula = 骰子公式、scaleProf = 第一組骰子乘以熟練值
         condLabel / condFormula = 條件成立時追加的公式
         perUnit = true 時，公式依擲骰時填的資源量 N 重複（乘以 N）；unitDiceOnly = true 時只乘第一組骰子
         （固定加值只算一次）；unitSpellcast = true 時 N 預設帶入施法屬性值；
         unitLabel = 資源名稱、unitMax = N 的上限 */
const DOMAIN_CARD_FX = {
  // 依消耗的資源決定次數：整個公式乘以 N（N 在擲骰時填）。星辰隕落：每標記 1 壓力點造成 1d20+2。
  '祕術 Arcana|星辰隕落': { target: 'standalone', formula: '1d20+2', perUnit: true, unitLabel: '標記的壓力點' },
  '祕術 Arcana|釋放混沌': { target: 'standalone', formula: 'd10', perUnit: true, unitLabel: '花費的指示物' },
  '恐怖 Dread|破滅詛咒': { target: 'standalone', formula: 'd20', perUnit: true, unitLabel: '標記的壓力點' },
  '法典 Codex|伊利亞特之書': { target: 'standalone', formula: 'd6', perUnit: true, unitLabel: '花費的希望點' }, // 奧術彈幕；睡眠術、心靈感應沒有傷害
  '午夜 Midnight|夜魘降臨': { target: 'standalone', formula: 'd6', perUnit: true, unitLabel: '竊取的恐懼點' }, // 總傷害由你分配給驚懼的目標
  '午夜 Midnight|午夜精魂': { target: 'standalone', formula: 'd6', perUnit: true, unitSpellcast: true, unitLabel: '骰數（施法屬性）' },
  '恐怖 Dread|黯炎': { target: 'standalone', formula: 'd8+6', perUnit: true, unitDiceOnly: true, unitSpellcast: true, unitLabel: '骰數（施法屬性）' }, // 檢定成功的目標只受一半傷害
  // 加到傷害檢定：每花費 1 個資源增加一組骰子
  '午夜 Midnight|法術充能': { target: 'damage', formula: 'd6', perUnit: true, unitLabel: '花費的指示物' },
  '午夜 Midnight|暮光喪鐘': { target: 'damage', formula: 'd12', perUnit: true, unitLabel: '花費的指示物' },
  '恐怖 Dread|黑暗大軍': { target: 'damage', formula: 'd8', perUnit: true, unitLabel: '花費的指示物', unitMax: 8 },
  '恐怖 Dread|惡意化身': { target: 'damage', formula: 'd6', perUnit: true, unitLabel: 'GM 的恐懼點' },
  '午夜 Midnight|滂沱劍雨': {
    target: 'standalone',
    formula: 'd8+2',
    scaleProf: true,
    condLabel: '目標處於脆弱',
    condFormula: '1d8',
  },
};
