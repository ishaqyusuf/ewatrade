# Assistant HTML response factory verification

Run `2026-10-29-assistant-response-factory`. In progress: the first published
revision is a navigation baseline, not complete response coverage.

## Scope and authority

Owner requested designed, navigable HTML covering the current Assistant product
and coordinated response assets, including WhatsApp. Source lives in the existing
shared Workshop at `work/ewatrade/assistant/review`, direction `01`. Product code,
business data, provider settings and deployment are unchanged by this task.

Default author is the verified `claude-opus-5-5` CLI with explicit `--effort high`,
session `465842df-29e4-40b9-b3b9-162cd7bd31ec`. Its first run finished and stopped
before the coordinator built/published. A second run in the same session is
filling audited coverage gaps while the coordinator checks frozen v20. No new
worktree, model substitution or detached unattended author was used.

## Catalog evidence

- Existing screenshot-led hub: `01` v19,
  `bf433a3e-50a3-4f8a-a9e5-c1a370ebbb1d`. It stays immutable and accessible.
- First HTML navigation revision: `01` v20,
  `8fdc3e0f-a15d-43ad-b430-e90fe1d88cf6`.
- Canonical path: <https://workshop.localhost/ewatrade/assistant/review>.
- WhatsApp source: 156 cases / 409 case versions; selected `03` v32 remains
  `6eb39236-823c-4fe6-85b6-eea22a1a4699`; latest design `03` v38 is separate.
- Banking navigation reference: `02` v18,
  `9a15dd1d-5612-4d02-8835-e7547d0d6d8e`. Selection/implementation remain unchanged.
- The initial manifest supplied a lowercase project name. The coordinator
  immediately restored the existing display name `EwaTrade`; subsequent
  publication must retain it.

## Source capture and inventory

The actual imported manifest contains 165 capabilities and 373 declared client
pairs: 165 Dashboard, 122 mobile and 86 WhatsApp. Rollouts are 87 source,
74 planned and 4 enabled. These are source declarations, not live availability.

The coordinator executed actual pure response formatters and
`renderWhatsAppFinalReply` on synthetic inputs. All captured cards passed
`generalAnswerSchema`: 29 scenarios / 46 cards / 16 capabilities, with SHA-256
for 16 relevant source files. Exact string amounts and explicit unknowns remain;
captures include empty/partial lists, missing units, customer credit/refunds,
supplier statements, purchase/expense bills, account names/balances, inventory
availability/custody, cross-currency counts, ambiguous search and item activity.
This fixture capture uses no product model, database, domain write or messaging
provider. Remote Claude calls are design authoring, not product acceptance.

## Focused checks so far

- `bun run qa:doctor --offline`: pass. No services started or connected probes.
- Owned documentation smoke: `bun run test:quick --files` with this receipt and
  the factory plan passes QA tooling types and 47 tests / 193 assertions. This is
  an explicit two-file scope; concurrent client/API work is excluded.
- `python3 build.py --strict`: pass, zero warnings for initial v20.
- Initial coverage: 61 authored scenes plus 156 WhatsApp cases. Of 373 declared
  pairs: 17 source-port, 76 historical as-built HTML, 32 WhatsApp case,
  31 shared app-review handoff, 140 current-unpreviewed, 77 planned-unpreviewed.
  These classifications are distinct; no full-coverage claim follows.
- Published v20 opened in the in-app browser. It renders HTML cards and real
  navigation controls, not a screenshot grid.
- WhatsApp domain/case navigation and the exact `bk-link-batch` V2/S18 replay
  work. Selecting its Review 5 state loads the original conversation and review
  controls. A native automation helper reports a retained-option error when
  controls are rebuilt; subsequent AX state confirms selection succeeded.
- A local synthetic payment edit from 6000 to 4500 plus a note survives changing
  to the compact phone size. No Send or Confirm was clicked.
- A real preview defect remains: unsent composer text clears when theme changes.
  Saved review edits remain. Repair and recheck this before final acceptance.
- Existing shared H01 `assistant:coverage --check` reports a stale snapshot.
  Shared H02 reports an impact-record gap for concurrent client changes. This
  task has not edited product source or regenerated another owner's coverage.
  Check this documentation commit's own H02 scope separately after committing.

## Remaining acceptance

Integrate the actual captures, complete the audited current response mapping,
repair draft retention and scene sharing, then publish and check the final exact
revision. Verify notes export/import, display controls, representative local
edit/cancel/back and nested HTML case navigation. Check that original selections,
implementations and history remain intact. Record final counts and gaps honestly.

The shared Workshop work directory is intentionally Git-ignored; its HTML assets
are retained by immutable catalog revisions. Tracked product-repository delivery
contains the specification and this verification record. Brain feature/task
records remain local-only, as required by repository policy.
