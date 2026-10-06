# Visible controls follow-up implementation plan

> For agentic workers: use superpowers:executing-plans to execute these steps with regression tests.

**Goal:** Continue from the published recovery audit and fix observed controls that are visible in DEMO screenshots but absent from navigation/decision discovery.

**Architecture:** Preserve the existing observe-click-follow-branch loop and its isolated-session retry queues. Investigate the runtime scanner/filter/decision boundary before changing it; do not add a second browser stack or claim exhaustive coverage from an empty queue.

**Tech Stack:** JavaScript, Node 22/24, Electron/HardFire and GitHub Actions.

**Spec:** `docs/objective-and-recovery-2026-10-06.md`.

## Global constraints

Only official DEMOs. At most two concurrent live jobs and one loaded game per CI host. Save HAR before closing/restarting. Never duplicate an uncertain input in the same session. Classification of purchase/ante/spin is not a prerequisite for exploration. Keep main unchanged and PR #1 in draft until coverage is demonstrated.

## Review focus

Visible accept/cancel controls missing from scanner; disabled or occluded controls; repeated decision layouts with delayed responses; transient readiness during replay; false success when the graph omits visible alternatives.

## Task 1 — Reproduce the detection gap

- [ ] Inspect latest source and preserved evidence for Big Bass/Hundreds and Dragon.
- [ ] Trace `providers/pragmatic/drawn-buttons.js`, `known-controls.js`, `operation-completion.js` and the HardFire adapter against the actual runtime observations.
- [ ] Add failing tests at the responsible boundary, without changing the existing safety rules.

## Task 2 — Fix the proven boundary

- [ ] Apply the smallest scanner/filter/decision correction supported by the reproduction.
- [ ] Run focused tests and the full `npm test` suite; record failures and successes.
- [ ] Verify stale observations, disabled controls, protocol uncertainty and one-click serialization remain protected.

## Task 3 — Evaluate real coverage

- [ ] Publish tested code to the existing PR and run a targeted official DEMO in Actions, no more than two jobs at once.
- [ ] Inspect structured routes, requests/responses and screenshots, not only workflow status.
- [ ] Update the objective/audit documentation with before/after observations, timing, remaining blockers and exact validation limits.
