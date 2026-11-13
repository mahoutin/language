# Milestone acceptance and testing checklist

## A — Local functional PWA proof of concept

- [x] Runs from localhost without third-party dependencies.
- [x] Five guided activities with ability to replay speech.
- [x] French explanation toggle.
- [x] Typing response fallback when speech recognition unavailable.
- [x] Optional camera start/stop with no remote video transmission.
- [x] Progress saved locally and resumable on the same device.
- [x] Export/clear learner record.
- [x] Manifest + service worker.
- [ ] Browser E2E tested on dad's actual laptop.
- [ ] Confirmed PWA installation across target browser/OS (PNG icons included; needs device testing).
- [ ] External usability test with your dad.

## B — AI tutor (not yet implemented)

- [ ] Secure auth and ephemeral voice session token endpoint.
- [ ] Live English/French realtime voice tutoring.
- [ ] Explicit tool/action boundary and bounded state transitions.
- [ ] Reconnect, interruption and timeout handling.
- [ ] Reliable logging that avoids personal media retention.

## C — Adaptive learning (not yet implemented)

- [ ] Persistent, versioned server-side learner memory.
- [ ] Transfer tasks and delayed reviews.
- [ ] Assessments calibrated on real samples, including ASR errors.
- [ ] Learner can correct wrong assumptions and delete history.

## D — Privacy-first vision (not yet implemented)

- [ ] Per-activity camera consent and clear processing notice.
- [ ] Explicit frame capture and learner confirmation.
- [ ] Purpose-limited vision calls; no emotion/attention profiling.
- [ ] Deletion and retention tests.

## E — Production readiness (not yet implemented)

- [ ] Screen reader, keyboard, contrast, large text and slower audio testing.
- [ ] Threat model, authorization testing and backup restoration.
- [ ] Browser/device/network testing and accessible failure states.
- [ ] Authenticated private HTTPS URL.
- [ ] Learner-validated comprehension and retention improvement.


## F — Next.js foundation migration (2026-11-13)

- [x] Next App Router, strict TypeScript, lockfile and CI.
- [x] All five original lesson activities retained.
- [x] Deterministic progression separate from UI/provider code.
- [x] Original progress migration and invalid-record protection.
- [x] Media cancellation and visible privacy choices.
- [x] French interface and labeled mobile navigation.
- [x] Public-only cache allowlist and honest offline fallback.
- [ ] Full lesson loading after an offline reload (deliberately deferred).
- [ ] Private authentication/server persistence (required before private hosted release).
- [ ] Real device media, installation and learner usability verification.

The original section A describes the archived prototype. Current behavior and release boundaries are documented in README.md and FOUNDATION.md.
