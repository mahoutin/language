# Phase 0 baseline verification

**Application baseline · `d712f129a9aeb015ba46bbb2ddbc6c029b307bf5`.** Local checks used a temporary archive of the tracked source, the Desktop checkout’s existing dependencies, and Node `v22.14.0` on Darwin x64. These are Phase 0 observations. The tracked validation document records earlier successful runs and mocked-media coverage. [Historical validation](VALIDATION.md)

| Check | Observed result and likely cause |
| --- | --- |
| Targeted curriculum probe | Passed. All three choice answers use the first position. The speaking text heuristic accepts “I am hungry” and rejects “Alex.” This confirms current behavior only. |
| Unit tests | Vitest exited before running cases because it could not load a Rolldown binding. The installed binding is Darwin arm64, Node is Darwin x64, and the fallback binding is missing. The committed lockfile lists both Darwin architectures, so the evidence points to the reused dependency tree. |
| Lint, typecheck, server build and Pages build | Started, stalled and were stopped. The installed Next SWC package is also Darwin arm64. It is a plausible build blocker, but the build stalls produced no diagnostic establishing a cause. The lint and typecheck stalls are undiagnosed. |
| Production browser suite | Playwright timed out waiting for its server on `127.0.0.1:3100` after 60 seconds. No successful production build was available. The server timeout alone does not isolate whether build readiness, startup or loopback restrictions blocked it. |
| Pages browser suite | The export server failed to bind to `127.0.0.1:3200` with `EPERM` in the sandbox. No browser tests ran. Verify listener access in the test environment before retrying. |

GitHub combined status and the PR-triggered run lookup returned no results for the baseline commit during Phase 0. That does not establish the result of push-triggered CI or Pages deployment.

## Reproduce without deployment

1. Use a fresh checkout or worktree at the baseline SHA with loopback available. Select Node 24 from `.nvmrc`. Record exact Node/npm versions, OS, CPU architecture and commit SHA. Run `node -p 'process.platform + " " + process.arch'` to confirm the effective Node architecture. Avoid copying an existing `node_modules` tree or lockfile changes.
2. Install from the committed lockfile. Ensure optional packages are enabled and ports 3100 and 3200 are free and bindable. Install Playwright Chromium for the installed Playwright version. Linux CI should use `npx playwright install --with-deps chromium`.
3. Run the server checks before the Pages build, since both builds use Next build output. Run each browser suite only after its corresponding build succeeds.

```sh
npm ci --include=optional
npx playwright install chromium
npm run check
npm run test:e2e
npm run build:pages
npm run test:pages
```

If a native binding still fails, capture `npm ls rolldown @next/swc-darwin-x64 @next/swc-darwin-arm64` on macOS and inspect npm’s optional-dependency settings and the actual Node architecture before changing the lockfile. If a browser server fails, capture its startup output and confirm `/` on port 3100 or `/language/` on port 3200 responds from that environment. Record each command’s exit result and preserve failure traces. Compare against the existing Node 24 checks workflow. The Pages build and browser commands above run locally and require no Pages deployment. [Checks workflow](../.github/workflows/ci.yml) · [Server Playwright config](../playwright.config.ts) · [Pages Playwright config](../playwright.pages.config.ts)
