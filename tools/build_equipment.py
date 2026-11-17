#!/usr/bin/env python3
"""把武器、護甲 CSV 轉成網頁使用的 js/weapons.js 與 js/armors.js。

用法（在專案根目錄）：
    python3 tools/build_equipment.py [武器CSV] [護甲CSV]

預設讀取 data/weapons.csv 與 data/armor.csv。
CSV 上方有說明文字，腳本會自動找到標題列（第一欄為「階級」的那一列）。
欄位以標題名稱對應，所以欄位順序改變也沒關係。
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEAPON_SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "weapons.csv"
ARMOR_SRC = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "armor.csv"

DAMAGE_RE = re.compile(r"^\d*d\d+([+-](\d*d\d+|\d+))*$", re.I)


def norm(h):
    return re.sub(r"[\s\u3000]+", "", h)


def read_table(path, required):
    """回傳以標題名稱為鍵的 dict 列表（略過標題列之前的說明與空白列）。"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    start = next((i for i, r in enumerate(rows) if r and norm(r[0]) == "階級"), None)
    if start is None:
        sys.exit(f"{path.name}：找不到標題列（第一欄應為「階級」）")
    header = [norm(h) for h in rows[start]]
    missing = [h for h in required if h not in header]
    if missing:
        sys.exit(f"{path.name} 缺少欄位：{', '.join(missing)}")
    out = []
    for n, r in enumerate(rows[start + 1:], start=start + 2):
        if not any(c.strip() for c in r):
            continue
        rec = {h: (r[i].strip() if i < len(r) else "") for i, h in enumerate(header)}
        rec["_line"] = n
        out.append(rec)
    return out


def to_int(rec, key, what):
    try:
        return int(rec[key])
    except ValueError:
        sys.exit(f"第 {rec['_line']} 行（{what}）的「{key}」不是數字：{rec[key]!r}")


def write_js(path, const, comment, items):
    lines = ",\n".join("  " + json.dumps(it, ensure_ascii=False) for it in items)
    path.write_text(
        f"/* 自動產生，請勿手動編輯。{comment}\n"
        "   更新方式：python3 tools/build_equipment.py */\n"
        f"const {const} = [\n{lines},\n];\n",
        encoding="utf-8",
    )
    print(f"已輸出 {len(items)} 筆 -> {path.relative_to(ROOT)}")


def build_weapons():
    recs = read_table(WEAPON_SRC, ["階級", "負荷", "武器", "屬性", "特徵", "距離", "傷害", "傷害類型", "框架"])
    items, seen = [], set()
    for r in recs:
        name = r["武器"]
        if not name:
            continue
        if name in seen:
            print(f"警告：武器名稱重複：{name}（第 {r['_line']} 行）", file=sys.stderr)
        seen.add(name)
        dmg = r["傷害"].replace(" ", "")
        if not DAMAGE_RE.match(dmg):
            print(f"警告：{name} 的傷害格式無法辨識：{r['傷害']!r}", file=sys.stderr)
        items.append({
            "tier": to_int(r, "階級", name),
            "hands": r["負荷"],
            "name": name,
            "trait": r["屬性"],
            "features": r["特徵"],
            "range": r["距離"],
            "damage": dmg,
            "type": r["傷害類型"],
            "frame": r["框架"],
        })
    write_js(ROOT / "js" / "weapons.js", "WEAPONS", "來源：data/weapons.csv", items)


def build_armors():
    recs = read_table(ARMOR_SRC, ["階級", "護甲", "中傷", "重傷", "特徵", "護甲值", "框架"])
    items, seen = [], set()
    for r in recs:
        name = r["護甲"]
        if not name:
            continue
        if name in seen:
            print(f"警告：護甲名稱重複：{name}（第 {r['_line']} 行）", file=sys.stderr)
        seen.add(name)
        items.append({
            "tier": to_int(r, "階級", name),
            "name": name,
            "major": to_int(r, "中傷", name),
            "severe": to_int(r, "重傷", name),
            "features": r["特徵"],
            "score": r["護甲值"],  # 可能是「3 + 力」這類文字，保留原樣
            "frame": r["框架"],
        })
    write_js(ROOT / "js" / "armors.js", "ARMORS", "來源：data/armor.csv", items)


if __name__ == "__main__":
    build_weapons()
    build_armors()
