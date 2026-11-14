# T028 environment

Captured 2026-11-14 before the playtest matrix.

| Item | Value |
|---|---|
| OS | Microsoft Windows 11 Home 10.0.26300, 64-bit |
| Machine | ASUS Zenbook S 16 UM5606WA |
| CPU | AMD Ryzen AI 9 HX 370, 12 cores / 24 logical processors |
| Memory | 33,413,771,264 bytes |
| Node | v24.16.0 |
| npm | 11.13.0 |
| Playwright | 1.65.1 |
| Browser | Playwright Chromium installed by `npx playwright install chromium` |
| Git commit | `49dd89c515bd87faaa4f0c68fc3c567125ced26f` |

Preflight verification:

- `server`: `npm ci`, 16 test files / 236 tests passed, `npm run build` passed.
- `client`: `npm ci`, 12 test files / 165 tests passed, `npm run build` passed.
- Harness: `npm ci` completed with zero reported vulnerabilities.

Only Windows was executed. The harness uses cross-platform Node file/process/network APIs and the
README command is intended for macOS, but macOS was not verified in this task.
