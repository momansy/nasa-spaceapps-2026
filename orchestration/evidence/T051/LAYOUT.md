# T051 layout and link checks for `docs/play/guide.html`

Served locally (`python -m http.server` in `docs/play/`) and opened in the built-in browser, measured in the page with JavaScript.

| Check | 375 px wide (phone) | 1280 px wide (desktop) |
|---|---|---|
| Horizontal page scroll | none (`scrollWidth` 375, `innerWidth` 375) | none (`scrollWidth` 1265 = width minus the scrollbar) |
| Content wider than the screen outside tables | none | none |
| Wide tables | scroll inside their own box (focusable, labelled region) | fit |
| Images | 3 of 3 load, all have `alt` text | 3 of 3 load |
| In-page links (table of contents) | all 13 resolve | all 13 resolve |
| Local links (`./`, `judges.html`, `credits.html`) | 200 | 200 |
| External links | `https://missionforge-spaceapps.onrender.com/play/` returns 200; the `GUIDE.md` link on GitHub works once this branch is merged | same |
| External scripts | none | none |

Image sizes in `docs/play/guide/`: `beauty.jpg` 285 KB, `vote.png` 141 KB, `minigame.png` 268 KB (each under the 300 KB limit).

`guide-1280-contracts.jpg` is a screenshot of the Contracts table at 1280 px. The browser pane crops screenshots to its own window size, so the phone-width check is recorded by the measurements above instead of a screenshot.
