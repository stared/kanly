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

- **learn**: the next kanji for your level (see Levels), first as a quiz: its meaning among four, then its reading among four (each option a reading profile, such as ニン 49% ジン 42%). Both right and it counts as known; otherwise it joins your reviews. Wrong options are look-alikes (待 for 持, never through the meaning radical, which would give near-synonyms) or kanji of similar difficulty. Then the card: the sum (照 = 昭 + 灬), the story, readings with how often each is used in common words, the sound family, the full tree, the most used words (with more on request) with the kanji's part of the reading marked, kanji one part apart (待 持 特 時), and what the item is a part of.
- **review**: spaced repetition, with the same quiz: it passes only with both meaning and reading right.
- **kanji**: all 2136 jōyō kanji and their parts in learning order, searchable by character, meaning or reading.
- **reader**: paste Japanese text; it is split into common words (longest match, verb stems included), with furigana over words whose kanji you have not learned. Tap a word for its reading, meaning and kanji.
- **analysis**: coverage per item for three learning orders, the parts that pay off most, and how reliable sound families are.

## Ideas

- **Sums and trees.** 照 = 昭 + 灬, and 昭 = 日 + 召, and 召 = 刀 + 口. Learn the parts first, and a new kanji costs only what is new in it. KanjiVG groups strokes as they are drawn, so it often splits a shape into pieces a learner does not see (止 as 卜 "divining crack", 重 as a 2-stroke 千 + 里, 彳 as 亻); every tree was reviewed, and about 380 elements are rewritten in `data/llm/trees.json`, applied wherever they appear.
- **Simple first, then what it buys.** Like Hanly, start from the simplest shapes. Each step learns the kanji that adds the most readable text per new stroke (the kanji plus its unknown parts), simple shapes weighted extra: 一 人 日 大 月 入 子 十, and 干 just before 年 needs it.
- **Sound families.** Many kanji carry a part that hints at the on-reading: 青 in 情晴清精請静, all read セイ. Each family shows how often the hint holds: 71% of members across 225 families.
- **Readings as data.** Each kanji's reading is aligned in common JMdict words (明日 みょうにち → 明 みょう + 日 にち), so the card shows which readings you will actually meet.
- **Frequency as written.** How often a kanji is written: every word wordfreq knows (subtitles, web, news, books, Wikipedia), weighted by its use, each character counted wherever it occurs, alone or inside a word. It follows the order learners meet kanji better than Wikipedia, Aozora or news counts (Spearman with JLPT levels 0.62 against 0.54; WaniKani 0.84 against 0.79): Wikipedia puts 私 724th and 俺 1501st, this 61st and 103rd. It drives coverage ("you read X% of text") and the difficulty orders.
- **Two orders of difficulty, mixed per learner.** 勉 ranked 728th was a canary: the curriculum fit (to JLPT and WaniKani levels) read the 196 kanji added to jōyō in 2010 (俺 誰 頃, all kentei 2級), absent from the older JLPT lists, as harder than N1. They are now missing data with their own term, and courses still teach them late (WaniKani 俺 at level 44) while text uses them early. So there are two orders, both ranks: by curriculum (log frequency, +0.04 decades per stroke, +0.43 per kentei level, +4.6 for being a 2010 addition) and by frequency. A learner's order is a mix λ between them, fitted from the quiz with μ and T; in simulation it is found within 20–60 answers, and over 150 quiz cards it gives a reader 30–34% more usefulness than a fixed half-half mix (a course learner 7–19%).
- **Levels as a Fermi sea.** For an advanced learner a fixed order wastes hundreds of cards on kanji they know. Each kanji gets a difficulty rank; someone who knows about μ kanji knows kanji k with probability Φ((μ − rank)/T), a step blurred by a Gaussian of width T (it fits the official lists slightly better than a Fermi–Dirac edge, with a lighter far tail, so nobody at N2 is asked about 人). Next is the kanji with the most expected usefulness per expected effort, (1 − p)·use / ((1 − p)·cost + p·ρ): use is how much of common vocabulary it writes, cost the strokes or known-part chunks its shape takes, ρ the small effort of a quiz on a kanji already known; Gumbel noise scaled by τ widens the choice. After every answer μ, T and λ come from the exact posterior on a grid, with the official list picked at the start as the prior and a likelihood that allows a lucky guess (1 in 16) or a slip: from a JLPT N2 guess, a learner who knows 1800 kanji is placed within 15 in 10 answers. A beginner gets simple-first order. In simulation a learner who knows 1100 kanji meets 194 new kanji in 300 cards, against 19 in the fixed order; fitting T is worth 30% for learners with a blurred frontier; two ideas were not worth it: smoothing answers over word or part graphs (under 1.5% better predictions), and crediting a kanji for the later kanji it makes cheaper (寺 for 時 持 待; under 1% more usefulness per effort, since counting known parts as one chunk already gets it).
- **One view.** Real origin, a part's role and a memory story sit side by side, each labelled for what it is.

## Data

```sh
uv run scripts/build_data.py
```

It downloads the sources to `data/raw/` and writes (all regenerated, so not committed):

- `src/data/kanji.json`: the compact copy the app imports; `src/data/words.json`: about 17k common words for the reader.
- `data/kanji.json`: the 2136 jōyō kanji, each with readings, meanings, frequency, its sum (`明 = 日 + 月`) and full tree. It also holds every component with the kanji it is used in, a learning order, and the sound families.
- `data/report.md`: the fitted difficulty weights, example trees, the most productive components, coverage per learning order, and sound families.

Written by hand:

- `data/components.tsv`: short, concrete names for components: radical forms such as 亻 and 灬 that KANJIDIC doesn't name, and kanji whose first dictionary gloss is a poor fit for a part (召 is "summon", not "seduce").
- `data/llm/`: all card content, written per kanji by a language model following `INSTRUCTIONS.md`, starting from a hand-written gold standard (`gold.json`); `scripts/check_written.py` checks every word and reading against JMdict.
- `data/stories.tsv`: stories for parts that are not kanji (亻, 灬).

## Materials used

| what | used for | license |
|---|---|---|
| [KanjiVG](https://kanjivg.tagaini.net/) ([GitHub](https://github.com/KanjiVG/kanjivg), release r20260714) | component trees, phonetic (`kvg:phon`) and radical marks, strokes | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) by EDRDG | readings, meanings, school grade, stroke count | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [kanji-data](https://github.com/davidluzgouveia/kanji-data) by David Gouveia | JLPT levels (Jonathan Waller's lists) and WaniKani levels, only to calibrate difficulty | MIT |
| [kanji](https://github.com/fosskers/kanji) by Colin Woodbury | kanji kentei (漢検) level of each kanji, a term of difficulty | BSD-3-Clause |
| [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) by EDRDG | common words (news1, ichi1, spec, gai1) for examples and reading usage | [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) |
| [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer | how often each word is used (books, subtitles, web, news), to pick the most used example words, and, counting every character in it, how often each kanji is written | code Apache 2.0, data [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

Because the generated data is derived from KanjiVG, KANJIDIC2, JMdict and wordfreq, it is shared under CC BY-SA. Code is MIT.

## Inspirations

- [Hanly](https://hanlyapp.com) ([App Store](https://apps.apple.com/us/app/hanly/id6741442324)) by Artur Gorokh: composition trees, one-sentence origin stories, script evolution, and a quiet look.
- [vibe-japanese](../vibe-japanese): my hiragana and katakana trainer. Kanly reuses its stack, look, spaced-repetition steps and screenshot script.
- [Outlier Linguistics on etymology](https://www.outlier-linguistics.com/outlierblog/2018/2/19/what-is-etymology-2): many popular character stories are folk etymology, and parts play distinct roles (meaning, sound, shape).
- [Dong Chinese on character origins](https://blog.dong-chinese.com/2019/07/07/character-origins.html): components as meaning, sound, picture, or unknown.
