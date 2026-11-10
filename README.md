# Anarchaeology: Theory

How Anarchy Online's combat numbers work, measured in game. Meant to be served at
https://anarchaeology.github.io/theory/, alongside the [Anarchaeology](https://anarchaeology.github.io/) gallery and
its [forum archive](https://anarchaeology.github.io/forums/).

Plain static files, no build step.

| File | What it is |
|---|---|
| `index.html`, `index.js` | the section's front page: one row per page, and in its footer the latest "updated" date among their data files |
| `ar-multiplier.html`, `ar-multiplier.js` | "Attack rating and damage": every measured profession's damage multiplier against AR on one chart, with the old number's straight line for each |
| `data/ar-multiplier.json` | the one data file behind that page |
| `hit-chance.html`, `hit-chance.js` | "Hit chance": every result against AR over defense, on the measured formula's curve for each of the defender's slider settings, with the linear formula's line for each, and a calculator |
| `data/hit-chance.json` | the one data file behind that page |
| `theory.css` | the look, shared by every page here (the gallery's colors and typefaces) |
| `tools/ExportArMultiplier.cs`, `tools/ExportHitChance.cs` | write the two data files from a theorycrafter checkout |

To look at the pages on your own PC, serve this folder with any static web server (the chart page loads its data
file, which a page opened straight from disk can't do):

```
python -m http.server 8138
```

then open http://localhost:8138/. The logo and icon come from the live gallery.

## The data files

Both are written by a tool and never edited by hand.

### `data/ar-multiplier.json`

```
cd tools
dotnet run ExportArMultiplier.cs -- "PATH\TO\ao-theorycrafter" "..\data\ar-multiplier.json"
```

It reads two tables from the theorycrafter (`MeasuredArCurves.cs` and `ProfScale` in `DpmCalculator.cs`) and nothing
else, so the page shows the same curves the app uses. Needs the .NET 10 SDK.

```
{
  "updated": "2026-11-10",              the day the file was written
  "sourceCommit": "64081e9",            the theorycrafter commit the tables were read at
  "softCap": { "ar": 1000, "multiplier": 3.5, "arPerPoint": 400 },
  "professions": [
    { "id": "doctor", "name": "Doctor", "old": 0.10, "points": [[1028, 3.52419], [1128, 3.57258], ...] },
    { "id": "agent", "name": "Agent", "old": 0.39, "points": [] },
    ...
  ]
}
```

- `old`: the profession's old number, the figure in common use before these readings: the multiplier's gain per 400 AR
  past the soft cap, as a straight line. The pages call these "the old numbers".
- `points`: the measured curve as `[AR, multiplier]` pairs in AR order, joined point to point from the soft cap. Empty
  for a profession that hasn't been measured; the page lists it with its old number and doesn't draw it.

The comparison under the chart runs to AR 3,500, past where the readings stop. Past a profession's last reading it
carries the curve on along the line through its last two readings, as the theorycrafter does (`curveAt` in
`ar-multiplier.js`), and marks those figures with an asterisk. The chart and the tables stop at the last reading.

More readings, or a newly measured profession, are a change to this file only: the chart, the buttons, the comparison
and the tables are all built from it. The words under "What the readings show" are written by hand in
`ar-multiplier.html`.

The file holds results only. Nothing about the tests (characters, weapons, logs) is in it or on the page.

### `data/hit-chance.json`

```
cd tools
dotnet run ExportHitChance.cs -- "PATH\TO\ao-theorycrafter" "..\data\hit-chance.json"
```

It reads the hit lab's results (`HitData/curve/steps.tsv`) and keeps only the numbers.

```
{
  "updated": "2026-11-10",
  "sourceCommit": "64081e9",
  "results": [
    { "ar": 133, "def": 1000, "slider": 0, "attackerSlider": 0, "swings": 2346, "landed": 588 },
    ...
  ]
}
```

- One entry per result: an attacker's AR against a defender's defense, with the defender's slider (`slider`, from
  -100 at full defensive to 100 at full aggressive) and the attacker's own, and how many swings were made and landed.
- The page works out the rest: AR over defense, the share that landed and its 95% range.

More results are a change to this file only. The two formulas the page draws, the measured one and the linear one in common use, are
written in `hit-chance.js`; the slider settings' names and colors are there too (`SLIDERS`).

## Chart colors

Each profession has one fixed color (`COLOR` in `ar-multiplier.js`, the `--s-*` values in `theory.css`), the same hue
in the light and the dark theme. A newly measured profession draws in gray until it is given one.

The five in use were picked so that every pair passes the dataviz palette check on the chart's own background
(colorblind separation of 8 or more, normal-vision separation of 15 or more, 3:1 contrast, lightness band), since any
two curves can cross:

| | Light, on `#ffffff` | Dark, on `#162024` |
|---|---|---|
| Keeper | `#6635a3` | `#8758c9` |
| Fixer | `#c94779` | `#e05c8c` |
| Doctor | `#1aa1c9` | `#179fc7` |
| Trader | `#09672e` | `#0a7e3a` |
| Bureaucrat | `#b18e15` | `#af8c11` |

```
node validate_palette.js "#6635a3,#c94779,#1aa1c9,#09672e,#b18e15" --mode light --surface "#ffffff" --pairs all
node validate_palette.js "#8758c9,#e05c8c,#179fc7,#0a7e3a,#af8c11" --mode dark --surface "#162024" --pairs all
```

Run both again with the whole list whenever a color is added. About eight colors can be told apart this way; past
that the chart needs another way to show which curve is which.

Anarchy Online belongs to Funcom. This is a fan site, not affiliated with Funcom.
