# INKWELL performance ledger

The numbers, measured the same way every time, so a regression is a diff
rather than a feeling. Re-measure with:

```sh
cd inkwell
INKWELL_BASE_PATH=/ npm run build
(cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
node scripts/perf-baseline.mjs     # §23 fixture: 150k words, 200 entries, 60 cards
node scripts/stress-check.mjs      # the 193k-word torture test with enforced budgets
```

`perf-baseline.mjs` seeds the §23 "big book" fixture (150k words across 75
scenes, 200 Almanac entries, 60 character cards) and reports against the
targets below. One check is a hard gate — the Firebase one — because it is
a §23 acceptance box; the timings are advisory so a slow CI box can't turn
a healthy build red. This file is the record the misses are documented in.

## Baseline — 2026-08-09, v0.8.1 (sandbox container, Chromium via CDP)

| Measurement | Target | Measured | Verdict |
| --- | --- | --- | --- |
| Signed-out cold start downloads Firebase bytes | 0 bytes | 0 bytes | **PASS (hard gate)** |
| Initial route JS, gzipped | < 350 KB | 282 KB | MEET |
| Cold start → interactive Projects, 4× CPU throttle | < 2.5 s | ~0.9–1.3 s | MEET |
| Editor open, big book, 4× CPU throttle | < 1.5 s | ~1.2 s | MEET |
| Keystroke round-trip p95, 2k-word scene | < 33 ms | 11–15 ms | MEET |
| Almanac filter over 200 entries | < 100 ms | ~23 ms | MEET |
| Long tasks (>50 ms) sweeping the 60-card grid | 0 | 0 | MEET |

Related numbers already enforced elsewhere: `stress-check.mjs` holds the
193k-word book to cold-open < 5 s, scene switch < 1.5 s, per-key typing
budgets of 20–30 ms averaged over whole sentences, project-wide search
< 3 s, reader < 8 s, and heap < 400 MB — all un-throttled, all blocking.

## What was fixed to get here

- **The export machinery left the boot path.** Sourcemap attribution showed
  the catch-all `vendor` chunk carrying `docx` (1.06 MB of source), `jszip`
  and `re2js` — dependencies only the export dialog uses. The dialog now
  imports the builders dynamically, and the chunking config names them into
  `vendor-export` (170 KB gz) so the catch-all can't swallow them back.
  Boot graph: 424 KB → 260 KB gz; measured boot requests 282 KB against the
  350 KB target. The 193k-word EPUB/DOCX stress exports still pass through
  the dynamic path.
- **Google Fonts no longer holds first paint hostage.** The fonts
  stylesheet was render-blocking, so any visitor whose network could not
  reach Google promptly stared at a white page for the connection timeout
  — measured at 13 seconds flat. The link is now async
  (`media="print"` + onload promotion, `<noscript>` fallback): text
  renders immediately in fallback faces and swaps when the fonts land.
  This single change was the entire "cold start 13.6 s" miss in the
  previous baseline. Measurements now use `domcontentloaded`, because the
  `load` event still waits out the font fetch on blocked networks while
  the page sits fully painted and interactive.
- **Firebase is no longer in the boot path.** The SDK (563 KB raw, 162 KB
  gzipped) used to load for every visitor because the sync engine and auth
  store imported it statically and the database layer imports both at boot.
  The engine now loads `firebase/firestore` inside `start()` — unreachable
  until someone signs in — and the auth store loads `firebase/auth` behind
  a remembered-session flag (`inkwell-had-cloud-session` in localStorage)
  or an actual press of a sign-in button. UI code that only needs to know
  *whether* cloud accounts exist imports `@/lib/firebase/cloud-flags`,
  which is env-vars-only. Verified by `perf-baseline.mjs` (network log)
  and `sync-check.mjs` (full two-device flow still green).

## Documented misses and their follow-ups

None. Every §23 target currently meets; this section exists for the next one.
  every other harness in this repo.)
