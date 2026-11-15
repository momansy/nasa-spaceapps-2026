# T048 — Release-candidate smoke test of the hosted (Render) build, run locally

**Worker:** a QA worker with Node 20+ and Playwright (`momansy-claude`) · **Owns:** `orchestration/evidence/T048/` only (plus fixes to `tools/e2e/` if the harness itself needs a flag for a hosted origin, called out separately)

The judges will use one public link served by `render.yaml` → `npm --prefix server run start:hosted`
(`server/src/hosted.ts`, `server/src/hosting/staticSite.ts`; read `HOSTING.md`). The owner has not
deployed it yet, so the first real run will be on judging day. Run the exact hosted process on your
machine now and find anything that would break it. Do not change code outside `tools/e2e/`; report defects.

## Steps, in order

1. Fresh clone or worktree of current `main`. Reproduce Render's build from `render.yaml` exactly
   (same build and start commands, `PORT=10000`, `NODE_ENV=production`, set
   `RENDER_EXTERNAL_URL=http://localhost:10000`). Record the build time and any warnings.
2. HTTP checks with `curl -sI` (record status, `Content-Type`, `Content-Encoding`, cache headers):
   `/healthz`, `/`, `/play/`, `/play/judges.html`, `/play/credits.html`, `/play/client/`,
   `/play/host/`, every file in `/play/host/Build/` (the `.unityweb` files must be served with
   `Content-Encoding: gzip` and the right type), an unknown path (expect 404, not a crash), and a
   path-traversal attempt such as `/play/..%2f..%2fserver/package.json` (expect 400/404, never a file outside `docs/`).
3. Browser path a judge takes, on `http://localhost:10000/play/`: open the entry page → **Host a
   mission** (Unity WebGL host loads, creates a room, the banner says CONNECTED, the QR/join link
   points at `<RENDER_EXTERNAL_URL>/play/client/?room=CODE`) → join from 3 phone-sized Playwright
   contexts using only that link (no `?server=`) → play the C1 session to the debrief. Screenshot each
   step. If the Unity host cannot run headless, run it headed and say so.
4. Run the `tools/e2e` C1 session with 6 phones and 5 spectators against the hosted origin
   (`ws://localhost:10000/ws`); record round-trip times and errors, and compare with T036.
5. Restart behaviour (Render restarts free instances at any time): kill and restart the hosted
   process mid-lobby; record whether host and phones reconnect and resume the room without anyone
   reloading, and how long it takes.
6. Write `orchestration/evidence/T048/RESULTS.md` (every check pass/fail with the evidence) and
   `DEFECTS.md` (numbered D-110 upward: severity, exact repro, expected vs actual, suspected file).
   Put a one-line verdict at the top: "safe to deploy" or "blocked by D-1xx".

## Acceptance

All checks in steps 2–5 recorded with evidence; the judge path from step 3 reaches the debrief or
each failure has a numbered defect with a repro; verdict line present.
