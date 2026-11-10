# Kanly

Learn the 2136 jōyō kanji as sums of parts you already know (照 = 昭 + 灬), in the spirit of [Hanly](https://hanlyapp.com) for Chinese. Made for advanced learners too: it finds your level and skips what you know.

## Run

```sh
pnpm install
pnpm data      # downloads the sources, builds the data (needs uv)
pnpm dev       # http://localhost:5201
pnpm test
```

## What it does

- **Learn and review**: every kanji is a quiz first, its meaning among four, then its reading among four; then its card: parts, story, readings with how often each is used, stroke order, the most used words.
- **Placement**: a learner who knows μ kanji knows the one ranked k with probability Φ((μ − k)/T); μ, T and the mix between a curriculum order and a frequency order are fitted after every answer. Next comes the kanji with the most usefulness per effort. Details in `src/levels.ts`.
- **Reader**: paste Japanese text, get furigana only over kanji you have not learned.
- **Analysis**: coverage per learning order, the most productive parts, how reliable sound families are.

Card content (keywords, stories, example words, part trees) is written by a language model per kanji, following `data/llm/INSTRUCTIONS.md`, and checked against JMdict by `scripts/check_written.py`. Generated data (`src/data/`, `data/kanji.json`, `data/report.md`) is not committed; `pnpm data` rebuilds it.

## Sources

| | used for | license |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/) | part trees, phonetic and radical marks, strokes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [CJKVI IDS](https://github.com/cjkvi/cjkvi-ids) (from the [CHISE](http://www.chise.org/) IDS database) | where a part sits in a kanji (left, top, frame…), for the graph | GPLv2 |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) (EDRDG) | readings, meanings, stroke counts | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (EDRDG) | common words, reading usage | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [wordfreq](https://github.com/rspeer/wordfreq) (Robyn Speer) | word and kanji frequency | code Apache 2.0, data [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| [kanji-data](https://github.com/davidluzgouveia/kanji-data) (David Gouveia) | JLPT and WaniKani levels, to calibrate difficulty | MIT |
| [kanji](https://github.com/fosskers/kanji) (Colin Woodbury) | kanji kentei levels | BSD-3-Clause |

Code is MIT; data derived from the sources above is CC BY-SA.

## Inspirations

- [Hanly](https://hanlyapp.com) by Artur Gorokh: composition trees, one-sentence origin stories, a quiet look.
- [vibe-japanese](https://github.com/stared/vibe-japanese): my kana trainer; Kanly reuses its stack and look.
- [Outlier Linguistics](https://www.outlier-linguistics.com/outlierblog/2018/2/19/what-is-etymology-2) and [Dong Chinese](https://blog.dong-chinese.com/2019/07/07/character-origins.html) on character origins: parts carry meaning, sound or shape, and many popular stories are folk etymology.
