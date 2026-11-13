# Foundation decisions — 2026-11-13

## 1. Incremental migration, preserving teaching intent

Use Next.js App Router and strict TypeScript, with a client island for interactive practice. The route shell, metadata and manifest remain server-compatible. The entire original static implementation is archived under `prototype/`. The original content version and five activity IDs remain unchanged so existing evidence continues to refer to the same lessons.

The learner-facing interface is French; English phrases and answer options remain English. Typography uses local system fonts to remove unsolicited third-party requests. Preserve the calm green visual system, no streaks, no timer and no mastery claims from completion.

## 2. Curriculum controls progression

`src/domain/curriculum.ts` is versioned instructional content and a deliberately weak practice evaluator. `src/domain/learner.ts` owns legal answer, skip and restart transitions. Actions carry activity IDs: stale callbacks cannot advance a different activity. Invalid input adds no evidence. Incorrect answers retry, then scaffold. Skips are explicit unassessed evidence. Restart retains history.

A future model can generate constrained explanations or propose an evaluation; it must not write learner state directly. On the server, authenticate the learner, load the canonical session, check expected session revision and curriculum version, validate a bounded tool proposal, evaluate policy and commit an idempotent transaction. Browser state is untrusted. Reuse pure domain logic where appropriate, but never accept client-submitted correctness as authoritative server evidence.

Keep the eventual lesson plan structured: skill target, prerequisites, approved prompt variants, comprehension checks, assisted practice, novel transfer and delayed review. Adaptation selects among these bounded activities. A conversational interface is one delivery channel, not the curriculum engine.

## 3. Evidence first; durable memory is a later adapter

Zod validates external browser records. Schema version 2 is distinct from the content version. The original key is retained for migration. Invalid/unknown-version data stays untouched; the learner can download it, practice without persistence, or explicitly erase it. Storage denial/quota failure is visible. Cross-tab changes disable writes to reduce accidental overwrites; this is not transactional synchronization.

Only metadata is persisted: activity, skill, assisted flag, assessment source/reason, confidence and timestamp. A successful introduction is weak evidence, not mastery. The current schema caps history at the most recent 10,000 observations to bound local storage. The initial French translation is visible, so practice is conservatively marked assisted even if it is subsequently hidden. Separate assistance dimensions and retention/transfer evidence belong in the next assessment schema.

Next persistence increment: authenticated learner and session records in PostgreSQL; per-learner authorization on every read/write; versioned event IDs and idempotency keys; backup/restore verification; export/deletion across primary storage and a documented backup retention window. Personal conversational facts need explicit consent and learner correction/removal controls. Keep raw transcript/media storage disabled by default.

## 4. Media is lifecycle-scoped and optional

Camera stays off until a learner click. A request generation prevents a late permission grant from reviving a camera after navigation/cancellation. All tracks stop on activity changes, navigation, hidden tabs and pagehide. Speech recognition is per-exercise opt-in with visible stop and typing fallback; callbacks are detached before abort. TTS is canceled on navigation/advance and page hiding.

The application does not send media. Browser speech services may do so, hence the notice and opt-in. Neither a transcript nor a camera image implies reliable pronunciation, attention, emotion or understanding.

Future voice: authenticated server endpoint creates a short-lived provider session bound to learner/session/lesson, with duration and spend limits. WebRTC transport, interruption, reconnection and captions need integration tests. Long-lived credentials never enter client bundles. Provider events enter a runtime-validated adapter, then the instructional controller. Provider-specific API details must be verified when this milestone is implemented.

Future vision: select an activity purpose, explicitly enable camera, capture one frame, preview and confirm exactly that image before transmission. Apply request limits, minimize image content and retention, show active processing, and allow cancellation. No continuous upload or facial profiling.

## 5. PWA cache is a privacy boundary

Next manifest and local PNG icons support installation. Service worker registration occurs only in production. Only four explicitly public assets are cached. HTML, Next RSC payloads, API responses and learner data are never runtime-cached. Network navigation failures return a static French offline page. The activation handler removes only older `everyday-english-` caches.

This intentionally narrows the prototype’s broad offline caching. Already-open practice continues locally; offline reload does not restore the lesson. A later offline milestone should precache a versioned public lesson shell with compatibility-tested updates, and keep authenticated data in an explicitly designed storage/sync layer. Do not enable broad cache-first navigation when auth is introduced.

Reference: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), consulted 2026-11-13.

## 6. Production engineering and release gates

Pinned production framework versions and a committed lockfile; strict types, lint, unit tests, production browser tests and CI. Security headers disallow embedding, MIME sniffing, referrers, external base URLs, plugin objects and geolocation. Camera/microphone are same-origin only. The current CSP protects specific surfaces; it is not a full strict script policy. Add a nonce-based script CSP when authenticated dynamic routes are introduced; verify framework scripts and WebRTC provider endpoints rather than adding arbitrary wildcards. Configure HSTS at the HTTPS deployment boundary.

Default start binds loopback. There are no model endpoints or exposed secrets. This is deployable code, but private deployment requires identity and server-side authorization first. No fake login or disabled-looking AI button implies otherwise.

## Next increments and acceptance gates

1. **Private identity and durable learner memory.** Select identity/hosting/database providers; test unauthorized reads/writes, account isolation, concurrent events, retry idempotency, migration, restore, export and deletion. Keep deterministic lessons working during backend outage.
2. **Bounded realtime voice vertical slice.** Use the introduction unit first. Test token denial/expiry, spend limits, barge-in, reconnect, captions, refusal of out-of-curriculum tool actions and keyboard fallback. Evaluate actual speech quality on the learner’s device.
3. **Adaptive review.** Add prerequisite graph, explicit evidence strength, delayed review dates and transfer variants. Calibrate scoring against human-labeled examples; require repeated independent evidence before mastery changes.
4. **Optional visual learning.** One confirmed frame for a concrete objective (e.g. naming a cup), deletion tests, consent withdrawal and no background capture.
5. **Release hardening.** Target-device install/offline/update tests, keyboard and screen reader audit, French usability sessions, rate limits, redacted diagnostics, dependency scanning, backup restoration and retention policy verification.

### Dependency maintenance note

The Next ESLint preset’s React/accessibility plugins currently require ESLint 9, so the project retains that compatible major rather than forcing ESLint 10. A narrowly scoped npm override upgrades `@typescript-eslint/typescript-estree`’s `minimatch` to the patched 11.x line for GHSA-g3hv-75wg-m249. Its used `minimatch(path, pattern, { dot: true })` API is retained; lint/type/build verification covers the installed tree. Remove the override when the upstream parser incorporates the fix. Recheck this development-tool compatibility on dependency updates.
