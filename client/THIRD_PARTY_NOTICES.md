# Third-party assets in the phone client

| Asset | Files | Licence | Source |
|---|---|---|---|
| Oxanium (display face, weight 700) | `src/assets/fonts/oxanium-700.woff` | SIL Open Font License 1.1, full text in `src/assets/fonts/Oxanium-OFL.txt` | Copied from `unity/MissionForge/Assets/MissionForge/UI/Fonts/oxanium-700.ttf` (the host UI's copy) |
| IBM Plex Sans 400 and 600 | `src/assets/fonts/plex-sans-400.woff`, `plex-sans-600.woff` | SIL Open Font License 1.1, full text in `src/assets/fonts/IBMPlex-OFL.txt` ("Plex" is a Reserved Font Name; the files keep their original family name and are only subset and re-wrapped, which the OFL permits for unmodified glyph data) | From `unity/.../UI/Fonts/ibm-plex-sans-*.ttf` |
| IBM Plex Mono 600 (room codes only) | `src/assets/fonts/plex-mono-600.woff` | SIL Open Font License 1.1, `src/assets/fonts/IBMPlex-OFL.txt` | From `unity/.../UI/Fonts/IBMPlexMono-SemiBold.ttf` |

Font processing (2026-11-14): `python -m fontTools.subset <ttf> --flavor=woff --layout-features='*'`
with a Latin + punctuation + arrows + Greek letter range (Plex Mono: printable ASCII only). WOFF
(zlib) rather than WOFF2 because the Brotli encoder is not installed on the build machine; the
four files total about 78 kB, inside the 120 kB budget of `orchestration/VISUAL_TARGET.md`.

Backdrop images `src/assets/art/bg-*.webp` are derived from the project's own approved
reference frames (`assets/media/style/frames/*.png`, `assets/media/key-art/*.png`; provenance in
`assets/media/CREDITS.md`): cropped, scaled, composited over a navy sky gradient with procedural
stars and saved as WebP (18–40 kB each). `twinkle.webp` is procedural.

Icons (`src/ui/Icon.tsx`) are the client's own inline SVG paths on a 24 px grid with a 2 px
round stroke.
