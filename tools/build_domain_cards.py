#!/usr/bin/env python3
"""把領域卡 CSV 轉成網頁使用的 js/domain-cards.js。

用法（在專案根目錄）：
    python3 tools/build_domain_cards.py [CSV 路徑]

預設讀取 data/domain-cards.csv。新增卡片時，更新 CSV 後重新執行即可。
欄位以標題名稱對應，所以欄位順序改變也沒關係。
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "domain-cards.csv"
OUT = ROOT / "js" / "domain-cards.js"

# 標題內可能有換行或全形空白（例如「喚回\n費用」「　描述」），先清掉再比對
def norm(h):
    return re.sub(r"[\s\u3000]+", "", h)

FIELDS = {
    "領域": "domain",
    "類別": "type",
    "等級": "level",
    "喚回費用": "recall",
    "名稱": "name",
    "描述": "desc",
    "名稱-原文": "orig",
}


def main():
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    header = [norm(h) for h in rows[0]]
    missing = [k for k in ("領域", "類別", "等級", "喚回費用", "名稱", "描述") if k not in header]
    if missing:
        sys.exit(f"CSV 缺少欄位：{', '.join(missing)}")
    idx = {FIELDS[h]: i for i, h in enumerate(header) if h in FIELDS}

    cards, seen = [], set()
    for n, r in enumerate(rows[1:], start=2):
        get = lambda k: r[idx[k]].strip() if k in idx and idx[k] < len(r) else ""
        name = get("name")
        if not name:
            continue
        try:
            level, recall = int(get("level")), int(get("recall"))
        except ValueError:
            sys.exit(f"第 {n} 行（{name}）的等級或喚回費用不是數字")
        key = (get("domain"), name)
        if key in seen:
            print(f"警告：第 {n} 行重複的卡片 {key}", file=sys.stderr)
        seen.add(key)
        card = {
            "domain": get("domain"),
            "type": get("type"),
            "level": level,
            "recall": recall,
            "name": name,
            "desc": get("desc"),
        }
        if get("orig"):
            card["orig"] = get("orig")
        cards.append(card)

    lines = ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in cards)
    OUT.write_text(
        "/* 自動產生，請勿手動編輯。來源：data/domain-cards.csv\n"
        "   更新方式：python3 tools/build_domain_cards.py */\n"
        f"const DOMAIN_CARDS = [\n{lines},\n];\n",
        encoding="utf-8",
    )
    print(f"已輸出 {len(cards)} 張卡 -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
