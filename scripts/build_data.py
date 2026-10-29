# /// script
# requires-python = ">=3.12"
# ///
"""Build data/kanji.json and data/report.md from KANJIDIC2, KanjiVG and kanji frequency counts.

Run: uv run scripts/build_data.py
"""

import csv
import gzip
import unicodedata
import json
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

SOURCES = {
    "kanjidic2.xml.gz": "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    "kanjivg-20260714.xml.gz": "https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714.xml.gz",
    "wikipedia_characters.csv": "https://raw.githubusercontent.com/scriptin/kanji-frequency/master/data/wikipedia_characters.csv",
    "JMdict_e.gz": "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
}

KVG = "{http://kanjivg.tagaini.net}"
JOYO_GRADES = {1, 2, 3, 4, 5, 6, 8}


def fetch() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        if not (RAW / name).exists():
            print("downloading", url)
            urllib.request.urlretrieve(url, RAW / name)


def load_kanjidic() -> dict[str, dict]:
    out = {}
    for ch in ET.parse(gzip.open(RAW / "kanjidic2.xml.gz")).getroot().iter("character"):
        misc = ch.find("misc")
        rm = ch.find("reading_meaning")
        groups = rm.findall("rmgroup") if rm is not None else []
        rd = lambda t: [r.text for g in groups for r in g.findall("reading") if r.get("r_type") == t]
        grade = misc.findtext("grade")
        out[ch.findtext("literal")] = {
            "grade": int(grade) if grade else None,
            "strokes": int(misc.findtext("stroke_count")),
            "on": rd("ja_on"),
            "kun": rd("ja_kun"),
            "meanings": [m.text for g in groups for m in g.findall("meaning") if m.get("m_lang") is None],
        }
    return out


def load_frequency() -> tuple[dict[str, float], int]:
    rows = list(csv.DictReader(open(RAW / "wikipedia_characters.csv", encoding="utf-8")))
    total = int(rows[0]["char_count"])  # rank 0 is the "all" row
    return {r["char"]: int(r["char_count"]) / total for r in rows[1:]}, total


def load_components() -> dict[str, dict]:
    """Hand-written names for radical forms and other non-kanji components."""
    out = {}
    for line in open(ROOT / "data" / "components.tsv", encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            el, meaning, *note = line.rstrip("\n").split("\t")
            out[el] = {"meaning": meaning, **({"note": note[0]} if note and note[0] else {})}
    return out


def parse_group(g: ET.Element) -> list[dict]:
    """A KanjiVG <g> as a list of nodes; groups without an element are flattened into their parent."""
    kids = []
    for c in g:
        if c.tag == "g":
            kids += parse_group(c)
    el = g.get(KVG + "element")
    if not el:
        return kids
    node = {"el": el}
    for attr in ("original", "phon", "radical", "part"):
        if g.get(KVG + attr):
            node[attr] = g.get(KVG + attr)
    node["strokes"] = sum(1 for _ in g.iter("path"))
    node["kids"] = [k for k in merge_parts(kids) if k["el"] != el]  # 王 is listed inside 王
    return [node]


def merge_parts(kids: list[dict]) -> list[dict]:
    """KanjiVG splits a component written in pieces (衣 around 口 in 哀) into part=1, part=2...; join them."""
    out, seen = [], {}
    for k in kids:
        if "part" in k and k["el"] in seen:
            m = seen[k["el"]]
            m["strokes"] += k["strokes"]
            m["kids"] = merge_parts(m["kids"] + k["kids"])
            continue
        if k.get("part", "1") != "1":  # the tail of a component counted elsewhere (千 inside 里 in 重)
            out += merge_parts(k["kids"])
            continue
        if "part" in k:
            seen[k["el"]] = k
        out.append(k)
    for k in out:
        k.pop("part", None)
    return out


def load_trees(wanted: set[str]) -> dict[str, dict]:
    trees = {}
    for k in ET.parse(gzip.open(RAW / "kanjivg-20260714.xml.gz")).getroot().iter("kanji"):
        kid = k.get("id")
        if "-" in kid:  # variant glyphs such as kvg:kanji_05b57-Kaisho
            continue
        ch = chr(int(kid.split("_")[1], 16))
        if ch in wanted:
            [node] = parse_group(k.find("g"))
            node["el"] = ch
            trees[ch] = node
    return trees


STROKES = {"丿", "丨", "丶", "亅", "乙"}  # single strokes: parts of the tree, but nothing to learn


def nodes(t: dict, root: bool = True) -> list[str]:
    """Every component in a tree worth learning, children before parents; 乙 is a stroke and a kanji."""
    return [n for k in t["kids"] for n in nodes(k, False)] + ([] if t["el"] in STROKES and not root else [t["el"]])


def subtrees(t: dict):
    yield t
    for k in t["kids"]:
        yield from subtrees(k)


def prerequisites(ch: str, trees: dict) -> list[str]:
    """What learning ch takes, parts first. A kanji among the parts brings its own full tree:
    inside 預 KanjiVG leaves 予 whole, but 予 on its own is マ + more."""
    out = []
    for n in nodes(trees[ch]):
        if n != ch and n in trees:
            out += [m for m in prerequisites(n, trees) if m not in out]
        if n not in out:
            out.append(n)
    return out


def plan(order_kanji: list[str], trees: dict, freq: dict) -> list[str]:
    """Learn kanji in the given order, each one after the components it needs."""
    known, items = set(), []
    for ch in order_kanji:
        for n in prerequisites(ch, trees):
            if n not in known:
                known.add(n)
                items.append(n)
    return items


def greedy(joyo: list[str], trees: dict, freq: dict) -> list[str]:
    """Next kanji = most text coverage gained per new item learned (the kanji plus its unknown components)."""
    pre = {ch: prerequisites(ch, trees) for ch in joyo}
    need = {ch: set(p) for ch, p in pre.items()}
    value = lambda s: sum(freq.get(n, 0) for n in s if n in need)
    known, items, left = set(), [], set(joyo)
    while left:
        best = max(left, key=lambda ch: (value(need[ch] - known) / len(need[ch] - known), -len(need[ch] - known)))
        for n in pre[best]:
            if n not in known:
                known.add(n)
                items.append(n)
        left -= {ch for ch in left if need[ch] <= known}
    return items


def coverage(items: list[str], joyo: set[str], freq: dict) -> list[float]:
    acc, out = 0.0, []
    for n in items:
        acc += freq.get(n, 0) if n in joyo else 0
        out.append(acc)
    return out


def items_to_reach(cov: list[float], target: float) -> int | None:
    return next((i + 1 for i, c in enumerate(cov) if c >= target), None)


def unvoice(r: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", r) if c not in "゙゚")


def families(joyo: list[str], trees: dict, kd: dict) -> list[dict]:
    """Sound families: kanji sharing a component that KanjiVG marks as phonetic (kvg:phon)."""
    members = defaultdict(set)
    for ch in joyo:
        for s in subtrees(trees[ch]):
            if "phon" in s and s is not trees[ch]:
                members[s["el"]].add(ch)
    out = []
    for ph, chs in members.items():
        chs = sorted(chs | ({ph} if ph in joyo else set()))
        if len(chs) < 3:
            continue
        counts = Counter(unvoice(r) for c in chs for r in set(map(unvoice, kd[c]["on"])))
        if not counts:
            continue
        reading, hits = counts.most_common(1)[0]
        out.append({
            "phonetic": ph,
            "reading": reading,
            "hits": [c for c in chs if reading in map(unvoice, kd[c]["on"])],
            "misses": [c for c in chs if reading not in map(unvoice, kd[c]["on"])],
        })
    return sorted(out, key=lambda f: (-len(f["hits"]), len(f["misses"])))


def hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def is_kanji(c: str) -> bool:
    return "\u4e00" <= c <= "\u9fff" or c == "々"


def load_words() -> list[dict]:
    """Common JMdict words (news1, ichi1, spec1/2, gai1) written with kanji."""
    common = {"news1", "ichi1", "spec1", "spec2", "gai1"}
    out = []
    for _, e in ET.iterparse(gzip.open(RAW / "JMdict_e.gz"), events=("end",)):
        if e.tag != "entry":
            continue
        kebs = [k for k in e.findall("k_ele") if common & {p.text for p in k.findall("ke_pri")}]
        rebs = [r for r in e.findall("r_ele") if r.find("re_nokanji") is None]
        if kebs and rebs and not any(c.isdigit() for c in kebs[0].findtext("keb")):
            k = kebs[0]
            pri = [p.text for p in k.findall("ke_pri")]
            # nfXX ranks news words in bands of 500; ichi1/spec words without it are taken as nf12
            nf = min((int(p[2:]) for p in pri if p.startswith("nf")), default=12 if {"ichi1", "spec1"} & set(pri) else 40)
            if not {"ichi1", "spec1", "spec2"} & set(pri):  # news-only words are often names (上田 as Ueda)
                nf += 12
            r = next((r for r in rebs if common & {p.text for p in r.findall("re_pri")}), rebs[0])
            glosses = [g.text for g in e.find("sense").findall("gloss")]
            out.append({
                "w": k.findtext("keb"),
                "r": r.findtext("reb"),
                "g": "; ".join(glosses[:2]),
                "nf": nf,
                **({"irregular": True} if r.find("re_inf") is not None and "gikun" in ET.tostring(r, encoding="unicode") else {}),
            })
        e.clear()
    return out


def variants(r: str) -> set[str]:
    """A reading as it can appear inside a word: rendaku on the first kana, っ for a final つくちき."""
    out = {r}
    first = r[0]
    for mark in ("\u3099", "\u309a"):
        v = unicodedata.normalize("NFC", first + mark)
        if len(v) == 1:
            out.add({"ぢ": "じ", "づ": "ず"}.get(v, v) + r[1:])
    if len(r) > 1 and r[-1] in "つくちき":
        out |= {x[:-1] + "っ" for x in list(out)}
    return out


def readings(kd_entry: dict) -> dict[str, str]:
    """Surface form in a word -> the dictionary reading it comes from."""
    out = {}
    for r in kd_entry["on"]:
        for v in variants(hira(r)):
            out.setdefault(v, hira(r))
    for r in kd_entry["kun"]:
        base = r.split(".")[0].strip("-")
        if base:
            for v in variants(base):
                out.setdefault(v, r.strip("-"))
    return out


def align(word: str, reading: str, kd: dict) -> list[tuple[str, str, str]] | None:
    """Split a word's reading over its characters: [(char, surface, dictionary reading)], or None."""
    def go(i: int, j: int, prev: str | None):
        if i == len(word):
            return [] if j == len(reading) else None
        c = word[i]
        if not is_kanji(c):
            if reading[j:j + 1] == hira(c):
                rest = go(i + 1, j + 1, None)
                return None if rest is None else [(c, hira(c), "")] + rest
            return None
        src = prev if c == "々" else c
        if src not in kd:
            return None
        for surf, dic in sorted(readings(kd[src]).items(), key=lambda kv: -len(kv[0])):
            if reading.startswith(surf, j):
                rest = go(i + 1, j + len(surf), src)
                if rest is not None:
                    return [(c, surf, dic)] + rest
        return None
    return go(0, 0, None)


def attach_words(joyo: list[str], kd: dict, order_pos: dict[str, int]) -> tuple[dict, dict]:
    """Per kanji: a few example words (common, short, with kanji learned early) and how often each reading is used."""
    by_kanji = defaultdict(list)
    usage = defaultdict(Counter)
    for w in load_words():
        if len(w["w"]) > 5:
            continue
        chars = [c for c in w["w"] if is_kanji(c) and c != "々"]
        if not chars or any(c not in order_pos for c in chars):
            continue
        parts = None if w.get("irregular") else align(w["w"], w["r"], kd)
        one_kana_kun = [c for c, r, dic in parts or [] if is_kanji(c) and c in kd and len(r) == 1 and dic not in map(hira, kd[c]["on"])]
        if len(one_kana_kun) >= 2 and len(one_kana_kun) == len(w["w"]):
            parts = None  # 三十日 みそか fits み + そ + か only by accident
        if parts:
            w["parts"] = [[c, s] for c, s, _ in parts]
            w["dic"] = {c: dic for c, _, dic in parts}
        for c in set(chars):
            by_kanji[c].append(w)
            if parts:
                for pc, _, dic in parts:
                    if pc == c:
                        usage[c][dic] += 1
            else:
                usage[c]["(irregular)"] += 1
    examples = {}
    for c, ws in by_kanji.items():
        # common first; each kanji not yet learned costs 5 frequency bands, each kana 3 (上がったり is no example of 上)
        later = lambda w: sum(order_pos[x] > order_pos[c] for x in set(w["w"]) if is_kanji(x) and x != "々")
        cost = lambda w: w["nf"] + 5 * later(w) + 3 * sum(not is_kanji(x) for x in w["w"]) + len(w["w"])
        ranked = sorted({w["w"]: w for w in sorted(ws, key=cost, reverse=True)}.values(), key=cost)
        reading_of = lambda w: w.get("dic", {}).get(c, "(irregular)")
        picked = []
        for r in usage[c]:  # one word per reading, most used readings first
            w = next((w for w in ranked if reading_of(w) == r and w not in picked), None)
            if w and len(picked) < 4:
                picked.append(w)
        picked += [w for w in ranked if w not in picked][:max(0, 4 - len(picked))]
        examples[c] = [{**{k: w[k] for k in ("w", "r", "g", "parts") if k in w}, "rd": reading_of(w)} for w in sorted(picked, key=cost)]
    return examples, {c: dict(u.most_common()) for c, u in usage.items()}


def load_stories() -> dict[str, dict]:
    """Hand-written: keyword, kind (origin or memory) and a one-sentence story per kanji or component."""
    out = {}
    for l in open(ROOT / "data" / "stories.tsv", encoding="utf-8"):
        if l.strip() and not l.startswith("#"):
            el, keyword, kind, story = l.rstrip("\n").split("\t")
            out[el] = {k: v for k, v in (("keyword", keyword), ("kind", kind), ("story", story)) if v}
    return out


def main() -> None:
    fetch()
    kd = load_kanjidic()
    freq, total = load_frequency()
    comp_names = load_components()
    stories = load_stories()
    for l in open(ROOT / "data" / "keywords.tsv", encoding="utf-8"):
        if l.strip() and not l.startswith("#"):
            el, keyword = l.rstrip("\n").split("\t")
            stories.setdefault(el, {}).setdefault("keyword", keyword)
    joyo = sorted((c for c, v in kd.items() if v["grade"] in JOYO_GRADES), key=lambda c: -freq.get(c, 0))
    trees = load_trees(set(joyo))
    missing = [c for c in joyo if c not in trees]
    joyo = [c for c in joyo if c in trees]
    joyo_set = set(joyo)

    # every component, with a meaning: KANJIDIC for real kanji, else the original form, else components.tsv
    used_in = defaultdict(set)
    for ch in joyo:
        for s in subtrees(trees[ch]):
            if s is not trees[ch]:
                used_in[s["el"]].add(ch)

    def meaning(el: str, orig: str | None) -> dict:
        if el in comp_names:
            return comp_names[el]
        if "keyword" in stories.get(el, {}):
            return {"meaning": stories[el]["keyword"]}
        if el in kd and kd[el]["meanings"]:
            return {"meaning": kd[el]["meanings"][0]}
        if orig and orig in kd and kd[orig]["meanings"]:
            return {"meaning": kd[orig]["meanings"][0], "note": f"form of {orig}"}
        return {}

    origs = {s["el"]: s.get("original") for ch in joyo for s in subtrees(trees[ch])}
    components = {}
    for el, orig in origs.items():
        components[el] = {
            **meaning(el, orig),
            **({"original": orig} if orig else {}),
            **({"on": kd[el]["on"], "kun": kd[el]["kun"]} if el in kd else {}),
            "joyo": el in joyo_set,
            "usedIn": sorted(used_in[el], key=lambda c: -freq.get(c, 0)),
        }
    unnamed = sorted((el for el, c in components.items() if "meaning" not in c), key=lambda e: -len(used_in[e]))

    def strip(t: dict) -> dict:
        return {"el": t["el"], "strokes": t["strokes"], **{k: t[k] for k in ("phon", "radical") if k in t}, "kids": [strip(k) for k in t["kids"]]}

    kanji = {
        ch: {
            **kd[ch],
            "freq": freq.get(ch, 0),
            "sum": [k["el"] for k in trees[ch]["kids"]],
            "tree": strip(trees[ch]),
        }
        for ch in joyo
    }

    by_grade = sorted(joyo, key=lambda c: (kd[c]["grade"], -freq.get(c, 0)))
    orders = {
        "school grade": plan(by_grade, trees, freq),
        "frequency": plan(joyo, trees, freq),
        "greedy coverage": greedy(joyo, trees, freq),
    }
    fams = families(joyo, trees, kd)
    order = orders["greedy coverage"]
    order_pos = {n: i for i, n in enumerate(order)}
    examples, usage = attach_words(joyo, kd, order_pos)
    for ch in joyo:
        kanji[ch]["words"] = examples.get(ch, [])
        kanji[ch]["usage"] = usage.get(ch, {})
        kanji[ch]["keyword"] = components[ch]["meaning"] if "meaning" in components.get(ch, {}) else kd[ch]["meanings"][0] if kd[ch]["meanings"] else "?"
        kanji[ch] |= stories.get(ch, {})
    for el, c in components.items():
        if el in stories:
            c |= {k: v for k, v in stories[el].items() if k != "keyword"}

    OUT.joinpath("kanji.json").write_text(json.dumps({
        "kanji": kanji,
        "components": components,
        "order": orders["greedy coverage"],
        "families": fams,
    }, ensure_ascii=False, indent=1))

    # the app's copy: compact, with coverage curves for the analysis page
    curves = {name: [round(c, 4) for c in coverage(items, joyo_set, freq)] for name, items in orders.items()}
    app = ROOT / "src" / "data"
    app.mkdir(parents=True, exist_ok=True)
    app.joinpath("kanji.json").write_text(json.dumps({
        "kanji": kanji,
        "components": components,
        "order": order,
        "families": fams,
        "curves": curves,
        "total": total,
    }, ensure_ascii=False, separators=(",", ":")))

    # every common word written with jōyō kanji, for looking words up in the reader: [word, reading, gloss]
    lexicon = sorted({w["w"]: [w["w"], w["r"], w["g"]] for w in load_words()
                      if all(c in joyo_set or not is_kanji(c) or c == "々" for c in w["w"])}.values())
    app.joinpath("words.json").write_text(json.dumps(lexicon, ensure_ascii=False, separators=(",", ":")))

    report(kd, freq, total, joyo, joyo_set, trees, components, orders, fams, unnamed, missing)


def tree_lines(t: dict, components: dict, kd: dict, prefix: str = "", last: bool = True, top: bool = True) -> list[str]:
    gloss = kd[t["el"]]["meanings"][0] if top else components.get(t["el"], {}).get("meaning", "?")
    tags = " · sound" if "phon" in t else ""
    line = f"{t['el']} {gloss}{tags}" if top else f"{prefix}{'└ ' if last else '├ '}{t['el']} {gloss}{tags}"
    sub = prefix if top else prefix + ("  " if last else "│ ")
    return [line] + [l for i, k in enumerate(t["kids"]) for l in tree_lines(k, components, kd, sub, i == len(t["kids"]) - 1, False)]


def report(kd, freq, total, joyo, joyo_set, trees, components, orders, fams, unnamed, missing) -> None:
    gloss = lambda el: components.get(el, {}).get("meaning", "?")
    L = []
    p = L.append
    all_cov = sum(freq.get(c, 0) for c in joyo)
    p("# Kanji data report\n")
    p("Generated by `scripts/build_data.py`; do not edit.\n")
    p(f"- {len(joyo)} jōyō kanji with KanjiVG trees" + (f" ({len(missing)} without: {''.join(missing)})" if missing else ""))
    p(f"- {len(components)} distinct components in those trees, {sum(1 for c in components.values() if not c['joyo'])} of them not jōyō kanji themselves")
    p(f"- Text: {total:,} kanji from Japanese Wikipedia; jōyō covers {all_cov:.1%} of them\n")

    p("## Sums and trees\n")
    p("A kanji is a sum of its direct parts; each part may be a sum again.\n")
    for ch in ["明", "休", "看", "照", "晴", "語", "働", "曜"]:
        if ch in trees:
            p(f"**{ch} = {' + '.join(trees[ch]['kids'] and [k['el'] for k in trees[ch]['kids']])}**\n")
            p("```\n" + "\n".join(tree_lines(trees[ch], components, kd)) + "\n```\n")

    p("## Most productive components\n")
    p("Ranked by the share of running text written with kanji containing them.\n")
    p("| component | meaning | jōyō kanji containing it | text share | examples |")
    p("|---|---|--:|--:|---|")
    prod = sorted(components.items(), key=lambda kv: -sum(freq.get(c, 0) for c in kv[1]["usedIn"]))
    for el, c in prod[:30]:
        share = sum(freq.get(x, 0) for x in c["usedIn"])
        p(f"| {el} | {c.get('meaning', '?')} | {len(c['usedIn'])} | {share:.1%} | {''.join(c['usedIn'][:8])} |")
    p("")

    p("## Learning order: coverage per item learned\n")
    p("An item is a kanji or a component. Each order learns a kanji right after the components it still needs. "
      "Coverage is the share of all kanji in Wikipedia text that you can read.\n")
    marks = [100, 250, 500, 1000, 2000]
    p("| order | " + " | ".join(f"after {m}" for m in marks) + " | items for 50% | 80% | 90% | total items |")
    p("|---|" + "--:|" * (len(marks) + 4))
    for name, items in orders.items():
        cov = coverage(items, joyo_set, freq)
        at = lambda m: f"{cov[min(m, len(cov)) - 1]:.1%}"
        reach = lambda t: str(items_to_reach(cov, t * all_cov) or "—")
        p(f"| {name} | " + " | ".join(at(m) for m in marks) + f" | {reach(.5)} | {reach(.8)} | {reach(.9)} | {len(items)} |")
    p("\n(50/80/90% are of what all jōyō kanji cover.)\n")
    p("First 60 items of the greedy order:\n")
    p(" ".join(orders["greedy coverage"][:60]) + "\n")

    p("## Sound families\n")
    p("Kanji sharing a component that KanjiVG marks as phonetic, with the on-reading most of them share "
      "(voicing ignored, so セイ also counts ゼイ). Hits / all says how far the hint can be trusted.\n")
    p("| sound part | reading | hits / all | hits | misses |")
    p("|---|---|--:|---|---|")
    for f in fams[:40]:
        n = len(f["hits"]) + len(f["misses"])
        p(f"| {f['phonetic']} {gloss(f['phonetic'])} | {f['reading']} | {len(f['hits'])}/{n} | {''.join(f['hits'])} | {''.join(f['misses'])} |")
    hits = sum(len(f["hits"]) for f in fams)
    alln = sum(len(f["hits"]) + len(f["misses"]) for f in fams)
    p(f"\n{len(fams)} families with 3+ jōyō members; the shared reading holds for {hits}/{alln} ({hits / alln:.0%}) of their kanji.\n")

    if unnamed:
        p("## Components still without a name\n")
        p("Add them to `data/components.tsv`:\n")
        p(" ".join(f"{el}({len(components[el]['usedIn'])})" for el in unnamed) + "\n")

    OUT.joinpath("report.md").write_text("\n".join(L))
    print("\n".join(L[:6]))
    print(f"unnamed components: {len(unnamed)}")


if __name__ == "__main__":
    main()
