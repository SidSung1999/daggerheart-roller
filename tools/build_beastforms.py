#!/usr/bin/env python3
"""把德魯伊野獸型態的海報式 CSV 轉成網頁使用的 js/beastforms.js。

用法（在專案根目錄）：
    python3 tools/build_beastforms.py [野獸型態CSV]

預設讀取 data/beastform.csv。
CSV 是海報版面：第 3 欄（索引 2）是列標題（TIER n、動物範例、加值、攻擊、優勢行動、能力 Ⅰ/Ⅱ/Ⅲ），
每個階級最多 6 個型態，各佔一欄（索引 6、13、20、27、34、41）。
能力含【進化】或【混種特性】的型態另外標記 special（evolve / hybrid），規則和一般型態不同。
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "beastforms.js"
LABEL_COL = 2
FORM_COLS = [6, 13, 20, 27, 34, 41]
ATTR_FIX = {"精巧": "技巧"}  # 原表的錯字（穹頂獵手）
ATTRS = ["敏捷", "力量", "技巧", "直覺", "風采", "知識"]


def find_src():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "beastform.csv"
    if not src.exists():
        sys.exit(f"找不到 {src}")
    return src


def clean(text):
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def cell(row, i):
    return row[i].strip() if i < len(row) else ""


def parse_bonus(text, where):
    # 「敏捷 +1 / 閃避值 +2」
    m = re.match(r"(\S+)\s*\+\s*(\d+)\s*/\s*閃避值\s*\+\s*(\d+)", text)
    if not m:
        sys.exit(f"{where}：看不懂加值「{text}」")
    attr = ATTR_FIX.get(m.group(1), m.group(1))
    if attr not in ATTRS:
        sys.exit(f"{where}：未知的屬性「{attr}」")
    return {"attr": attr, "attrBonus": int(m.group(2)), "evasion": int(m.group(3))}


def parse_attack(text, where):
    # 「近戰 力量 d8+2 物理」
    parts = text.split()
    if len(parts) != 4:
        sys.exit(f"{where}：看不懂攻擊「{text}」")
    rng, attr, dmg, typ = parts
    attr = ATTR_FIX.get(attr, attr)
    if attr not in ATTRS:
        sys.exit(f"{where}：未知的攻擊屬性「{attr}」")
    if not re.fullmatch(r"d\d+(\+\d+)?", dmg):
        sys.exit(f"{where}：看不懂傷害「{dmg}」")
    return {"range": rng, "attr": attr, "damage": dmg, "type": typ}


def parse_ability(text):
    m = re.match(r"【([^】]+)】\s*(.*)", text, re.S)
    return {"name": m.group(1).strip(), "desc": clean(m.group(2))} if m else {"name": "", "desc": clean(text)}


def main():
    src = find_src()
    with open(src, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    forms, tier = [], 0
    current = {}  # 欄位索引 -> 型態
    for n, row in enumerate(rows, start=1):
        label = re.sub(r"\s+", "", cell(row, LABEL_COL))
        m = re.match(r"TIER(\d)", label)
        if m:
            tier = int(m.group(1))
            current = {}
            for col in FORM_COLS:
                name = cell(row, col)
                if not name:
                    continue
                zh, _, en = name.partition("\n")
                f = {"tier": tier, "name": zh.strip(), "en": en.strip(), "examples": "", "special": "",
                     "attr": "", "attrBonus": 0, "evasion": 0, "attack": None, "advantages": [], "abilities": []}
                current[col] = f
                forms.append(f)
            continue
        if not current or not label:
            continue
        for col, f in current.items():
            v = cell(row, col)
            if not v:
                continue
            where = f"第 {n} 列「{f['name']}」"
            if label == "動物範例":
                f["examples"] = re.sub(r"\s*\n\s*", "", v)
            elif label == "加值":
                f.update(parse_bonus(v, where))
            elif label == "攻擊":
                f["attack"] = parse_attack(v, where)
            elif label == "優勢行動":
                f["advantages"] = [a.strip() for a in re.split(r"[、,，]", v) if a.strip()]
            elif label.startswith("能力"):
                f["abilities"].append(parse_ability(v))

    for f in forms:
        names = [a["name"] for a in f["abilities"]]
        if "進化" in names:
            f["special"] = "evolve"
        elif "混種特性" in names:
            f["special"] = "hybrid"
        elif not f["attack"] or not f["attr"]:
            print(f"警告：「{f['name']}」缺少加值或攻擊", file=sys.stderr)

    body = ",\n".join("  " + json.dumps(f, ensure_ascii=False) for f in forms)
    OUT.write_text(
        f"/* 自動產生，請勿手動編輯。來源：data/{src.name}\n"
        "   更新方式：python3 tools/build_beastforms.py\n"
        "   special：'' 一般型態；'evolve' 進化（傳說 / 神話巨獸）；'hybrid' 混種。 */\n"
        f"const BEASTFORMS = [\n{body},\n];\n",
        encoding="utf-8",
    )
    normal = sum(1 for f in forms if not f["special"])
    print(f"已輸出 {len(forms)} 個野獸型態（一般 {normal}、特殊 {len(forms) - normal}）-> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
