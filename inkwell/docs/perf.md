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

## Baseline — 2026-08-08, v0.6.0 (sandbox container, Chromium via CDP)

| Measurement | Target | Measured | Verdict |
| --- | --- | --- | --- |
| Signed-out cold start downloads Firebase bytes | 0 bytes | 0 bytes | **PASS (hard gate)** |
| Initial route JS, gzipped | < 350 KB | 448 KB | MISS — follow-up below |
| Cold start → interactive Projects, 4× CPU throttle | < 2.5 s | ~13.6 s | MISS — follow-up below |
| Editor open, big book, 4× CPU throttle | < 1.5 s | 1.2–1.6 s across runs | borderline — see note |
| Keystroke round-trip p95, 2k-word scene | < 33 ms | 11–41 ms across runs | borderline — see note |
| Almanac filter over 200 entries | < 100 ms | ~23 ms | MEET |
| Long tasks (>50 ms) sweeping the 60-card grid | 0 | 0 | MEET |

Related numbers already enforced elsewhere: `stress-check.mjs` holds the
193k-word book to cold-open < 5 s, scene switch < 1.5 s, per-key typing
budgets of 20–30 ms averaged over whole sentences, project-wide search
< 3 s, reader < 8 s, and heap < 400 MB — all un-throttled, all blocking.

## What was fixed to get here

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

- **Initial route JS 448 KB gz (target 350).** The dominant chunk is the
  catch-all `vendor` (826 KB raw / 249 KB gz). Follow-up: run a bundle
  analysis (rolldown output analyzer) against it and split or defer the
  heaviest members the Projects route doesn't need — candidates are the
  icon library's import surface and export-related dependencies that
  belong behind their feature routes. Do not split blind: measure first,
  the same rule §23 applies everywhere.
- **Cold start ~13.6 s at 4× throttle (target 2.5).** Dominated by parsing
  the same oversized boot payload, multiplied by 4× CPU throttle *on an
  already virtualised sandbox CPU* — the measurement environment is
  materially slower than the mid-range hardware the target was written
  for. The follow-up is the same chunk diet as above; re-measure after.
  (Un-throttled, the same boot reaches interactive in well under 2 s in
  every other harness in this repo.)
- **Keystroke p95 11–41 ms across runs (target 33).** The measurement
  drives real key events over the CDP protocol, so it includes protocol
  round-trip and sandbox scheduling noise; the spread across three
  identical runs (11, 26, 41) is wider than the number itself.
  `stress-check.mjs`'s per-key budgets on the 193k-word book (enforced,
  20–30 ms averaged over sentences) are the trustworthy signal here, and
  they pass. No code follow-up; treat p95 > 33 ms as a prompt to re-run
  before believing it.
- **Editor open 1.2–1.6 s across runs (target 1.5).** Same sandbox noise:
  three of four runs met the target, the fourth ran while the Firebase
  emulator suite occupied the same CPU. Advisory; re-measure quiet.
