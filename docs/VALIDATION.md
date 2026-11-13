# Verification — 2026-11-13

- Clean `npm ci` in the Desktop project: passed; audit reported 0 vulnerabilities.
- `npm run check` in the Desktop project: lint, strict TypeScript, 20 unit tests and production build passed.
- Seven Playwright Chromium tests against the same migrated production sources: passed (run in the temporary staging directory before applying the migration).
- Browser coverage: complete five-activity lesson, reload/resume, help preserving input, repeat, export, delete, retry/scaffold/skip, corrupt-record protection, late camera permission cleanup, microphone consent/abort, storage quota failure, mobile fit, manifest, security headers, cache allowlist and offline fallback.
- Original files archived under `prototype/`; no commits, pushes or deployment performed.

Manual checks still required: real microphone/camera hardware and browser speech services, target-device PWA installation, screen reader behavior, sustained offline/update scenarios and learner comprehension. Automated media tests use mocks; they do not establish real speech accuracy or hardware compatibility.

Known tooling constraint: Next’s lint preset still includes plugins whose peer range ends at ESLint 9. The compatible ESLint 9 version emits an upstream end-of-support warning. See FOUNDATION.md for the narrowly scoped patched transitive dependency override and maintenance plan.
