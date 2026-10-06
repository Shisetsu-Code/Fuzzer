# Five new DEMOs on GitHub Actions: implementation plan

> **For agentic workers:** Use subagent-driven development for the independent host and evidence exporter; verify the combined workflow before starting live jobs.

**Goal:** Run the current Fuzzer against five official Pragmatic DEMOs that do not appear in the available prior-test records, through GitHub Actions, and preserve verifiable results.

**Architecture:** A small Electron host supplies the tab facade required by Fuzzer while reusing the public HardFire controller, recorder, network tap and runtime controller. Each matrix job owns one isolated game tab and runs the existing state explorer. An independent exporter produces sanitized protocol evidence and a bounded set of JPEG captures.

**Tech stack:** Node 24, Electron 44.4.0, Ubuntu/Xvfb, HardFire commit `adf6de5ec14e394f77fb1816d5f46e5deb250b0a`, existing Fuzzer engine and parsers.

**Spec:** User request: “pruebalo con 5 juegos que no hayamos probado antes con github actions”; repository constraints in `AGENTS.md`; existing result contract in `integrations/hardfire/state-explorer.js`.

## Global constraints

- Only official public DEMO launchers, without real-money accounts or copied session credentials.
- At most two concurrent jobs; one owned isolated game tab per CI job.
- Save each tab's HAR before closing it and before creating its replacement.
- Start recording before navigation; use the existing explorer's observed controls.
- Budget: 100 actions, depth 8, 20 minutes per game; report unfinished paths explicitly.
- Never equate HTTP 200, a green workflow, or `EXHAUSTED_OBSERVED_CONTROLS` with complete game coverage.
- Publish complete structured results, sanitized protocol HAR and selected JPEG65 captures. Keep artifacts small with one-day retention.
- Keep the source commit and dependency versions with the execution evidence.
- No merge to main. An explicit head-commit marker triggers live runs; documentation-only commits must not replay all games.

## Review focus

- Startup failure must retain its screenshot/error evidence and cannot count as an executed game.
- Cleanup failures must retain ownership and cannot permit another live tab.
- HAR body references must resolve against the original entry list before filtering.
- Credentials in nested protocol fields must not reach logs or uploaded artifacts.
- Protocol or export truncation must remain visible as missing evidence, never a silent success.

## Task 1: Selection and workflow

**Files:** `docs/evidence/pragmatic-actions-new5-2026-10-05-manifest.json`, `.github/workflows/pragmatic-new5.yml`.

**Interface:** The manifest exposes `games: [{id,title,url,...}]`. Workflow validates exactly five distinct official catalog URLs, runs all or one selected id, and supplies the game id, source SHA, artifact directories and budgets through environment variables.

- [x] Compare titles, slugs and symbols against repository records, Snapshot records and available previous conversation context.
- [x] Record candidate sources and the limit of the novelty claim.
- [x] Verify workflow syntax, immutable action/dependency pins, same-repository execution and maximum concurrency.
- [x] Verify an ordinary commit skips live exploration and an explicit request selects the requested games.

## Task 2: HardFire host and live runner

**Files:** `scripts/ci/hardfire-host.mjs`, `scripts/ci/run-live-demo.mjs`.

**Interface:** Read `HARDFIRE_ROOT`, `FUZZER_GAME_ID`, `FUZZER_MANIFEST`, `FUZZER_ARTIFACT_DIR`, `FUZZER_OUTPUT_DIR`, `FUZZER_MAX_ACTIONS`, `FUZZER_MAX_DEPTH`, `FUZZER_TIMEOUT_MS`. Supply `tabs.new/resolve/activate/close` and `withTab` to `runStateExplorer`.

- [x] Reuse the pinned HardFire implementation, with a visible 1280×720 WebContentsView in Xvfb and an ephemeral partition per owned tab.
- [x] Preserve scoped targeting, save-before-close order and failures during cleanup.
- [x] Record actual runtime speed, versions, progress and final result/error.
- [x] Invoke the exporter after cleanup and print its sanitized summary to the Actions log.
- [x] Verify syntax and the actual startup in Actions; diagnose any infrastructure failure from captured evidence.

## Task 3: Evidence exporter

**Files:** `scripts/ci/export-live-evidence.mjs`, `test/live-evidence.test.js`.

**Interface:** `exportLiveEvidence({game,result,error,artifactDir,outputDir,limits,...})` writes `result.json`, `summary.json`, `manifest.json`, `protocol.har.gz`, and selected referenced screenshots.

- [x] Add meaningful tests for original-index HAR body references, nested secret removal, startup failures and out-of-directory image references.
- [x] Implement complete result preservation and a protocol-only HAR rebuilt from allowed fields.
- [x] Preserve purchases, verification, modifiers, choices, pending reasons and export omissions as distinct evidence.
- [x] Apply explicit size budgets without silently truncating result arrays.
- [x] Run targeted tests and the existing regression suite.

## Task 4: Real validation and report

- [x] Review the combined host, exporter and workflow.
- [ ] Publish the exact tested files to the existing draft PR with `[live-demo:all]` in the commit message.
- [ ] Observe the five Actions jobs, recover artifacts and inspect per-game protocol/screenshots.
- [ ] Fix concrete infrastructure or engine defects only when evidence identifies the cause; rerun only affected cases when needed.
- [ ] Save a report with each game's actual status, elapsed time, observed/verified actions and unresolved coverage.
