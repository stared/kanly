# /// script
# requires-python = ">=3.12"
# ///
"""Check written card content (data/llm) against the dictionary: every word and reading must exist in JMdict.

It only reports; anything it prints goes back to the writers. Run: uv run scripts/check_written.py
"""

import gzip
import unicodedata
import json
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LLM = ROOT / "data" / "llm"


def jmdict_pairs() -> dict[str, set[str]]:
    """Every written form in JMdict with the readings it can have."""
    out = defaultdict(set)
    for _, e in ET.iterparse(gzip.open(ROOT / "data" / "raw" / "JMdict_e.gz"), events=("end",)):
        if e.tag != "entry":
            continue
        kebs = [k.findtext("keb") for k in e.findall("k_ele")]
        for r in e.findall("r_ele"):
            restr = [x.text for x in r.findall("re_restr")]
            for k in restr or kebs:
                out[k].add(r.findtext("reb"))
        e.clear()
    return out


# 𠮟 is outside the basic block; ヶ in ヶ月 is read か and carries furigana like a kanji
is_kanji = lambda c: unicodedata.name(c, "").startswith("CJK") or c in "々ヶ"
hira = lambda s: "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def structure(x: dict) -> list[str]:
    """What the card needs to render right: furigana covering the word and matching its reading,
    reading labels from the kanji's own list, kana written as kana."""
    out = []
    for w in x["words"] + x.get("more", []):
        if "".join(p for p, _ in w["furigana"]) != w["w"]:
            out.append(f"furigana does not cover {w['w']}")
        if hira("".join(r or p for p, r in w["furigana"])) != hira(w["r"]):
            out.append(f"furigana of {w['w']} does not spell {w['r']}")
        if any(r and not any(is_kanji(c) for c in p) for p, r in w["furigana"]):
            out.append(f"furigana over kana in {w['w']}")
        if w["reading"] != "special" and w["reading"] not in x["readings"]:
            out.append(f"{w['w']} uses {w['reading']}, not among the readings")
    if x.get("alone") and x["alone"]["reading"] not in x["readings"]:
        out.append("alone uses a reading not among the readings")
    return out


def main() -> None:
    files = [*sorted((LLM / "out").glob("*.json"))]
    cards = {x["kanji"]: x for f in files for x in json.loads(f.read_text())}
    joyo = {x["kanji"] for f in sorted((LLM / "in").glob("*.json")) for x in json.loads(f.read_text())}
    if set(cards) != joyo:
        print("missing:", "".join(sorted(joyo - set(cards))), "extra:", "".join(sorted(set(cards) - joyo)))
    problems = [(k, p) for k, x in cards.items() for p in structure(x)]
    for k, p in problems:
        print(k, p)
    print(f"{len(cards)} cards, {len(problems)} structural problems")

    parts = {x["kanji"]: [p["part"] for p in x["parts"]] for f in sorted((LLM / "in").glob("*.json")) for x in json.loads(f.read_text())}
    skipped = [(k, [p for p in parts[k] if p not in x["story"]]) for k, x in cards.items()
               if x.get("story") and x.get("kind") == "mnemonic" and k in parts]
    for k, ps in skipped:
        if ps:
            print(k, "mnemonic leaves out", " ".join(ps))
    print(f"{sum(1 for _, ps in skipped if ps)} mnemonics that leave out a part")

    pairs = jmdict_pairs()
    missing = [(k, w["w"], w["r"]) for k, x in cards.items() for w in x["words"] + x.get("more", [])
               if w["r"] not in pairs.get(w["w"], ())]
    for m in missing:
        print(*m)
    print(f"{len(missing)} words whose spelling and reading are not a JMdict entry")


if __name__ == "__main__":
    main()
