# /// script
# requires-python = ">=3.12"
# ///
"""Check written card content (data/llm) against the dictionary: every word and reading must exist in JMdict.

It only reports; anything it prints goes back to the writers. Run: uv run scripts/check_written.py
"""

import gzip
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


def main() -> None:
    pairs = jmdict_pairs()
    files = [LLM / "gold.json", *sorted((LLM / "out").glob("*.json"))]
    missing = []
    for f in files:
        for x in json.loads(f.read_text()):
            for w in x["words"] + x.get("more", []):
                if w["r"] not in pairs.get(w["w"], ()):
                    missing.append((f.name, x["kanji"], w["w"], w["r"], sorted(pairs.get(w["w"], ()))[:4]))
    for m in missing:
        print(*m)
    print(f"{len(missing)} words whose spelling and reading are not a JMdict entry")


if __name__ == "__main__":
    main()
