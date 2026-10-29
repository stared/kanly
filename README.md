# Kanly

Learning kanji the way [Hanly](https://hanlyapp.com) teaches Chinese characters: each character is a sum of parts you already know, shown as a tree, with a short story that ties the parts to the meaning.

Work in progress. Step 1 is the data and the analysis behind it.

## Ideas

- **Sums and trees.** 照 = 昭 + 灬, and 昭 = 日 + 召, and 召 = 刀 + 口. Learn the parts first, and a new kanji costs only what is new in it.
- **Order by what it buys.** Each step learns the kanji that adds the most readable text per new item (the kanji plus its unknown parts).
- **Sound families.** Many kanji carry a part that hints at the on-reading: 青 in 情晴清精請静, all read セイ. Each family shows how often the hint holds.
- **One view.** Real origin, a part's role and a memory story sit side by side, each labelled for what it is.

## Data

```sh
uv run scripts/build_data.py
```

It downloads the sources to `data/raw/` and writes (all regenerated, so not committed):

- `data/kanji.json`: the 2136 jōyō kanji, each with readings, meanings, frequency, its sum (`明 = 日 + 月`) and full tree. It also holds every component with the kanji it is used in, a learning order, and the sound families.
- `data/report.md`: example trees, the most productive components, coverage per learning order, and sound families.

`data/components.tsv` is written by hand. It gives short, concrete names to components: radical forms such as 亻 and 灬 that KANJIDIC doesn't name, and kanji whose first dictionary gloss is a poor fit for a part (召 is "summon", not "seduce").

## Materials used

| what | used for | license |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/) ([GitHub](https://github.com/KanjiVG/kanjivg), release r20260714) | component trees, phonetic (`kvg:phon`) and radical marks, strokes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by EDRDG | readings, meanings, school grade, stroke count | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [kanji-frequency](https://github.com/scriptin/kanji-frequency) by Dmitry Shpika | kanji counts in Japanese Wikipedia, for coverage | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Because `data/kanji.json` is derived from KanjiVG and KANJIDIC2, it is shared under CC BY-SA.

## Inspirations

- [Hanly](https://hanlyapp.com) ([App Store](https://apps.apple.com/us/app/hanly/id6741442324)) by Artur Gorokh: composition trees, one-sentence origin stories, script evolution, and a quiet look.
- [vibe-japanese](../vibe-japanese): my hiragana and katakana trainer. Kanly will reuse its spaced repetition, its per-part error tracking and its one-shape-one-cue hints.
- [Outlier Linguistics on etymology](https://www.outlier-linguistics.com/outlierblog/2018/2/19/what-is-etymology-2): many popular character stories are folk etymology, and parts play distinct roles (meaning, sound, shape).
- [Dong Chinese on character origins](https://blog.dong-chinese.com/2019/07/07/character-origins.html): components as meaning, sound, picture, or unknown.
