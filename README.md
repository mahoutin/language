# Everyday English

A guided English-learning PWA foundation for a French-speaking adult beginner. Built with Next.js App Router, React and strict TypeScript. Five versioned introduction activities remain the core of the product; AI will support this curriculum, not replace it.

## Run

Node.js 24 LTS recommended (minimum 22.13).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. No API keys required. Development and production start scripts bind to loopback by default. For a local production build:

```sh
npm run build
npm start
```

For existing browser progress, keep the **exact same origin** (scheme, hostname and port) as the prototype. For example, if it used `http://localhost:8080`, run `npm run dev -- --port 8080` and visit that same address. A valid original record migrates automatically. Progress cannot move automatically between origins or browser profiles. An old service worker may serve the legacy page once while it updates; reload after the update or unregister it in DevTools (do not clear site data if you want to retain progress).

## Verify

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

Browser tests run against the production build on port 3100. CI performs the same checks. `npm run check` includes lint, typecheck, unit tests and build. Run `npm audit` for current dependency advisories.

## Current behavior

- The original listening, understanding, introduction, reading and transfer prompts, in order.
- French instructions, replay/slow TTS, French help, retry/scaffolding, skip and repeat.
- Browser speech recognition only after per-exercise opt-in, with typing always available. Browser providers may process audio remotely. This is not live AI voice or pronunciation assessment.
- Optional camera preview with cleanup on navigation, cancellation and tab hiding. No capture, upload, analysis or facial inference.
- Validated local evidence and resumption; no persisted answer text, raw audio or video. Export original/current records and delete local progress.
- Installable manifest, local icons and a public offline fallback. Previously open lessons work without a network, except browser audio services may require one. Reloading offline shows the fallback rather than the lesson. Full offline lesson precaching is not yet implemented.

## Structure

- `src/domain`: versioned content, assessment and deterministic lesson transitions; independent of React and providers.
- `src/lib`: validated storage adapter and browser speech types.
- `src/components`: learner interface and lifecycle-scoped media controls.
- `src/app`: Next routes, metadata, manifest, error boundary and CSS.
- `public`: audited cache allowlist, offline fallback and icons.
- `tests`: curriculum/storage unit tests and production browser regressions.
- `prototype`: untouched starting implementation, retained as a reference and excluded from the runtime.

Read [the audit](docs/AUDIT.md), [architecture decisions](docs/FOUNDATION.md), [target architecture](docs/ARCHITECTURE.md) and [acceptance checklist](docs/ACCEPTANCE.md).

## Release boundary

This is a tested application foundation, **not yet a privately authenticated AI service**. Authentication, PostgreSQL learner memory, server-authorized Realtime voice, optional consented image interpretation and delayed-review adaptation remain staged work. Local progress is not encrypted. Do not expose private learner data or paid model endpoints until authentication, authorization, retention/deletion and operational checks are in place. No deployment is performed by this migration.

## GitHub Pages

`npm run build:pages` generates `out/` for `https://mahoutin.github.io/language/`. `npm run test:pages` verifies the exported site under its repository path. Pushes to `main` trigger `.github/workflows/pages.yml`; select **GitHub Actions** as the source in repository Settings → Pages.

This is public static lesson hosting, not authenticated private hosting. Progress stays in each visitor’s browser; no AI keys or learner records are published. Next.js server headers do not apply on GitHub Pages, and API/authentication/database services require separate hosting. The normal `npm run build` / `npm start` server mode remains available. A different domain has a different browser storage origin; local progress does not automatically transfer there.
