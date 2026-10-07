# Autonomous Continuity Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, task by task.

**Goal:** Continue a bounded DEMO campaign without losing its pending BFS work.
**Architecture:** Serializable scheduler state, then a cleanup-gated supervisor
around the existing HardFire adapter. Private atomic checkpoints; cumulative caps.
**Tech Stack:** Node 22+, node:test, existing HardFire adapter; no new dependency.
**Spec:** docs/superpowers/specs/2026-10-06-autonomous-continuity.md

## Global Constraints
Only official DEMOs; two jobs/four game tabs; 20 minutes/game maximum; unchanged
4-second input stability and 4x requested animation; main untouched, draft PR.

## Review Focus
Interrupted input never becomes a successful edge; new tasks precede retries;
limits cannot reset on resume; cleanup/write failure prevents new input;
private resume data never appears in public artifacts.

### Task 1: Serializable scheduler
Files: providers/pragmatic/state-explorer.js, test/explorer-resume.test.js.
Interface: exploreStates options resumeState and sliceAttempts; progress/result
include resumeState version fuzzer/explorer-resume/v1.
- [x] Write tests for FIFO continuation, retry exhaustion, deadline interruption,
  mismatched/corrupt state and failed persistence. Run RED.
- [x] Implement checkpoint validation and cooperative yielding. Run GREEN + suite.

### Task 2: Campaign supervisor and adapter integration
Files: lib/explorer-campaign.js, integrations/hardfire/state-explorer.js,
  test/explorer-campaign.test.js.
Interface: runExplorerCampaign(execute, options), execute receives resumeState,
remaining timeout, sliceAttempts and onProgress. Atomic private journal.
- [x] Test automatic continuation, global time/actions, no-progress guard,
  cleanup/write errors, clean disk restart and dirty-disk refusal. Run RED.
- [x] Implement supervisor and keep cumulative HAR/branch evidence. Run suite.

### Task 3: CI and evidence
Files: .github/workflows/pragmatic-new5.yml, scripts/ci/export-live-evidence.mjs,
  relevant tests, HANDOFF.md.
- [x] Test private-state omission and 20-minute campaign configuration. Run RED.
- [x] Wire runner/summary, document boundaries. Run full tests and diff check.
- [ ] Publish on existing branch with a fresh expected SHA; check Actions.

## Execution record
Ruling: use a dedicated campaign adapter fixture rather than growing the existing
scenario runner. Preserve the old handoff verbatim as a historical document and
replace its entrypoint with the current summary. No production behavior is lost.
Ruling: retained HARs require content-verified source deduplication in the exporter;
added a RED-to-GREEN regression before the correction. Identical payloads are not
proof of a duplicate exchange.
Final review: self-review (no subagent tool). No merge or main mutation.
