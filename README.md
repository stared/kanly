# Kanly

Learning kanji the way [Hanly](https://hanlyapp.com) teaches Chinese characters: each character is a sum of parts you already know, shown as a tree, with a short story that ties the parts to the meaning.

## Run

```sh
pnpm install
pnpm data      # uv run scripts/build_data.py: downloads sources, writes the data
pnpm dev       # http://localhost:5201
pnpm test
pnpm shots     # screenshots via Chrome; SEED=N pretends the first N items are learned
```

## What's in the app

- **learn**: the next item in the learning order, as a card: the sum (照 = 昭 + 灬), the story, readings with how often each is used in common words, the sound family, the full tree, the most used words (with more on request) with the kanji's part of the reading marked, kanji one part apart (待 持 特 時), and what the item is a part of.
- **review**: spaced repetition. See the kanji, recall its meaning and a reading, then reveal and grade.
- **kanji**: all 2136 jōyō kanji and their parts in learning order, searchable by character, meaning or reading.
- **reader**: paste Japanese text; it is split into common words (longest match, verb stems included), with furigana over words whose kanji you have not learned. Tap a word for its reading, meaning and kanji.
- **analysis**: coverage per item for three learning orders, the parts that pay off most, and how reliable sound families are.

## Ideas

- **Sums and trees.** 照 = 昭 + 灬, and 昭 = 日 + 召, and 召 = 刀 + 口. Learn the parts first, and a new kanji costs only what is new in it.
- **Order by what it buys.** Each step learns the kanji that adds the most readable text per new item (the kanji plus its unknown parts).
- **Sound families.** Many kanji carry a part that hints at the on-reading: 青 in 情晴清精請静, all read セイ. Each family shows how often the hint holds: 71% of members across 225 families.
- **Readings as data.** Each kanji's reading is aligned in common JMdict words (明日 みょうにち → 明 みょう + 日 にち), so the card shows which readings you will actually meet.
- **One view.** Real origin, a part's role and a memory story sit side by side, each labelled for what it is.

## Data

```sh
uv run scripts/build_data.py
```

It downloads the sources to `data/raw/` and writes (all regenerated, so not committed):

- `src/data/kanji.json`: the compact copy the app imports; `src/data/words.json`: about 17k common words for the reader.
- `data/kanji.json`: the 2136 jōyō kanji, each with readings, meanings, frequency, its sum (`明 = 日 + 月`) and full tree. It also holds every component with the kanji it is used in, a learning order, and the sound families.
- `data/report.md`: example trees, the most productive components, coverage per learning order, and sound families.

Written by hand:

- `data/components.tsv`: short, concrete names for components: radical forms such as 亻 and 灬 that KANJIDIC doesn't name, and kanji whose first dictionary gloss is a poor fit for a part (召 is "summon", not "seduce").
- `data/keywords.tsv`: keywords where KANJIDIC's first meaning misleads (看 is "see", not "watch over").
- `data/stories.tsv`: a keyword and a one-sentence story for the first ~120 kanji in the learning order, each marked `origin` (the real history of the shape) or `memory` (a story to remember it by).

## Materials used

| what | used for | license |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/) ([GitHub](https://github.com/KanjiVG/kanjivg), release r20260714) | component trees, phonetic (`kvg:phon`) and radical marks, strokes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by EDRDG | readings, meanings, school grade, stroke count | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [kanji-frequency](https://github.com/scriptin/kanji-frequency) by Dmitry Shpika | kanji counts in Japanese Wikipedia, for coverage | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) by EDRDG | common words (news1, ichi1, spec, gai1) for examples and reading usage | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer | how often each word is used (books, subtitles, web, news), to pick the most used example words | code Apache 2.0, data [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Because the generated data is derived from KanjiVG, KANJIDIC2, JMdict and wordfreq, it is shared under CC BY-SA. Code is MIT.

## Inspirations

- [Hanly](https://hanlyapp.com) ([App Store](https://apps.apple.com/us/app/hanly/id6741442324)) by Artur Gorokh: composition trees, one-sentence origin stories, script evolution, and a quiet look.
- [vibe-japanese](../vibe-japanese): my hiragana and katakana trainer. Kanly reuses its stack, look, spaced-repetition steps and screenshot script.
- [Outlier Linguistics on etymology](https://www.outlier-linguistics.com/outlierblog/2018/2/19/what-is-etymology-2): many popular character stories are folk etymology, and parts play distinct roles (meaning, sound, shape).
- [Dong Chinese on character origins](https://blog.dong-chinese.com/2019/07/07/character-origins.html): components as meaning, sound, picture, or unknown.
