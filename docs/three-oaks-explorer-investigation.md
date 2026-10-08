# 3 Oaks dynamic explorer adaptation

Status: provider primitives and dynamic BFS adapter implemented. See three-oaks-explorer.md for usage and verification limits.

The existing generic BFS engine selects observed controls, replays menu paths in isolated demo sessions, and records unresolved controls as pending. Preserve that selection mechanism. HAR action names validate execution; they must not become a static click inventory.

## Proven integration gaps

- integrations/hardfire/session.js selects only Pragmatic demo frames and requires XT, Vars and globalRuntime.
- providers/pragmatic/drawn-buttons.js scans Pragmatic sceneRoots and Unity-style components. It cannot scan the 3 Oaks display tree.
- integrations/hardfire/state-explorer.js uses Pragmatic operation completion, balances, spin handlers and purchase menus.
- Three current user HARs contain no JavaScript resources. Existing locally captured 3 Oaks client and shared runner sources supply complementary UI evidence.

## Source evidence and required primitives

The inspected client exposes window.app with stage, renderer, canvas and board. Inspect the currently running display tree, including the shared GameRunner UI, rather than naming game titles. Candidate controls must be visible, enabled, attached to the current stage, have observed event handlers and a verified hit area. Unknown controls remain candidates. Missing roots, clipping, disabled controls and ambiguous overlaps remain explicit pending evidence.

Shared runner controls and client controls both exist. The shared runner exposes window.GR and UI view/model. Its standard controls must be identified from verified runtime ownership, not loose label matching. Preserve shop, buy_feature and ante_bet controls, menus and option confirmations.

Inspected client opening handler _onBuyFeatureButton calls buyFeaturePopup.show(). Opening that menu is a UI transition, not a purchase. Popup onButtonComplete calls board.buyFeature.actBuyFeature and closes the popup. actBuyFeature dispatches BUY_SPIN; in the inspected scatter family it serializes buy_spin_scatters_count = selected option + 3. Other captured games serialize selected_mode. Do not reuse either transformation across games without source/runtime evidence.

The inspected client uses board.anteBetButton.isActive and model.getAnteBetCoef() to serialize ante_bet. A toggle without a request is only a UI transition. Validate it with one observed normal demo spin after the menu closes and the base state is ready. An ante_bet value of zero inside a purchase is not an antebet execution.

## Wire validation from user HARs

- Natural feature: spin -> bonus_init -> respin -> bonus_spins_stop. Natural bonus entry is not a purchase.
- Selector purchases: buy_spin with selected_mode values 3, 1, 2, 0; advertised available_buy_bonus contains 1, 2, 3, 4. UI-to-wire mapping is not proved by the wire trace alone.
- Scatter purchases: buy_spin_scatters_count values 6, 5, 4; antebet spins carry ante_bet=1.25. Purchase initialization and round completion are separate milestones.
- Accept a completed command only with successful HTTP status, status.code=OK, matching context.last_action and matching echoed context.last_args for supplied parameters. Preserve missing echoes as unverified rather than manufacture success.
- Follow context.actions to understand permitted continuations, but choose interaction from observed controls. Finish only on a verified base state: context.current=spins, round_finished=true and spin advertised.
- Keep unknown actions and UI bindings pending. No inventory field is not proof of no purchases. No network request after opening a popup is not failure by itself.

## Implementation and verification checklist

1. Implemented: provider-aware demo/frame selection with isolated owned tab cleanup and HAR preservation.
2. Implemented: read-only 3 Oaks display-tree discovery and conservative standard-control filtering; support both client canvas and GameRunner UI.
3. Implemented: connected those primitives to the existing BFS adapter, preserving fresh hit testing and dynamic menu discovery.
4. Implemented: 3 Oaks request/response operation validation, continuation completion and antebet probe validation.
5. Implemented: synthetic runtime tests for visibility, disabled controls, nested menus, unknown controls, overlapping hit areas and stable replay identities; replay sanitized real wire captures for purchases, natural bonuses, failures and completion.
6. Verified bounded Lady Fortune DEMO exploration: antebet=1.25 and two buy_spin options (scatters_count 4 and 5), each with successful acknowledgment and return to base. The run ended at its action limit; this does not certify exhaustive coverage. A bounded 777 Fruity Coins run also completed buy_spin selected_mode=0 and its continuations back to base. It ended PARTIAL with one QUIET_TIMEOUT and remaining routes at the seven-action limit; its HAR was saved and its owned tab closed.

No game-title exceptions or fixed purchase inventories are authorized or needed.