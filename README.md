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
| `crit.html`, `crit.js` | "Crit chance": every result against the hit formula, on the measured formula's line for each Critical Increase, with Critical Increase alone beside each, and a calculator |
| `data/crit.json` | the one data file behind that page |
| `theory.css` | the look, shared by every page here (the gallery's colors and typefaces) |
| `tools/ExportArMultiplier.cs`, `tools/ExportHitChance.cs`, `tools/ExportCrit.cs` | write the three data files from a theorycrafter checkout |

To look at the pages on your own PC, serve this folder with any static web server (the chart page loads its data
file, which a page opened straight from disk can't do):

```
python -m http.server 8138
```

then open http://localhost:8138/. The logo and icon come from the live gallery.

## The data files

All three are written by a tool and never edited by hand.

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
carries the curve on at the climb of its last stretch, as the theorycrafter does (`curveAt` in `ar-multiplier.js`):
from the last reading back to the latest one at least 200 AR under it. Those figures are marked with an asterisk. The chart and the tables stop at the last reading.

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

### `data/crit.json`

```
cd tools
dotnet run ExportCrit.cs -- "PATH\TO\ao-theorycrafter" "..\data\crit.json"
```

It reads every hit lab plan that gives its characters' Critical Increase (`HitData/<plan>.json`, for that alone) and
that plan's results (`HitData/<plan>/steps.tsv`), and keeps only the numbers.

```
{
  "updated": "2026-11-11",
  "sourceCommit": "c7f8bd2",
  "results": [
    { "ar": 133, "def": 1000, "slider": -100, "critIncrease": 7, "landed": 73, "crits": 8 },
    ...
  ]
}
```

- One entry per result: an attacker's AR against a defender's defense, with the defender's slider, the attacker's
  Critical Increase, how many swings landed and how many of those crit.
- The page works out the rest: the hit formula, the share that crit and its 95% range, and how well the measured formula
  fits the results (under "The results").

More results, from a plan already read or a new one, are a change to this file only. The two figures the page draws,
the measured formula and Critical Increase alone, are written in `crit.js`; each Critical Increase's color is there too
(`COLORS`).

## Chart colors

**The attack rating chart.** Each of the 14 professions has one fixed color, `--p-<id>` in `theory.css`, which
`ar-multiplier.js` takes by the profession's id; one it doesn't know draws in gray. The light theme has them as they are.
In the dark theme five are lightened, their hue kept, so that every one clears 3:1 against the chart's surface:

| | Light, on `#ffffff` | Dark, on `#162024` |
|---|---|---|
| Adventurer | `#544443` | `#796867` (lightened) |
| Agent | `#5475a5` | `#5475a5` |
| Bureaucrat | `#555582` | `#676796` (lightened) |
| Doctor | `#c62828` | `#cb2e2d` (lightened) |
| Enforcer | `#ba4637` | `#ba4637` |
| Engineer | `#767e87` | `#767e87` |
| Fixer | `#2b69dc` | `#2b69dc` |
| Keeper | `#0e8c04` | `#0e8c04` |
| Martial Artist | `#b7783e` | `#b7783e` |
| Meta-Physicist | `#026842` | `#227a52` (lightened) |
| Nano-Technician | `#429b84` | `#429b84` |
| Shade | `#3d99a5` | `#3d99a5` |
| Soldier | `#9b8455` | `#9b8455` |
| Trader | `#8f487e` | `#9a5289` (lightened) |

Fourteen colors can't all be told apart from one another: past six, no set passes the dataviz palette check
(colorblind separation of 8 or more, normal-vision separation of 15 or more) on every pair, and a few of these pairs are
close: Doctor and Enforcer, Martial Artist and Soldier, Nano-Technician and Shade, and for red-green colorblind readers
Doctor and Keeper. So a curve isn't told by its color alone: each is named at its end, the hover names every curve under
the pointer, and the buttons and tables put the name beside the color.

**The hit chance chart.** One color per defender's slider setting, `--s-*` in `theory.css` (`SLIDERS` in
`hit-chance.js`), the same hue in both themes. The five were picked so that every pair passes the check, since any two
curves can cross:

| | Light, on `#ffffff` | Dark, on `#162024` |
|---|---|---|
| `--s-purple` | `#6635a3` | `#8758c9` |
| `--s-pink` (full aggressive) | `#c94779` | `#e05c8c` |
| `--s-cyan` (full defensive) | `#1aa1c9` | `#179fc7` |
| `--s-green` | `#09672e` | `#0a7e3a` |
| `--s-gold` (neutral) | `#b18e15` | `#af8c11` |

```
node validate_palette.js "#6635a3,#c94779,#1aa1c9,#09672e,#b18e15" --mode light --surface "#ffffff" --pairs all
node validate_palette.js "#8758c9,#e05c8c,#179fc7,#0a7e3a,#af8c11" --mode dark --surface "#162024" --pairs all
```

**The crit chart.** One color per Critical Increase, from the same five (`COLORS` in `crit.js`): 2 is `--s-cyan`, 7
`--s-pink` and 21 `--s-gold`. One with no color there draws in gray.

Anarchy Online belongs to Funcom. This is a fan site, not affiliated with Funcom.
