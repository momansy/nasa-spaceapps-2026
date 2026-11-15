# T054 — Unity beauty-shot captures for the marketing trailer

**Worker:** a Unity worker (`cyrex04`) · **Owns:** `unity/MissionForge/Assets/MissionForge/Editor/TrailerCapture/` (create), `assets/media/trailer-captures/` (create), `orchestration/evidence/T054/`. Do not change scenes, screens or art assets; capture what is on main.

T053 (`momansy`) edits a fast-paced marketing trailer. Browser (WebGL) captures of the host look soft and
stutter; the trailer needs smooth, sharp in-engine shots. **Deadline: clips pushed and merged by 10:45 UTC**;
T053 cuts with whatever is on main then.

## Steps, in order

1. Open the project on main in the Unity Editor (Unity MCP if available). List the scenes and screens that
   look best today: Build Bay environment and engines (T034, T032/T033), the host UI revamp (T031/T035), the
   flight view (T016), the end screens (T024), the briefing cinematic. Screenshot each candidate.
2. Write an editor script (`TrailerCapture/`) that plays scripted camera moves with the Unity Recorder
   package (add it to the manifest only if it is not there; if it cannot be added, capture frames with
   `ScreenCapture.CaptureScreenshotAsTexture` at fixed timestep and encode with ffmpeg). Settings: 1920×1080,
   60 fps, highest quality URP settings the scene supports, motion blur on if available, no editor UI.
3. Record 8–12 clips of 3–6 s each, each a single clean move: slow push-in on the rocket in the Build Bay,
   orbit around an engine with PBR highlights, a part snapping onto the stack (if the build animation
   exists), the lobby with QR and crew avatars (fill seats with the existing simulated voters, no
   "Reconnecting" badge visible), a vote tally on the big screen, launch/ascent in the flight view, a
   stage separation or Max Q moment, orbit insertion over Earth, the debrief score reveal. Use only what
   the game really renders.
4. Encode each to H.264 MP4 (`-crf 18 -preset slow -pix_fmt yuv420p`, no audio), named
   `NN-short-description.mp4`, total under 80 MB; add `assets/media/trailer-captures/README.md` listing each
   clip (scene, what it shows, duration, how to re-record). Commit and open the PR as soon as the first
   five clips are good, then add the rest in the same branch.
5. Evidence: a contact sheet (one frame per clip) in `orchestration/evidence/T054/`; look at it: sharp,
   no debug overlays, no placeholder text, no error badges.

## Acceptance

At least 8 clean 1080p60 clips from the real game merged by 10:45 UTC, with a README and a contact sheet;
nothing in the game itself changed.
