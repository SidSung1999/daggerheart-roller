#!/usr/bin/env python3
"""把職業選項 CSV 轉成網頁使用的 js/classes.js。

用法（在專案根目錄）：
    python3 tools/build_classes.py [CSV 路徑]

預設讀取 data/classes.csv。這份 CSV 在同一張表裡並排放了兩個表格：
  左側（第 0~8 欄）職業：職業、閃避、生命、希望特性、職業特性、領域1、(空)、領域2、(空)
  右側（第 9~16 欄）子職：職業、子職、(空)、介紹、施法屬性、基礎特性、專精特性、大師特性
左側表格有標題列（第一欄為「職業」、第二欄為「閃避」）。右側沒有標題，從同一列開始就是資料。
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "classes.csv"
OUT = ROOT / "js" / "classes.js"

WIDTH = 17


def clean(text):
    """去掉每行頭尾空白（含全形空白）與空行，保留換行。"""
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def to_int(text, what):
    try:
        return int(text.strip())
    except ValueError:
        sys.exit(f"{what} 不是數字：{text!r}")


def main():
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = [r + [""] * (WIDTH - len(r)) for r in csv.reader(f)]

    head = next((i for i, r in enumerate(rows) if r[0].strip() == "職業" and r[1].strip() == "閃避"), None)
    if head is None:
        sys.exit("找不到職業表的標題列（第一欄「職業」、第二欄「閃避」）")

    classes = []
    for r in rows[head + 1:]:
        if not r[0].strip():
            break
        name = r[0].strip()
        classes.append({
            "name": name,
            "evasion": to_int(r[1], f"{name} 的閃避"),
            "hp": to_int(r[2], f"{name} 的生命"),
            "hopeFeature": clean(r[3]),
            "features": clean(r[4]),
            "domains": [d.strip() for d in (r[5], r[7]) if d.strip()],
        })

    class_names = {c["name"] for c in classes}
    subclasses = []
    for r in rows[head:]:
        cname, sname = r[9].strip(), r[10].strip()
        if not cname or cname == "職業":
            continue
        if cname not in class_names:
            sys.exit(f"子職「{sname}」的職業「{cname}」不在職業表裡")
        subclasses.append({
            "class": cname,
            "name": sname,
            "intro": clean(r[12]),
            "spellAttr": r[13].strip(),
            "foundation": clean(r[14]),
            "specialization": clean(r[15]),
            "mastery": clean(r[16]),
        })

    for c in classes:
        if len(c["domains"]) != 2:
            print(f"警告：{c['name']} 的領域不是 2 個：{c['domains']}", file=sys.stderr)
        if not any(s["class"] == c["name"] for s in subclasses):
            print(f"警告：{c['name']} 沒有任何子職", file=sys.stderr)

    def dump(const, items):
        body = ",\n".join("  " + json.dumps(it, ensure_ascii=False) for it in items)
        return f"const {const} = [\n{body},\n];\n"

    OUT.write_text(
        "/* 自動產生，請勿手動編輯。來源：data/classes.csv\n"
        "   更新方式：python3 tools/build_classes.py */\n"
        + dump("CLASSES", classes)
        + dump("SUBCLASSES", subclasses),
        encoding="utf-8",
    )
    print(f"已輸出 {len(classes)} 個職業、{len(subclasses)} 個子職 -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
