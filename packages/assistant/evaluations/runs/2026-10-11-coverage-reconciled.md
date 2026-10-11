# Capability coverage reconciled — 11 October 2026

Inspected orders.activity.list and its canonical listCommercialOrderActivity query.
It reads scoped saved Order notes and attachment metadata. No assistant read tool
currently delegates to it; classify as planned sales/H04 (media integration), not
supported or excluded. Existing attachment-add capability remains separate.

Regenerated COVERAGE.md from current router/manifest: 539 procedures, 398 merchant;
84 capability-supported,148 planned,121 form-only,45 excluded. These are catalog
classifications, not deployed or accepted capability counts. Manifest has80
capabilities,40 read/40 write; planned rollout remains visible per row.

`bun apps/api/scripts/assistant-coverage.ts --write` exited0.
`bun test apps/api/src/assistant/capability-coverage.test.ts` passed1test/4assertions,
checking every procedure classification and exact generated document equality.

The prior orders.activity.list coverage blocker is resolved. No runtime behavior,
model run, database write, mobile implementation/test, activation or deployment.
