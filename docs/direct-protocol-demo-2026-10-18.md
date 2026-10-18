# Pragmatic direct DEMO protocol — 2026-10-18

## Scope

This isolated experiment branches from `feat/batch-purchase-600-20261017`; `main` is unchanged.
The HAR provided by the user captures Big Bass Vegas 1000 (`vs10bbveg1000`),
with `doInit`, `doSpin` and `doCollect`, but **no recorded purchase**.

HAR evidence:
- `purInit=[{bet:1000,type:"default"},{bet:4500,type:"default"}]`
- `purInit_e=1,1` — two advertised, enabled options.
- `doInit` request index=1/counter=1, response index=1/counter=2/na=s.
- `doSpin` request index=2/counter=3/c=0.2/l=10/bl=0/sInfo=n, response index=2/counter=4/na=c.
- `doCollect` request index=3/counter=5, response index=3/counter=6/na=s.

The form `doSpin` + `pur=0` or `pur=1` is inferred from the game's
client code, **not** observed as a successful purchase in this HAR.
An HTTP 200 is not evidence that a bonus has finished.

## Implementation

`providers/pragmatic/protocol-direct.js` consumes a **live** official
`doInit` request/response, reads enabled `purInit` entries, builds one
`doSpin` with the chosen `pur`, then optionally sends a `doCollect`
only if the server reports `na=c`. It never guesses `doBonus` fields.
Every action uses counters from its immediately previous response.
There is no saved HAR session replay or automatic retry.

`scripts/pragmatic-direct-protocol-smoke.mjs` runs at most two separate
fresh DEMO contexts (one tab each) in one Chromium process. The official
catalogue consent and Play Demo controls are the only initial clicks.
After `doInit`, the two purchase requests are submitted using same-origin
`fetch` inside each game's iframe, with **no canvas/button navigation**.

Logs contain safe action names, counters, outcome and timings, never the
live `mgckey` or unfiltered response. A response is classified as
`RESPONSE_RECEIVED_BONUS_NOT_VERIFIED`, not a completed purchased feature.

## CI

Workflow: `.github/workflows/pragmatic-direct-protocol-demo.yml`.
- Full Node test suite, including sanitized HAR-derived protocol cases.
- Playwright + Chromium on GitHub-hosted Ubuntu.
- Independent `pur=0` and `pur=1` against the official Big Bass Vegas 1000 DEMO.
- Artifacts: `summary.json`, `pur-0.json`, `pur-1.json`.
- Fails if either branch does not obtain a valid gameService response.

## Limitations

A server acknowledgement may be a declined purchase. Full confirmation
requires examining the returned protocol fields and completing any free spins,
selection or bonus lifecycle. The observed `na=c` to `doCollect` transition
is implemented; other `na` codes are not yet mapped and remain explicit
unverified states. A game may also depend on client lifecycle side effects,
in which case the smoke reports a failure rather than emulating nonexistent UI.
