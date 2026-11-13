# Foundation audit — 2026-11-13

Scope: the files found in `/Users/alejandromini/Desktop/language`, before migration. The Git repository had no commits; all supplied files were untracked. The original implementation is retained under `prototype/` for comparison, not served by Next.js.

## Existing implementation

A dependency-free, single-page PWA. `curriculum.js` defines five versioned introduction activities; `app.js` combines template rendering, navigation, assessment, storage and device access. Evidence is stored under `everyday-english-v1` in localStorage. Browser TTS and optional browser speech recognition are the only speech integrations. Camera is local preview only. No backend, authentication, AI calls or server persistence exists.

The strongest foundations are the explicit curriculum, separate evidence observations, low-confidence assessment labeling, French scaffolding, typed fallback, optional camera and export/delete controls. These are retained. No free-form chatbot replaces progression.

| Priority | Finding | Foundation response |
| --- | --- | --- |
| High | Saved JSON is merged without validating index, evidence, counters or completion. Bad records can crash lessons. Storage exceptions can abort actions. | Versioned runtime schema, original-record migration, bounded input, non-overwriting recovery and storage failure notices. |
| High | Service worker caches every same-origin successful GET, including hypothetical future private endpoints; activation deletes unrelated caches. | Explicit public-asset allowlist; no API, HTML, RSC or learner response cache. Delete only this app’s obsolete caches. |
| High | Camera permission can resolve after navigation and leave a live hidden stream; speech continues when navigating out of lessons. | Component lifecycle ownership, cancellation generation, track stop, speech abort, pagehide and visibility cleanup. |
| Medium | Full DOM replacement loses typed answers on help/toggle renders. | Controlled React state scoped to an activity; state survives help and toggle changes. |
| Medium | Word-count heuristic rejects “I’m Alex” while accepting “my name is”. | Require an introduction plus name-shaped text; retain low-confidence warning and regression tests. This still cannot distinguish “I am hungry” from a name or assess pronunciation. |
| Medium | Speech recognition may transmit audio without an explicit application notice/choice. | Per-exercise opt-in explaining browser-provider transmission, visible stop control and keyboard fallback. |
| Medium | Google Fonts import contacts a third party on page load. | System fonts; no remote font dependency. |
| Medium | Most controls are in English for a French-speaking beginner; mobile nav labels disappear. | French interface, preserved English lesson targets, explicit language markup, visible mobile labels and focus movement. |
| Medium | No automated verification, dependency/build foundation, or CI. | Strict TypeScript, Next App Router, ESLint, Vitest, production-build Playwright and CI. |
| Medium | No multi-tab coordination. | Stop writes on external storage changes and request reload; a server transaction model remains necessary for synchronization. |

## Limits of this audit

Code inspection and automated Chromium tests are not learner testing or a security penetration test. Real microphone recognition, speaker behavior, camera hardware, installation on the intended device, screen-reader behavior and learning effectiveness require manual checks. localStorage remains readable by same-origin code and other people using the same browser profile. It is not an encrypted learner vault or a multi-user store.

## Deliberate scope

This increment establishes a deployable application foundation and repeatable checks. It does **not** make a public deployment private: authentication and server authorization must be completed before exposing learner data or paid AI endpoints. No credentials, hosting, model, database or identity provider have been selected or provisioned.
