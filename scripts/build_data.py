# /// script
# requires-python = ">=3.12"
# dependencies = ["wordfreq==3.1.1", "numpy==2.3.4"]
# ///
"""Build data/kanji.json and data/report.md from KANJIDIC2, KanjiVG, JMdict and wordfreq.

Run: uv run scripts/build_data.py
"""

import csv
import gzip
import math
import re
import statistics
import unicodedata
import json
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"
LLM = ROOT / "data" / "llm"

SOURCES = {
    "kanjidic2.xml.gz": "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    "kanjivg-20260714.xml.gz": "https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714.xml.gz",
    "JMdict_e.gz": "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz",
    # levels, used only to calibrate how hard a kanji is (see difficulty)
    "kanji-data.json": "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json",
    "kanken-levels.hs": "https://raw.githubusercontent.com/fosskers/kanji/master/lib/Data/Kanji/Levels.hs",
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


KANKEN = {"tenth": 10, "ninth": 9, "eighth": 8, "seventh": 7, "sixth": 6, "fifth": 5, "fourth": 4, "third": 3, "preSecond": 2.5, "second": 2}
VARIANTS = {"剝": "剥", "頰": "頬", "塡": "填", "𠮟": "叱"}  # jōyō forms that text usually writes the other way


def load_kanken() -> dict[str, float]:
    """Kanji kentei level of each kanji: 10 (first grade) … 2 (the last jōyō ones); 2.5 is 準2級."""
    parts = re.split(r"\n(\w+) :: S.Set Char\n", (RAW / "kanken-levels.hs").read_text())
    out = {c: KANKEN[parts[i]] for i in range(1, len(parts), 2) for c in parts[i + 1] if ord(c) > 0x3000}
    return out | {v: out[c] for v, c in VARIANTS.items() if c in out}


def normal_score(xs: list[float]) -> list[float]:
    """Ranks mapped onto a standard normal; ties share their mean rank."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    rank = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in order[i:j + 1]:
            rank[k] = (i + j) / 2
        i = j + 1
    nd = statistics.NormalDist()
    return [nd.inv_cdf((r + 0.5) / len(xs)) for r in rank]


def log_phi(z):
    """ln Φ(z) for an array, accurate far into the left tail (erfc as in Numerical Recipes)."""
    import numpy as np
    x = -z / math.sqrt(2)
    t = 1 / (1 + 0.5 * np.abs(x))
    ln = np.log(t) - x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (
        0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    return np.where(x >= 0, ln - math.log(2), np.log1p(-np.exp(ln) / 2))


def char_frequency(wf: dict) -> dict[str, float]:
    """How often each kanji is written, as a share of all kanji written: every word wordfreq knows (subtitles,
    web, news, books, Wikipedia), weighted by how often it is used, a character counted wherever it occurs,
    alone or inside a word. Wikipedia alone puts 俺 at 1501st of the jōyō kanji and 私 at 724th; here 103rd and 61st."""
    cf = Counter()
    for w, f in wf.items():
        for c in w:
            if is_kanji(c):
                cf[c] += f
    total = sum(cf.values())
    out = {c: v / total for c, v in cf.items()}
    return out | {v: out.get(c, 0) for v, c in VARIANTS.items()}


def difficulty(joyo: list[str], freq: dict, kd: dict) -> tuple[dict[str, int], dict[str, float], dict]:
    """How likely a learner is to know each kanji already, as a rank: 0 is the one everyone knows first.

    Two orders, both ranks (a flat density of states, so a learner who knows N kanji has a Fermi level near N
    in either; see src/levels.ts):
    - by frequency: how often the kanji is written (char_frequency), what someone learning from reading meets;
    - by curriculum: a linear score of log frequency, strokes and kanji kentei level, fitted to the order
      learners are taught in (JLPT levels and WaniKani levels, as normal scores).
    The 196 kanji added to jōyō in 2010 (俺 誰 頃 …) are absent from the JLPT lists, which predate them, so for
    them JLPT is missing data, not "beyond N1"; kentei puts all of them at its top level only because they are
    new, so they get their own term instead of a kentei level. Courses still teach them late (WaniKani 俺 at 44)."""
    import numpy as np
    kanken = load_kanken()
    ext = json.load(open(RAW / "kanji-data.json"))
    ext |= {v: ext[c] for v, c in VARIANTS.items() if c in ext}
    new = np.array([kanken[c] == 2 for c in joyo])
    names = ["log10 frequency", "strokes", "kentei level", "added in 2010"]
    X = np.array([[-math.log10(max(freq.get(c, 0), 1e-9)), kd[c]["strokes"], 0 if n else 11 - kanken[c], n] for c, n in zip(joyo, new)])
    jlpt = [ext.get(c, {}).get("jlpt_new") for c in joyo]
    has = np.array([bool(j) or not n for j, n in zip(jlpt, new)])
    js = np.full(len(joyo), np.nan)
    js[has] = normal_score([6 - (j or 0) for j, h in zip(jlpt, has) if h])  # missing from a list = beyond its last level
    wk = np.array(normal_score([ext.get(c, {}).get("wk_level") or 61 for c in joyo]))
    A = np.c_[X, np.ones(len(joyo))]
    w, *_ = np.linalg.lstsq(A, np.where(has, (np.nan_to_num(js) + wk) / 2, wk), rcond=None)
    rank = {joyo[i]: r for r, i in enumerate(np.argsort(A @ w, kind="stable"))}
    by_freq = {c: r for r, c in enumerate(sorted(joyo, key=lambda c: -freq.get(c, 0)))}
    weights = {n: float(v / w[0]) for n, v in zip(names, w[:-1])}  # in decades of frequency

    # each official list as a sea of known kanji in the curriculum ranks: where its edge is (μ) and how blurred (T),
    # p = Φ((μ − rank) / T), by maximum likelihood on a grid refined around the best point
    E = np.array([rank[c] for c in joyo], float)
    lists = [(f"JLPT N{n}", [c for c in joyo if (ext.get(c, {}).get("jlpt_new") or 0) >= n]) for n in (5, 4, 3, 2, 1)]
    names = {10: "10級", 8: "8級", 5: "5級", 4: "4級", 3: "3級", 2.5: "準2級"}
    lists += [(f"kentei {names[l]}", [c for c in joyo if kanken[c] >= l]) for l in names]
    official = []
    for name, inside in lists:
        y = np.isin(joyo, inside)
        ll = lambda mu, T: log_phi(np.where(y, 1, -1) * (mu - E) / T).sum()
        mu, T, dm, dt = float(len(inside)), 200.0, 200.0, 0.5
        for _ in range(12):
            mu, T = max(((m, t) for m in np.linspace(mu - dm, mu + dm, 9) for t in T * np.exp(np.linspace(-dt, dt, 9))), key=lambda p: ll(*p))
            dm, dt = dm / 2, dt / 2
        official.append({"name": name, "n": len(inside), "mu": round(mu), "T": round(T)})
    official.sort(key=lambda o: o["n"])
    return rank, by_freq, {c: kanken[c] for c in joyo}, {"weights": weights, "official": official}


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


def load_trees(wanted: set[str], kd: dict) -> dict[str, dict]:
    """KanjiVG's tree of each wanted kanji, with the decompositions rewritten in data/llm/trees.json applied."""
    kvg = {}
    for k in ET.parse(gzip.open(RAW / "kanjivg-20260714.xml.gz")).getroot().iter("kanji"):
        kid = k.get("id")
        if "-" in kid:  # variant glyphs such as kvg:kanji_05b57-Kaisho
            continue
        ch = chr(int(kid.split("_")[1], 16))
        [node] = parse_group(k.find("g"))
        node["el"] = ch
        kvg[ch] = node
    return fix_trees({ch: kvg[ch] for ch in wanted if ch in kvg}, kvg, kd)


def fix_trees(trees: dict, kvg: dict, kd: dict) -> dict:
    """KanjiVG groups strokes as they are drawn, so it often splits a shape into pieces learners do not see, or
    names a stroke group after a kanji it only resembles: 止 as 卜 "divining crack" + 2 strokes, 重 as a 2-stroke
    千 + 里, 彳 as 亻. data/llm/trees.json (written and reviewed like the cards) gives the parts of such an
    element; wherever the element appears, in any tree, it takes those parts, each with its own (fixed) tree."""
    fixes = json.loads((LLM / "trees.json").read_text()) if (LLM / "trees.json").exists() else {}
    memo: dict[str, dict] = {}
    seen = defaultdict(Counter)  # strokes of parts with no entry of their own (𠂇 in 有), as drawn inside others
    for t in kvg.values():
        for n in subtrees(t):
            seen[n["el"]][n["strokes"]] += 1

    def own(el: str) -> dict:
        """An element's own tree, fixed."""
        if el not in memo:
            base = trees.get(el) or kvg.get(el)
            # a kanji's own count; a part's as written in trees.json, as KanjiVG draws it alone, else as KANJIDIC counts it, else as drawn inside others
            strokes = fixes.get(el, {}).get("strokes") or (kd[el]["strokes"] if el in trees else base["strokes"] if base else kd[el]["strokes"] if el in kd
                       else max(seen[el], key=lambda n: (seen[el][n], n)) if seen[el] else 1)
            memo[el] = {"el": el, "strokes": strokes, "kids": []}  # a cycle ends here
            if el in fixes:
                was = {k["el"]: k for k in (base or {"kids": []})["kids"]}
                kids = []
                for p in fixes[el]["parts"]:
                    # as drawn here when KanjiVG has it: 艹 is 3 strokes in 花, 4 on its own
                    k = {**own(p), **({a: was[p][a] for a in ("radical", "strokes") if a in was.get(p, {})})}
                    kids.append(k | ({"phon": p} if fixes[el].get("phon") == p else {}))
                memo[el] = {**{a: base[a] for a in ("radical",) if base and a in base}, "el": el, "strokes": strokes, "kids": kids}
            elif base:
                memo[el] = {**base, "strokes": strokes, "kids": [inside(k) for k in base["kids"]]}
        return memo[el]

    def inside(t: dict) -> dict:
        """A node inside a tree: a fixed element brings its fixed parts, keeping its strokes and role here."""
        if t["el"] in fixes:
            return {**t, "kids": own(t["el"])["kids"]}
        return {**t, "kids": [inside(k) for k in t["kids"]]}

    return {ch: own(ch) for ch in trees}


def path_box(ds: list[str]) -> tuple[float, float, float, float]:
    """Bounding box of the points and control points of SVG paths (KanjiVG uses M, C, c, S, s)."""
    xs, ys = [], []
    for d in ds:
        x = y = 0.0
        for cmd, args in re.findall(r"([MmCcSsLl])([^MmCcSsLl]*)", d):
            nums = [float(n) for n in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", args)]
            step = {"m": 2, "l": 2, "c": 6, "s": 4}[cmd.lower()]
            for i in range(0, len(nums) - step + 1, step):
                pts = list(zip(nums[i:i + step:2], nums[i + 1:i + step:2]))
                if cmd.islower():
                    pts = [(x + px, y + py) for px, py in pts]
                xs += [p[0] for p in pts]
                ys += [p[1] for p in pts]
                x, y = pts[-1]
    return min(xs), min(ys), max(xs), max(ys)


def load_strokes(wanted: set[str]) -> dict[str, dict]:
    """How each wanted element is drawn: its strokes as SVG paths in drawing order (KanjiVG's -s1, -s2, …), in a
    109 × 109 box. A part with no entry of its own (𠂇, 䒑) is taken from the first kanji drawing it whole, with
    the box around it."""
    order = lambda ps: [p.get("d") for p in sorted(ps, key=lambda p: int(p.get("id").rsplit("-s", 1)[1]))]
    out, inside = {}, {}
    for k in ET.parse(gzip.open(RAW / "kanjivg-20260714.xml.gz")).getroot().iter("kanji"):
        kid = k.get("id")
        if "-" in kid:
            continue
        ch = chr(int(kid.split("_")[1], 16))
        if ch in wanted:
            out[ch] = {"d": order(k.iter("path"))}
        for g in k.iter("g"):
            el = g.get(KVG + "element")
            if el in wanted and el not in inside and not g.get(KVG + "part") and el != ch:
                inside[el] = order(g.iter("path"))
    for el, ds in inside.items():
        if el not in out and ds:
            x0, y0, x1, y1 = path_box(ds)
            side = max(x1 - x0, y1 - y0) + 12
            out[el] = {"d": ds, "box": [round((x0 + x1 - side) / 2, 1), round((y0 + y1 - side) / 2, 1), round(side, 1)]}
    return out


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


def greedy(joyo: list[str], trees: dict, freq: dict, strokes: dict[str, int] | None = None, power: float = 1.0) -> list[str]:
    """Next kanji = most text coverage gained per new thing learned (the kanji plus its unknown components).
    By default a thing is an item; with strokes, its stroke count, raised to power to favour simple shapes even more."""
    pre = {ch: prerequisites(ch, trees) for ch in joyo}
    need = {ch: set(p) for ch, p in pre.items()}
    value = lambda s: sum(freq.get(n, 0) for n in s if n in need)
    cost = (lambda s: len(s)) if strokes is None else (lambda s: sum(strokes.get(n, 1) for n in s) ** power)
    known, items, left = set(), [], set(joyo)
    while left:
        # sorted: ties go to the same kanji every run (a set's order changes with Python's string hashing)
        best = max(sorted(left), key=lambda ch: (value(need[ch] - known) / cost(need[ch] - known), -len(need[ch] - known)))
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
                "pos": "; ".join(p.text or "" for p in e.find("sense").findall("pos")),
                "nf": nf,
                **({"irregular": True} if r.find("re_inf") is not None and "gikun" in ET.tostring(r, encoding="unicode") else {}),
            })
        e.clear()
    return out


def candidate_words(joyo_set: set[str]) -> dict[str, list[dict]]:
    """Per kanji, the 40 most used common words containing it (wordfreq: books, subtitles, web, news),
    each written form once per reading: the evidence the writers choose from (data/llm/in)."""
    from wordfreq import get_frequency_dict
    wf = get_frequency_dict("ja")
    by_kanji = defaultdict(dict)
    for w in load_words():
        for c in set(w["w"]) & joyo_set:
            by_kanji[c][(w["w"], w["r"])] = w
    per_m = lambda w: wf.get(w["w"], 0) * 1e6
    return {c: [{"w": w["w"], "r": w["r"], "g": w["g"], "pos": w["pos"], "per_million": round(per_m(w), 1)}
                for w in sorted(ws.values(), key=lambda w: (-per_m(w), w["nf"]))[:40]]
            for c, ws in by_kanji.items()}


BATCH = 120


def export_llm_input(order: list[str], kanji: dict, components: dict, cands: dict, kd: dict) -> None:
    """Facts per kanji, in learning order and in batches, for the writers to turn into card content (data/llm/out)."""
    (LLM / "in").mkdir(parents=True, exist_ok=True)
    chs = [c for c in order if c in kanji]
    name = lambda el: components.get(el, {}).get("meaning") or (kd[el]["meanings"][0] if el in kd and kd[el]["meanings"] else "?")
    for b in range(0, len(chs), BATCH):
        rows = [{
            "kanji": c,
            "kanjidic_meanings": kd[c]["meanings"],
            "on": kd[c]["on"], "kun": kd[c]["kun"],
            "parts": [{"part": k["el"], "name": name(k["el"]), **({"sound": True} if "phon" in k else {})} for k in kanji[c]["tree"]["kids"]],
            "candidate_words": cands.get(c, []),
        } for c in chs[b:b + BATCH]]
        (LLM / "in" / f"{b // BATCH:02d}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))


def load_written() -> dict[str, dict]:
    """Card content written per kanji (data/llm/gold.json, then data/llm/out/*.json); see data/llm/INSTRUCTIONS.md."""
    out = {}
    for f in [LLM / "gold.json", *sorted((LLM / "out").glob("*.json"))]:
        if f.exists():
            for x in json.loads(f.read_text()):
                out.setdefault(x["kanji"], x)
    return out


def written_card(x: dict, wf: dict) -> dict:
    """The written content as the app shows it, plus two counts: how often each word is used (wordfreq),
    and from that, each reading's share of use among the written words."""
    per_m = lambda w: round(wf.get(w, 0) * 1e6, 1)
    words = [{**w, "f": per_m(w["w"])} for w in x["words"] + x.get("more", [])]
    use = Counter()
    for w in words:  # not the kanji alone: wordfreq's count for 人 includes the 人 split off 日本人
        use[w["reading"]] += w["f"] or 0.1
    total = sum(c for r, c in use.items() if r != "special") or 1
    return {
        "keyword": x["keyword"], "also": x.get("meanings", []),
        "readings": sorted(({"r": r, "share": round(use[r] / total, 3)} for r in x["readings"]), key=lambda r: -r["share"]),  # most used first
        "alone": x.get("alone"), "words": words, "nshown": len(x["words"]),
        **({"story": x["story"], "kind": x.get("kind") or "mnemonic"} if x.get("story") else {}),
        "written": True,
    }


def load_stories() -> dict[str, dict]:
    """Hand-written stories for parts that are not kanji (亻, 灬); kanji have theirs in data/llm."""
    out = {}
    for l in open(ROOT / "data" / "stories.tsv", encoding="utf-8"):
        if l.strip() and not l.startswith("#"):
            el, keyword, kind, story = l.rstrip("\n").split("\t")
            out[el] = {k: v for k, v in (("keyword", keyword), ("kind", kind), ("story", story)) if v}
    return out


def main() -> None:
    fetch()
    kd = load_kanjidic()
    from wordfreq import get_frequency_dict
    wf = get_frequency_dict("ja")
    freq = char_frequency(wf)
    comp_names = load_components()
    stories = load_stories()
    written = load_written()
    joyo = sorted((c for c, v in kd.items() if v["grade"] in JOYO_GRADES), key=lambda c: -freq.get(c, 0))
    trees = load_trees(set(joyo), kd)
    missing = [c for c in joyo if c not in trees]
    joyo = [c for c in joyo if c in trees]
    joyo_set = set(joyo)

    # every component, with a meaning: the written keyword for a kanji, else components.tsv, else its original form
    used_in = defaultdict(set)
    for ch in joyo:
        for s in subtrees(trees[ch]):
            if s is not trees[ch]:
                used_in[s["el"]].add(ch)

    def meaning(el: str, orig: str | None) -> dict:
        if el in written:
            return {"meaning": written[el]["keyword"]}
        if el in comp_names:
            return comp_names[el]
        if el in kd and kd[el]["meanings"]:  # a kanji outside jōyō used as a part, like 吾 in 語
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
    # strokes per item: a kanji's own count, a part's from the tree it appears in
    strokes = {s["el"]: s["strokes"] for ch in joyo for s in subtrees(trees[ch])} | {ch: kd[ch]["strokes"] for ch in joyo}
    orders = {
        "simple first": greedy(joyo, trees, freq, strokes, power=1.5),  # the one the app teaches in
        "most text per item": greedy(joyo, trees, freq),
        "frequency": plan(joyo, trees, freq),
        "school grade": plan(by_grade, trees, freq),
    }
    fams = families(joyo, trees, kd)
    order = orders["simple first"]
    export_llm_input(order, kanji, components, candidate_words(joyo_set), kd)

    # card content as written (data/llm), plus counts; see data/llm/INSTRUCTIONS.md
    unwritten = [ch for ch in joyo if ch not in written]
    assert not unwritten, f"kanji without written content: {''.join(unwritten)}"
    for ch in joyo:
        kanji[ch] |= written_card(written[ch], wf)
    common = load_words()
    rank, by_freq, kanken, levels = difficulty(joyo, freq, kd)
    # use: how much of common vocabulary is written with the kanji, per million words (names do not count,
    # unlike in character counts, where 藤 and 阪 rank high)
    use = Counter()
    for w in common:
        for c in set(w["w"]):
            use[c] += wf.get(w["w"], 0)
    for ch in joyo:
        kanji[ch] |= {"level": rank[ch], "flevel": by_freq[ch], "kanken": kanken[ch], "use": round((use[ch] + use[VARIANTS.get(ch, "")]) * 1e6, 2)}
    for el, c in components.items():
        if el in stories and el not in kanji:
            c |= {k: v for k, v in stories[el].items() if k != "keyword"}

    OUT.joinpath("kanji.json").write_text(json.dumps({
        "kanji": kanji,
        "components": components,
        "order": orders["simple first"],
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
        "levels": levels,
    }, ensure_ascii=False, separators=(",", ":")))

    # how each kanji and part is drawn, for the stroke order animation; loaded by the app only when shown
    strokes = load_strokes(set(order) | set(joyo))
    app.joinpath("strokes.json").write_text(json.dumps(strokes, ensure_ascii=False, separators=(",", ":")))
    drawn = {ch: len(strokes[ch]["d"]) if ch in strokes else 0 for ch in joyo}

    # every common word written with jōyō kanji, for looking words up in the reader: [word, reading, gloss]
    lexicon = sorted({w["w"]: [w["w"], w["r"], w["g"]] for w in common
                      if all(c in joyo_set or not is_kanji(c) or c == "々" for c in w["w"])}.values())
    app.joinpath("words.json").write_text(json.dumps(lexicon, ensure_ascii=False, separators=(",", ":")))

    report(kd, freq, joyo, joyo_set, trees, components, orders, fams, unnamed, missing, levels, drawn)


def tree_lines(t: dict, components: dict, kd: dict, prefix: str = "", last: bool = True, top: bool = True) -> list[str]:
    gloss = kd[t["el"]]["meanings"][0] if top else components.get(t["el"], {}).get("meaning", "?")
    tags = " · sound" if "phon" in t else ""
    line = f"{t['el']} {gloss}{tags}" if top else f"{prefix}{'└ ' if last else '├ '}{t['el']} {gloss}{tags}"
    sub = prefix if top else prefix + ("  " if last else "│ ")
    return [line] + [l for i, k in enumerate(t["kids"]) for l in tree_lines(k, components, kd, sub, i == len(t["kids"]) - 1, False)]


def report(kd, freq, joyo, joyo_set, trees, components, orders, fams, unnamed, missing, levels, drawn) -> None:
    gloss = lambda el: components.get(el, {}).get("meaning", "?")
    L = []
    p = L.append
    all_cov = sum(freq.get(c, 0) for c in joyo)
    p("# Kanji data report\n")
    p("Generated by `scripts/build_data.py`; do not edit.\n")
    p(f"- {len(joyo)} jōyō kanji with KanjiVG trees" + (f" ({len(missing)} without: {''.join(missing)})" if missing else ""))
    p(f"- {len(components)} distinct components in those trees, {sum(1 for c in components.values() if not c['joyo'])} of them not jōyō kanji themselves")
    p(f"- Text: kanji as written in all of wordfreq's Japanese (subtitles, web, news, books, Wikipedia); jōyō covers {all_cov:.1%} of them\n")

    off = [c for c in joyo if drawn[c] != kd[c]["strokes"]]
    p(f"- Strokes drawn (KanjiVG) against counted (KANJIDIC): {len(joyo) - len(off)} of {len(joyo)} agree"
      + (f"; differ: {', '.join(f'{c} {drawn[c]} vs {kd[c]['strokes']}' for c in off)}" if off else "") + "\n")

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
      "Coverage is the share of all kanji in text that you can read.\n")
    marks = [100, 250, 500, 1000, 2000]
    p("| order | " + " | ".join(f"after {m}" for m in marks) + " | items for 50% | 80% | 90% | total items |")
    p("|---|" + "--:|" * (len(marks) + 4))
    for name, items in orders.items():
        cov = coverage(items, joyo_set, freq)
        at = lambda m: f"{cov[min(m, len(cov)) - 1]:.1%}"
        reach = lambda t: str(items_to_reach(cov, t * all_cov) or "—")
        p(f"| {name} | " + " | ".join(at(m) for m in marks) + f" | {reach(.5)} | {reach(.8)} | {reach(.9)} | {len(items)} |")
    p("\n(50/80/90% are of what all jōyō kanji cover.)\n")
    p("First 60 items of the order the app teaches in (simple first):\n")
    p(" ".join(orders["simple first"][:60]) + "\n")

    p("## How hard a kanji is\n")
    p("Curriculum order, fitted to JLPT and WaniKani levels; weights in decades of frequency (one unit = 10× rarer):\n")
    for n, v in levels["weights"].items():
        p(f"- {n}: {v:+.3f}")
    p("\nOfficial lists as a blurred edge in the difficulty rank (p = Φ((μ − rank)/T)):\n")
    p("| list | kanji | μ | T |")
    p("|---|--:|--:|--:|")
    for o in levels["official"]:
        p(f"| {o['name']} | {o['n']} | {o['mu']} | {o['T']} |")
    p("")

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
