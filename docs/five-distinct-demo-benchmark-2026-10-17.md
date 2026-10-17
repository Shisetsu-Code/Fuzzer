# Five distinct Pragmatic demos — GitHub worker validation (2026-10-17)

The benchmark used one shared Chromium process, **two isolated contexts at a time**, and five real official public DEMO URLs **different from the previous four**. It was a read-only inventory scan except for two individually selected intro closes based on screenshots. No purchases, bonuses, spins or casino accounts were involved in this five-game test.

## Five-game baseline

Run: https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39059395502

| Game | Context time | Raw / retained controls | State reported |
| --- | ---: | ---: | --- |
| 5 Lions Reborn | 13.10 s | 7 / 1 | INTRO |
| Big Bass Amazon Xtreme | 9.94 s | 12 / 1 | BASE_CONTROLS |
| Helios Triple Sun | 16.62 s | 13 / 2 | BASE_CONTROLS |
| Gates of Olympus 2500 | 14.09 s | 13 / 2 | BASE_CONTROLS |
| Jungle Gorilla | 7.58 s | 7 / 1 | INTRO |

**5/5 demo runtimes detected**, zero fatal navigation failures; total worker elapsed **34.50 s** and Chromium launch **292 ms**. Three of the initial screenshots still contained **loading splashes** even while the runtime reported BASE_CONTROLS. Thus **5/5 is runtime detection, not interactive visual readiness**.

## Deliberate intro clicks based on captured screens

Second run: https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39059644042

- 5 Lions Reborn: a unique control with `Evt_DataToCode_IntroClosePressed` was clicked. Follow-up runtime reported stable BASE_CONTROLS and screenshot **visually confirmed the full base reels and Buy Free Spins / Buy Super Free Spins**. No purchase executed.
- Jungle Gorilla: a unique `Evt_DataToCode_IntroClosePressed` was clicked; screenshot showed base reels and normal Spin. The classifier nevertheless returned UNKNOWN, a **false negative**, because it required a BuyFeature or AnteBet control to define BASE_CONTROLS.

The code was corrected to classify a drawn ordinary-spin control as BASE_CONTROLS (while still giving INTRO priority), with a regression test.

Third run: https://github.com/Shisetsu-Code/Fuzzer/actions/runs/39059907606

- Jungle Gorilla: approved intro close clicked; stable BASE_CONTROLS recognized in **1.35 s**; follow-up screenshot showed playable base reels. This confirms the specific classifier fix in the real runtime.
- 5 Lions Reborn: its initial screenshot captured a loading splash, so its previously selected intro control was **not** present. Correct behavior: **no click**; the missing identity was not guessed/retried.
- Other three games: runtime observation/candidate filtering only; no game actions. Full batch elapsed **27.89 s**. This is not an apples-to-apples speedup over the baseline because game load and intro paths differed between runs.

## Important limitations

A stabilized runtime button list is *not* proof that the rendered canvas has cleared its loading overlay: the third-run 5 Lions splash demonstrates this. The candidate list retains `occlusion: NOT_VERIFIED` and the benchmark status `CONTROLS_EXTRACTED_VISUAL_UNVERIFIED`. Interactive decisions require screenshot review, not just accepting BASE_CONTROLS. The spin-only fallback corrects Jungle Gorilla's false negative but does not solve hidden or covered controls. No buy operations, completed bonuses, or 600-game coverage were tested here.

The full artifacts are attached to the GitHub Actions runs as `pragmatic-multi-game-benchmark` (per-game JSON and JPEG).
