# T055: WebGL host rebuild from main (flight, end screens, glyphs)

Worker: `yousuf-amek` · Unity 6000.6.9f1 · committed build: Brotli, 2026-11-15 11:01 UTC (a Gzip build at 10:25 UTC was used for run 1 and not committed) · machine: Apple M4, macOS.

## 1. Glyphs

**Root cause.** The host's body font files `UI/Fonts/ibm-plex-sans-{400,500,600}.ttf` were Latin subsets
(57 KB, about 230 glyphs). They lacked ≈, ₂, →, ≤, ≥, ∆, Δ, ‖ and U+202F, so the WebGL host drew U+FFFD
("10-storey building � 30 m", "Fuel cells (H�/O�)"). The T054 report guessed ×; the Scale view string is
actually `≈` (`ui.buildbay.tools.scale.building`). The heading font Oxanium (20 KB) is also a subset with
no arrows, Greek or ≈/≤/≥.

**Fix (all in `unity/MissionForge/Assets/MissionForge/UI/Fonts/` except one line).**

| Change | Detail |
|---|---|
| Full IBM Plex Sans 400/500/600 | Upstream IBM Plex v3.006 TTFs (`github.com/IBM/plex`, `packages/plex-sans/fonts/complete/ttf/`), SIL OFL 1.1 (already in `IBMPlex-OFL.txt`). 951 glyphs each. Same file names, so the `.meta` GUIDs and every USS `url()` reference are unchanged. Digits are still tabular (600 units, `TokenSyncTests.PlexSans_DigitsAreTabular` passes). |
| `MF_GlyphFallback_PlexSans.asset` | Dynamic TextCore FontAsset (SDFAA, 90 pt sampling, 1024² atlas, empty in the repo, filled at run time) on the full Plex Sans 400 file. |
| `MissionForgeTextSettings.asset` | `PanelTextSettings` copied from the UI Toolkit default, with the fallback asset as its only global fallback font. Any glyph missing from Oxanium or Plex Mono is drawn from Plex Sans. |
| `UI/MissionForgePanelSettings.asset` | One line: `textSettings` now points to `MissionForgeTextSettings.asset` (was `{fileID: 0}`, the built-in default). **Outside my owned paths; needed so the fallback applies to the whole panel.** |
| `unity/MissionForge/THIRD_PARTY.md` | Font row no longer says "Latin subset"; names the upstream source. Attribution accuracy only. |

The assets were made by a one-off editor script, kept here as `T055FontSetup.cs.txt` (it was deleted from
`Assets/` after the build).

**Characters.** `CHARACTERS.md` lists all 23 non-ASCII characters in player-visible host text (English string
tables plus runtime C#/UXML string literals at main + T027) and which fonts contain them. Missing from the
body font before: 9. Missing after: 0. `report.py` regenerates the table.

**Before / after.**

| | Before (current live build, T040) | After (this build) |
|---|---|---|
| Scale view | `before/build-scale-view-glyphs.jpg`: "10-storey building **�** 30 m" | `after/07-build-scale-view-glyphs.jpg`: "10-storey building **≈** 30 m" |
| Vote 20 | (not reached in the before run) | `after/08-build-vote20-fuel-cells-h2-o2.jpg`: "Fuel cells (**H₂/O₂**)" |
| Contract card | `before/contract-vote-placeholder.jpg`: placeholder screen | `after/05-contract-vote.jpg`: "Suborbital, **≥**100 km apogee", ±, ×, ° |
| Font coverage | `glyph-specimen-before-after.png` (rendered with Pillow from the actual font files) | same image, lower half |

## 2. WebGL build

- Source: `main` at `d6fc7ba5` plus T027 (PR #231, branch `agentmesh/yousuf-amek/issue-205`, which merges cleanly
  into main) overlaid in the working tree for the build only. T027 sources were **not** committed here; they
  arrive with PR #231. The committed `docs/play/host/` output therefore contains T016 flight, T034 Build Bay,
  T035 UI polish, T024 end screens and T027 pre-flight screens.
- Command: `Unity -batchmode -quit -projectPath unity/MissionForge -buildTarget WebGL -executeMethod MissionForge.Build.WebGL`,
  17 scenes, 0 errors, 0 warnings, 247 s. Summary: `webgl-build-summary.txt`.

**Decision: Brotli instead of Gzip (deviation from the brief).** The first build used the existing Gzip
settings: `host.data.unityweb` came out at 50.31 MiB (52,758,337 B). The worker that publishes this branch skips
every file over 49 MiB (`mesh.py`, `MAX_FILE_BYTES = 49 * 1024 * 1024`), so that file would have been left out of
the PR and the live host would break. The growth is the flight world, Build Bay environment and kit meshes merged
since T040 (91 MB of meshes uncompressed), not the fonts. Getting Gzip under the limit would mean changing other
teams' art import settings (mesh compression on 97 kit models, mesh-channel stripping) with visual risk, so I
changed one line in `Editor/Build.cs` to `WebGLCompressionFormat.Brotli` (decompression fallback unchanged) and
rebuilt. The hosted server only sends `Content-Encoding: gzip` for files that start with the gzip magic bytes,
so Brotli files go out without an encoding header and Unity's loader decodes them in JavaScript.

Cost, measured locally on the hosted server (Apple M4, headed Chrome, time from navigation to `window.mfUnity`):
Gzip 1.6 s / 2.6 s, Brotli 4.7 s / 4.3 s (two runs each). Brotli downloads 12.3 MB less (52.7 → 43.9 MB data,
12.9 → 9.4 MB wasm), which offsets much of that on a real connection.

**Operational note:** `staticSite.ts` caches its gzip check per file path for the life of the process. A server
that served the old Gzip files keeps sending `Content-Encoding: gzip` for the new Brotli files and the host
never loads (seen locally on the long-running :10000 server). A Render deploy starts a new process, so production
is fine; any long-running local server must be restarted after pulling this build.

**Size vs before**

| File | Before (T040, #159, Gzip) | Gzip rebuild (not committed) | Committed (T055, Brotli) |
|---|---|---|---|
| `Build/host.data.unityweb` | 31.60 MiB | 50.31 MiB | **41.91 MiB** (43,950,134 B) |
| `Build/host.wasm.unityweb` | 12.07 MiB | 12.33 MiB | 8.95 MiB |
| `Build/host.framework.js.unityweb` | 0.08 MiB | 0.08 MiB | 0.07 MiB |
| `Build/host.loader.js` | 0.05 MiB | 0.05 MiB | 0.11 MiB (includes the Brotli decoder) |
| `Build/` total | 43.79 MiB (45,914,932 B) | 62.77 MiB | 51.05 MiB (53,530,261 B) |
| `docs/play/host/` total | 44.95 MiB (47,133,874 B) | 67.54 MiB | 55.82 MiB (58,529,680 B), incl. the 3.41 MiB T027 briefing video |

Largest committed file: 41.91 MiB, under the 49 MiB publish limit and the 50 MB rule.

## 3. Local hosted verification

`npm --prefix server ci && npm --prefix server run build`, then
`PORT=10000 RENDER_EXTERNAL_URL=http://localhost:10000 npm --prefix server run start:hosted`.
`play.mjs` (Playwright): headed Chrome with ANGLE Metal (`ANGLE Metal Renderer: Apple M4`) at 1920×1080 for the
host, three headless phone clients (Ada, Yuri, Sally) on `/play/client/?room=CODE` on autopilot (ready, vote,
GO, call-outs). Vote timer 20 s, inspect 20 s (lobby defaults; shortest that the phones could still vote in).
Log: `playthrough.log`. Run 1 used the Gzip build (identical sources and assets); the committed Brotli build was
then checked live on a freshly started server through lobby, briefing, contract vote and five Build Bay votes
including the Scale view (`after-brotli/`, `playthrough-brotli.log`, 0 host socket closes).

| Screen | Result | Evidence |
|---|---|---|
| Title, room open, lobby (3 crew) | OK | `after/01`–`03` |
| Briefing | Real C1 data: 9.70 km/s, 90 $M · game-scaled, 180 days, CAPCOM line; advanced on its own after 43 s | `after/04-briefing.jpg` |
| Contract vote | Three real contracts with Δv, budget, schedule, objectives; voted by phones | `after/05-contract-vote.jpg` |
| Build Bay | 22 votes played by the phones, live readiness values, Scale view, vote 20 | `after/06`–`08` |
| FRR | **Defect: empty panel for 3 min** in a live room (see below); skipped with PageDown | `after/09-frr-empty-panel-DEFECT.jpg` |
| Countdown | Real countdown with event list | `after/10-countdown.jpg` |
| Flight | Real Core flight HUD (altitude, velocity, q, Mach, ∆v per stage, phase strip, minigame banner) | `after/11`, `after/12` |
| Debrief | Fully populated (8,172 pts, grade A, objectives, crew, timeline), no dashes, **but fixture data, not the flown mission** (finding 2) | `after/13-debrief.jpg` |

No placeholder dashes on briefing, contract, Build Bay, countdown, flight or debrief; FRR is empty (finding 1). Host WebSocket closes
during the run: 0 (no "Reconnecting"). No host console errors matched `error|exception|reconnect`.

**Found during verification (not T055 code, reported for follow-up):**

1. **FRR is empty in a live room.** T027's README says so: FRR reads `MissionContext.Build`, and the Build Bay hook
   that sets it is not written yet ("A release build with a room has no build to review, so it logs an error").
   The host stays on FRR until PageDown.
2. **The debrief shows fixture data in a live room (T024).** Run 2's vehicle never reached orbit, yet its debrief is
   identical to run 1's: 8,172 pts, grade A, "Mission Accomplished", crew Amal/Diego/Mai instead of the room's
   Ada/Yuri/Sally (`after/16-run2-debrief-same-as-run1-after-failed-orbit-DEFECT.jpg`). The screen is populated,
   with no dashes, but it does not reflect the mission that was flown.
3. In run 1 the script's stall rule pressed PageDown in flight at T+02:28 (fairing jettison), so that debrief
   followed a skipped flight. See section 4 for run 2.

## 4. Run 2 (flight allowed to finish, Gzip build)

Same flow, with no stall skip in flight. FRR was empty again (skipped after 90 s). The flight played on its own
from T+00:00 to the end of the Core simulation: phase strip F1–F8 complete, HUD phase label "Debrief" at T+08:13.
This contract and vehicle did not reach orbit (apoapsis 2 km, periapsis below surface, propellant 0 %; the
autopilot crew picked options more or less at random). **The host then stayed on the Flight screen and did not
advance to the Debrief phase by itself** (`after/14-run2-flight-ended-host-stays-on-flight-DEFECT.jpg`); see
the follow-ups. `after/15-run2-flight-start.jpg` is the lift-off frame.

## 5. Brotli build through flight and debrief

Fresh server on :10003, three phones, Build Bay skipped with PageDown after three votes (so the vehicle is
incomplete), FRR skipped after 60 s, flight skipped after 120 s. Brotli files loaded and rendered every screen:
countdown, flight HUD with live Core data (T+01:00, Max Q, ∆v per stage), debrief
(`after-brotli/05-countdown.jpg`, `06-flight-maxq.jpg`, `07-debrief.jpg`, `playthrough-brotli-flight.log`).
0 host socket closes.

## Out-of-lane changes (call-outs)

- `unity/MissionForge/Assets/MissionForge/UI/MissionForgePanelSettings.asset`: `textSettings` reference (one line).
- `unity/MissionForge/Assets/MissionForge/Editor/Build.cs`: Gzip → Brotli (one line plus the class comment).
- `unity/MissionForge/THIRD_PARTY.md`: font row wording.
- `docs/play/host/` contains T027 output (`StreamingAssets/data/strings/en.host_preflight.json`, the briefing
  video, `index.json` entries). Merge PR #231 (T027) before or with this PR so sources and build agree.

## Follow-ups (not done here, outside T055's owned paths)

1. Docs still say Gzip: `HOSTING.md` (lines 19, 92, 119), `RELEASE.md` (Gzip checks and the size line at 128),
   the `staticSite.ts` comment at line 39. A static host configured with `Content-Encoding: gzip` for
   `.unityweb` (Netlify `_headers` snippet in RELEASE.md) would now break; send no Content-Encoding, or `br`.
2. Optional: have `staticSite.ts` send `Content-Encoding: br` for Brotli `.unityweb` files over HTTPS so the
   browser decodes natively (gets the 2–3 s back), and drop the per-process gzip cache or key it by mtime.
3. FRR empty in a live room: T027/T015 integration hook (`MissionContext.Build` before `GoToPhase(Frr)`).
4. Flight end does not advance the host to Debrief in a live room (T016 flow).
5. Debrief uses fixture results and crew in a live room instead of the flown mission; timeline labels overlap ("Booster|sep") and the
   Difficulty row is clipped (T024).
6. Arabic and Hindi host text was not re-checked with the new `PanelTextSettings` (null line-breaking rule
   assets, as in the UI Toolkit default it was copied from).
