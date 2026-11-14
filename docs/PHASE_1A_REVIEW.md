# Phase 1A tutor interface review

The immersive stage presents the existing guided activities. English and French guidance start visible. The captions control toggles the spoken English text and the help control opens a separate French explanation. Explicit pause stops playback and releases media while keeping the current draft and support settings in memory. Thinking time produces no timeout or learning outcome. The camera starts off, and refusal or loss of access leaves the same lesson available.

## Figma comparison

| Reference | Implemented in Phase 1A |
| --- | --- |
| [Conversation and listening](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-72) | Full tutor stage, dark scrim, inset self-view, bilingual instructional overlay, replay at two speeds and bottom controls. The app says « Séance guidée » and labels the photo « Portrait d’illustration ». |
| [Free response](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-114) | The original written response and optional browser recognition remain available. The Micro control opens the browser recognition consent panel in speaking activities. There is no automatic listening or turn detection. |
| [French help](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-154) and [repair](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-194) | The pale help overlay keeps the current activity and answer. Existing choices, retries and skips use the original deterministic controller. The simulated repair branch and sample choices belong to a later phase. |

The portrait is a cropped WebP from Ono Kosuki’s stock photograph, used as illustration under the Pexels license. The image carries no claim that the subject is the tutor or endorses the app. The off-camera silhouette uses the two project Figma assets from component `6:28`. [Photo](https://www.pexels.com/photo/smiling-middle-aged-black-man-working-remotely-on-netbook-in-cafe-5648376/) · [Pexels license](https://www.pexels.com/license/) · [Figma self-view](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-28)

## Baseline established before editing application code

Baseline application and lockfile SHA `d712f129a9aeb015ba46bbb2ddbc6c029b307bf5`. Fresh checkout on macOS 15.7.3 (Darwin x64), Node `24.22.3`, npm `11.19.1`. The official Node archive matched the published SHA-256. `npm ci --include=optional` installed 387 packages with zero audit findings and selected x64 Rolldown `1.2.19` and x64 Next SWC `16.4.6`. The lockfile was unchanged. This resolved the previous reused arm64 dependency mismatch. Both configured loopback servers started.

| Check | Local baseline | Fresh Ubuntu CI baseline |
| --- | --- | --- |
| Lint, TypeScript, unit tests | Passed, 20/20 unit tests | `npm run check` passed |
| Next production build | Passed | `npm run check` passed |
| Production Playwright | 7 browser launches blocked by macOS Mach port sandbox permissions | Passed, 7/7 |
| GitHub Pages export | Passed | Passed |
| Pages Playwright | 1 browser launch blocked by the same sandbox restriction | Passed, 1/1 |

The fresh Ubuntu run was completed before application edits on a branch that added two CI commands and kept the app, committed lockfile and tests byte-identical to the baseline. This resolved the browser execution blocker without disabling or filtering tests. The CI job runs the Pages export and its browser suite without deploying. [Fresh baseline job](https://github.com/mahoutin/language/actions/runs/43550702182)

To reproduce, select Node 24 from `.nvmrc`, use a clean checkout with available loopback and install the lockfile and matching Chromium revision. On Linux, use `npx playwright install --with-deps chromium`.

```sh
npm ci --include=optional
npx playwright install chromium
npm run check
npm run test:e2e
npm run build:pages
npm run test:pages
```

Run the server suite before the Pages build because both modes use `.next`. Check results and the `tutor-review-screenshots` artifact are available from the PR’s Checks workflow. Screenshots cover 1440 × 900, 1280 × 720, French help and explicit pause with the camera off.

## Review limits

Actual laptop camera, browser speech quality and screen-reader output still need product review. Asset framing differs from the Figma reference portrait. The stage retains the original curriculum, persistence and assessment rules. Adaptive support fading, staged conversation simulation, avatar rendering, AI integration and durable session work are outside Phase 1A.
