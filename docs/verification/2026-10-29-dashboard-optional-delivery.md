# Optional Dashboard delivery —29 October2026

Partial DP-302/303 under the [27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent965f64794; source/lock hashes in private `optional-source.json` under
`/tmp/ewatrade-dashboard-program-20261029/`. Primary checkout and unrelated work preserved.

## Confirmed cause and change

Three always-mounted notification components imported a timestamp formatter from
the large payment-review component. A refreshed closed-sheet Overview delivered
the review and receipt/allocation UI even though neither was open. The formatter
is moved unchanged to the existing pure banking-model module. All internal callers
use that boundary; PaymentReportReview remains imported by its actual review owner.

Overview also imported SetupChat and SetupDraftPanel through its banner/controller.
These bodies, the AI chat SDK and markdown graph loaded while Setup was closed.
Both bodies now use Next dynamic imports, keeping SSR enabled when actually rendered.
The existing dialog/controller remains the owner of availability, scope/proof,
start/visit/skip/finish mutations and close controls. Lightweight status text appears
inside the existing frame during code loading. Quick Assistant's existing initial
lazy boundary is retained; its later idle polling needs a separate DP-204 fix.

## Evidence and limits

- Actual refreshed Overview DOM script URLs were mapped to local dev chunks and
  module definitions. Before helper move:65 resolvable scripts,23,389,521 bytes.
  After helper move:64/23,287,405; seven payment-review module definitions removed.
  After Setup deferral:56/19,058,045;14 further app modules removed. The two Setup
  body definitions and large markdown chunks are absent. Small async-loader chunk
  references remain, as expected. These are locally resolved development bytes,
  not network transfer totals, compressed production costs or latency causation.
- Full Dashboard source types pass after final changes. Existing focused banking,
  receipt and review-failure model checks28/86 pass. Final owned-file source smoke
  passes220/1481 across41 files; unrelated staged explainer/Agent Chat excluded.
  Seven changed source files pass Biome; no dependencies or domain behavior changed.
- Actual source conformance check proves SetupAssistant, SetupWorkspace and
  SetupSkeleton function text byte-identical; the moved formatter is byte-identical.
  Only import/delivery declarations changed. DTOs and callbacks remain typed.
- Existing-data desktop IAB: Overview still shows loaded summaries, the Continue
  setup banner and notification controls. Bell renders the existing website request
  with the same28Oct2026,21:19 timestamp; Close works. No mark-read/creation/send/
  financial action or fixture performed. Screenshot `import-notifications-proof.jpg`.
- Setup open-path runtime is not exercised here: its existing controller can append
  a welcome on visit. That behavior remains unchanged; no business submission was
  manufactured for a passing performance check. Open/close/error/focus/retention
  acceptance remains required for DP-303/501. Source conformance is not that proof.
- The optimized build965f64794 is preserved while the Dashboard-only runtime switch
  approval is pending. New optimized build/comparative runtime proof is still open;
  these changes are validated through dev bundling, source types and focused checks.
  No shared service was stopped/restarted. No deployment or provider action.

Private artifacts: `import-{closed,modules}-{before,after}.json`,
`optional-{closed,modules}-after.json`, `import-source-conformance.json`,
`import-boundary-{tests,types,quick}.log`, `optional-tools-{types,quick}.log`.
The source policy audit is recorded in [query policy](../plans/2026-10-29-dashboard-query-policy.md).
H01 source unchanged; H02 client impact must pass before commit. Brain feature,
task and BRAIN updated locally. No schema/API/permission documentation change.
Overall accepted count remains3/27 (11.1%); broader tickets and original scope stay open.
