# Writing card content

You write the content of kanji cards for Kanly, an app for English speakers learning to read Japanese.
Input: `data/llm/in/NN.json`, one entry per kanji with dictionary facts (KANJIDIC meanings, on and kun readings,
how often each reading occurs in common words, the kanji's parts) and its ~20 most used candidate words
(word, reading, JMdict gloss, part of speech, uses per million words).
Output: `data/llm/out/NN.json`, a JSON array with one object per input kanji, same order.
Everything the card shows comes from what you write; nothing is fixed up afterwards, so check every field.

Use the facts as evidence, not as text to copy: dictionary glosses are often archaic, too long, or list senses
that only occur inside compounds. Write what a good teacher would put on the card. Be correct first, then short.

## Fields

```json
{
  "kanji": "一",
  "keyword": "one",
  "meanings": [],
  "readings": ["イチ", "ひと.つ", "イツ"],
  "alone": { "r": "いち", "g": "one", "reading": "イチ" },
  "words": [
    { "w": "一緒", "r": "いっしょ", "g": "together", "lit": "one-cord", "reading": "イチ", "furigana": [["一", "いっ"], ["緒", "しょ"]] },
    { "w": "一つ", "r": "ひとつ", "g": "one (thing)", "reading": "ひと.つ", "furigana": [["一", "ひと"], ["つ", ""]] },
    { "w": "一人", "r": "ひとり", "g": "one person; alone", "reading": "special", "special": true, "furigana": [["一人", "ひとり"]] }
  ],
  "more": [],
  "story": null,
  "kind": null
}
```

- **keyword**: the meaning to remember the kanji by, 1 to 3 words, lowercase, the most common modern meaning
  (看 "see", not "watch over"; 第 "ordinal", 様 "manner"). Two meanings only when both are central, with "; ".
- **meanings**: 0 to 3 other real meanings of the kanji itself, not repeating the keyword. Leave out senses that
  only exist as abbreviations inside compounds (日 is not "Japan"; 米 is not "USA"), radical names, counters
  phrased as "counter for …" (say what is counted instead, if it matters), and dictionary notes such as "(kokuji)".
- **readings**: the readings to show, most important first, written as in the input (`on` in katakana, `kun` in
  hiragana with a dot before okurigana, without "-"). Only readings of the kanji itself that a learner will meet;
  leave out ones that occur only inside special whole-word readings (人: り and と come from 一人 ひとり and 大人 おとな,
  so they are not readings of 人) and archaic ones. Beginner-core readings belong here even when their share is
  small (上 うえ; 日 か as in 二日, 三日).
- **alone**: the kanji written alone as an everyday word: its reading, a short gloss, and which entry of
  `readings` it is. 一 is いち "one"
  (ひと is only a prefix, as in 一つ, 一人); 人 is ひと "person"; 日 is ひ "day; sun"; 中 is なか "inside".
  `null` if it is not used alone (明, 照), or only as a prefix, suffix or counter.
- **words**: the 5 words a learner should meet first: the most used ones, but each a real, everyday word, and
  together covering the main readings (a reading used in 10%+ of words should appear). Pick from
  `candidate_words`, copying `w` and `r` exactly; you may add an essential word that is missing there (一人 on 人)
  if you are sure of its spelling and reading. Leave out names, rare senses, and pure prefix/suffix entries.
  Do not include the kanji alone here (it is in `alone`). Prefer the dictionary form of verbs and adjectives
  (上げる "raise", not the noun 上げ; 生きる, not 生き). Core beginner words beat slightly more frequent but obscure
  ones (待つ before 期待 is fine; 学生 and 生まれる belong on 生; 明るい on 明; 銀行 and 旅行 on 行).
  - **g**: a short, natural English gloss, at most 6 words, the sense a learner will meet.
    Counters: say how they are used ("months, as in 3ヶ月").
  - **lit**: the word read kanji by kanji, lowercase, joined with "-", only when it helps to remember
    the word or shows how the kanji contributes (日本 "sun-origin", 今日 "now-day", 説明 "explain-clear").
    Use the sense each kanji has in this word, not its keyword (本日 "this-day", 待機 "wait-opportunity",
    正月 "first-month", 参照 "consult-illuminate"). Omit it when it is just the gloss again, when it would mislead,
    for words written with one kanji, and for special readings.
  - **special**: `true` when the reading belongs to the whole word and cannot be split kanji by kanji
    (今日 きょう, 明日 あした, 一人 ひとり, 大人 おとな). Omit otherwise.
  - **reading**: which entry of `readings` this kanji has in this word, copied exactly (一緒 → "イチ", even though
    it sounds いっ; 一つ → "ひと.つ"), or "special" for special readings. The app counts these to show how often
    each reading is used, so be exact.
  - **furigana**: the word split into pieces with the reading of each, covering `w` exactly in order: each kanji
    with its sound in this word (sound changes included: 一緒 いっ+しょ, 日本 に+ほん), kana as themselves with "",
    a special-reading word as one piece. This is shown above the word; it must be right.
- **more**: up to 10 further useful words, same format, most used first.
- **story**: one short sentence about the shape, at most 14 words (20 for three or more parts), plain English,
  that helps remember the kanji from its look or its parts. Write part characters inline after their names, as in
  "A person 亻 resting by a tree 木", each written exactly as in `parts` (竹, not ⺮). A mnemonic uses every
  entry of `parts`: a part left out is a part the learner cannot place (侵 needs its 又, not only 亻, ⺕ and 冖).
  Make it one scene told in a full sentence, not a list of parts strung with commas
  ("A person 亻 with a broom ⺕ in hand 又, sweeping into another's house 冖", not "A person 亻, broom ⺕, hand 又, house 冖").
  A part that is in the kanji for its sound (`"sound": true`, when that is really its role) is not forced into
  the scene: tell the scene with the meaning parts and say what the sound part does, with the reading only when
  it is the same ("Threads 糸 gathered into one bundle; 忩 gives the sound ソウ"; "Raw silk thread 糸 with nothing
  added; 屯 is the sound part"). Keep one scene when the sound part fits it naturally (脂: flesh 月 that tastes good 旨).
  An origin story may leave parts out when the character was never a sum of them (高 is a tower). Say something the keyword does not already say: no "A picture of the sun."
  For a simple pictograph say what is not obvious (日: "Once a circle with a dot; the brush squared it.").
  `null` when nothing useful can be said.
- **kind**: `"origin"` only if the story is the accepted history of the character (中 is a pole with
  streamers, not a line through a box; 人 is a person standing in profile); `"mnemonic"` if it is a
  story to remember it by (folk etymology counts as mnemonic). `null` when `story` is null.

No dot-separated lists, no filler, no "also". If unsure about a fact, leave it out rather than guess.
