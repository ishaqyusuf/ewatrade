# Finance period close checklist client evidence

**Scope:** Dashboard and native mobile review flows for F6.6.04 v4 `.02` and `.03`. This records client implementation evidence only; it does not award parent approval or change canonical progress.

## Design selection

Compared the three sample directions in `artifacts/finance-period-close-checklist-workshop/index.html`. Selected **02 — Exceptions first** because the existing period workflow is an operational review, and leading with blockers and review-required evidence makes the lock decision and its limits easiest to assess. Kept the checklist embedded in the existing review flow rather than introducing a second report surface. The comparison used source inspection only: the browser denied `file:` access, and the approved local preview attempt could not bind its port. No alternate browser path was used.

## Implemented behavior

- Both clients fetch a fresh checklist for the exact book, cutoff, currency, date range, and journal watermark. The dashboard additionally re-reads the authenticated server session and active Owner/Admin tenant before preparing and confirming the command.
- Review shows checklist status, cutoff cash counts, source coverage, gaps, and explicit REVIEW_REQUIRED items. These remain visible and are not treated as complete or waived; confirmation requires date-lock eligibility and the balanced posted trial-balance evidence.
- Final confirmation repeats the freshness checks and compares the returned checklist with the reviewed evidence. It preserves the exact command payload and snapshot through the existing durable command path.
- Reopen confirmation revalidates the exact latest unreopened period identity and its reviewed cutoff. Back is blocked while a final read or command dispatch is in progress.
- Retained-command metadata initializes recovery controls only when no in-memory review exists; it cannot replace or clear the exact review after an uncertain result.
- Offline, stale, mismatched, blocked, or incomplete checklist evidence cannot authorize a close.

## Verification

- `bunx biome check --write` on the eight owned TypeScript/TSX files: passed; no formatting changes needed.
- `bun test packages/utils/src/finance-close-checklist.test.ts apps/mobile/src/components/mobile/finance/finance-period-state.test.ts`: **11 passed, 48 assertions**.
- `bun run typecheck` in `packages/utils`: passed.
- Scoped `git diff --check`: passed.
- Full dashboard/mobile typecheck was not run because the repository's broader TypeScript graph is known to exhaust available memory; the focused TSX bundle attempt was unavailable because Bun could not write to its temp directory (`AccessDenied`).
- Live UI testing was unavailable: there was no active EwaTrade Finance app tab/runtime, and workshop preview access was blocked by the browser's file-access policy. No application runtime was restarted.

## Source checksums (SHA-256)

```text
f7539e97a10e942c4e8e1a746d2ad2449f887460c08c1c614c9c42eb108991b6  apps/dashboard/src/actions/read-finance-close-scope.ts
29fa926829a588393b55e36c405669610a7a7cd60d64451415ae083926cae0e2  apps/dashboard/src/components/finance/period-form.tsx
d2671eb25856c4adab8133b024dd87be9101ae36624cc1732b6dc3fad6b83b28  apps/dashboard/src/components/finance/form-fields.tsx
c8aeb552f2ceb72e49e0360f7386b040d479bb8f6ff30142e904c7e2042c53ad  apps/dashboard/src/components/finance/period-close-checklist-view.tsx
99835b376e198d63127f8b66a22beed4c0f4d8990217bad775299837cc02147f  apps/mobile/src/components/mobile/finance/finance-period-checklist.tsx
bdfd695bd95cd21b4370a744aa7d701d2ac852b8129b2292abe30bf2c3c6e669  apps/mobile/src/components/mobile/finance/finance-period-screen.tsx
7b3bfed249ccb5ae6e1acfffe32b8ea0d949c2871bc6769157249ed1b16718a8  packages/utils/src/finance-close-checklist.ts
b5d8a85e54760cfd6ef18e53650287f564d2d165fa837f823543a555e724c3b5  packages/utils/src/finance-close-checklist.test.ts
75ac49a96b7255f9fb295893a7e9892ec28c21b2e08c69bf7d808269c1e39232  packages/utils/package.json
69988db85e5a41ae701beda7455428aa9ee15ca710dc533f9df098cadbb7b8e1  artifacts/finance-period-close-checklist-workshop/index.html
```

## Brain documentation

No Brain documentation was changed in this client implementation. The parent implementation owns the canonical plan, feature/task progress, and aggregation; this evidence packet does not alter those records.
