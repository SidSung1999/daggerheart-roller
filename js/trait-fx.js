/* 角色特性的預設擲骰設定（手動維護）。
   鍵為特性名稱。只有「自動加入」的特性（種族、背景、轉變、職業、子職）會套用，
   而且每個特性只套用一次，之後玩家在角色卡「擲骰設定」改的內容不會被蓋掉。
   欄位與領域卡的設定相同（見 domain-card-fx.js）：
     target = damage（加到傷害）| check（加到檢定）| standalone（獨立傷害）
     formula、scaleProf、perUnit、unitDiceOnly、unitSpellcast、unitLabel、condLabel / condFormula
   升級後變強的特性（例如神恩之力之於輝光羽翼）兩個都在身上時，擲骰器兩個都會列出，由玩家勾新的那個。
   這裡只收錄公式明確、不需要額外判斷的特性；是否滿足發動條件（例如「成功攻擊時」「恐懼成功時」）
   由玩家在擲骰時自己決定要不要勾選。 */
const TRAIT_FX = {
  // ----- 子職：翼哨（花費 1 希望點，成功攻擊時額外傷害；神恩之力升級後 1d8 變 1d12）-----
  '輝光羽翼': { target: 'damage', formula: '1d8' },
  '神恩之力': { target: 'damage', formula: '1d12' }, // 升級版輝光羽翼：兩個都在身上時，擲骰器兩個都會列出，只勾這個

  // ----- 子職：戰爭學派（攻擊檢定恐懼成功時額外魔法傷害，逐級變強）-----
  '直面恐懼': { target: 'damage', formula: '1d10' },
  '懼為己有': { target: 'damage', formula: '2d10' },
  '無所畏懼': { target: 'damage', formula: '3d10' },

  // ----- 子職：其他 -----
  '詩人之心': { target: 'check', formula: 'd4' }, // 說書人：花費 1 希望點，說服、打動類的動作檢定 +d4
  '波動砲': { target: 'standalone', formula: 'd20+3', scaleProf: true }, // 武術達人：熟練值 × d20 + 3 魔法傷害

  // ----- 種族 -----
  '獠牙': { target: 'damage', formula: '1d6' }, // 半獸人：花費 1 希望點，成功攻擊時額外傷害
  '踢擊': { target: 'damage', formula: '2d6' }, // 羊人：標記 1 壓力點，額外傷害
  '燃火': { target: 'damage', formula: '1d6' }, // 元素：餘燼族：武器著火時傷害檢定 +1d6
  '元素吐息': { target: 'standalone', formula: 'd8', scaleProf: true }, // 龍人：熟練值 × d8 魔法傷害
  '衝撞': { target: 'standalone', formula: '1d12' }, // 費爾伯格：近戰範圍內所有目標 1d12 物理傷害
  '長舌': { target: 'standalone', formula: 'd12', scaleProf: true }, // 蛙人：熟練值 × d12 物理傷害

  // ----- 轉變 -----
  '狼化': { target: 'damage', formula: '1d10' }, // 狼人：狼形態下攻擊與傷害檢定 +1d10
  '尖銳獠牙': { target: 'standalone', formula: 'd6', scaleProf: true }, // 吸血鬼：熟練值 × d6 物理傷害
};
