#!/usr/bin/env python3
"""把種族、背景、轉變 CSV 轉成網頁使用的 js/origins.js。

用法（在專案根目錄）：
    python3 tools/build_origins.py [種族CSV] [背景CSV] [轉變CSV]

預設讀取 data/ancestries.csv、data/backgrounds.csv、data/transformations.csv。
種族與背景的欄位以標題名稱對應：
  種族：種族、能力1、效果1、能力2、效果2
  背景：背景、能力、效果1
種族表裡的「混合血統」不是一般種族，它的兩組欄位是創角步驟說明，會單獨存成 rules。
轉變表沒有標題列，每一列是：轉變、能力名稱、效果；同一個轉變的列會合併成一筆。
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANCESTRY_SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "ancestries.csv"
BACKGROUND_SRC = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "backgrounds.csv"
TRANSFORMATION_SRC = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "data" / "transformations.csv"
OUT = ROOT / "js" / "origins.js"

MIXED_KEY = "混合血統"


def norm(h):
    return re.sub(r"[\s\u3000]+", "", h)


def clean(text):
    """去掉每行頭尾空白（含全形空白）與空行，保留換行。"""
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def one_line(text):
    return re.sub(r"\s+", "", text)


def read_table(path, required):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    header = [norm(h) for h in rows[0]]
    missing = [h for h in required if h not in header]
    if missing:
        sys.exit(f"{path.name} 缺少欄位：{', '.join(missing)}")
    out = []
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        out.append({h: (r[i] if i < len(r) else "") for i, h in enumerate(header)})
    return out


def build_ancestries():
    recs = read_table(ANCESTRY_SRC, ["種族", "能力1", "效果1", "能力2", "效果2"])
    items, seen = [], set()
    for r in recs:
        name = r["種族"].strip()
        if not name:
            continue
        if name in seen:
            print(f"警告：種族重複：{name}", file=sys.stderr)
        seen.add(name)
        pairs = [(r["能力1"], r["效果1"]), (r["能力2"], r["效果2"])]
        if name.startswith(MIXED_KEY):
            items.append({
                "name": name,
                "mixed": True,
                "rules": [{"name": one_line(n), "desc": clean(d)} for n, d in pairs],
            })
        else:
            items.append({
                "name": name,
                "mixed": False,
                "abilities": [{"name": n.strip(), "desc": clean(d)} for n, d in pairs],
            })
    if not any(i["mixed"] for i in items):
        print("警告：種族表裡沒有「混合血統」", file=sys.stderr)
    return items


def build_backgrounds():
    recs = read_table(BACKGROUND_SRC, ["背景", "能力", "效果1"])
    items, seen = [], set()
    for r in recs:
        name = r["背景"].strip()
        if not name:
            continue
        if name in seen:
            print(f"警告：背景重複：{name}", file=sys.stderr)
        seen.add(name)
        items.append({"name": name, "ability": r["能力"].strip(), "desc": clean(r["效果1"])})
    return items


def build_transformations():
    with open(TRANSFORMATION_SRC, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.reader(f) if any(c.strip() for c in r)]
    items = {}
    for n, r in enumerate(rows, start=1):
        if len(r) < 3:
            sys.exit(f"{TRANSFORMATION_SRC.name} 第 {n} 列欄位不足（需要：轉變、能力名稱、效果）")
        name, ability, desc = r[0].strip(), r[1].strip(), clean(r[2])
        items.setdefault(name, {"name": name, "abilities": []})["abilities"].append({"name": ability, "desc": desc})
    for t in items.values():
        if len(t["abilities"]) != 2:
            print(f"警告：轉變「{t['name']}」的能力不是 2 個：{len(t['abilities'])}", file=sys.stderr)
    return list(items.values())


def dump(const, items):
    body = ",\n".join("  " + json.dumps(it, ensure_ascii=False) for it in items)
    return f"const {const} = [\n{body},\n];\n"


def main():
    ancestries, backgrounds, transformations = build_ancestries(), build_backgrounds(), build_transformations()
    OUT.write_text(
        "/* 自動產生，請勿手動編輯。來源：data/ancestries.csv、data/backgrounds.csv、data/transformations.csv\n"
        "   更新方式：python3 tools/build_origins.py */\n"
        + dump("ANCESTRIES", ancestries)
        + dump("BACKGROUNDS", backgrounds)
        + dump("TRANSFORMATIONS", transformations),
        encoding="utf-8",
    )
    print(f"已輸出 {len(ancestries)} 個種族、{len(backgrounds)} 個背景、{len(transformations)} 個轉變 -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
