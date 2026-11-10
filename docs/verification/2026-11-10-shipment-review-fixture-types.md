# Shipment review fixture type repair — 10 November 2026

Status: **bounded test-source repair verified; no release or Apple acceptance added**.

The Paystack readiness check reported three API TypeScript errors in the committed
`apps/api/src/assistant/general-shipments.test.ts` from `1e6672a17`. Root independently
ran `bun --env-file=/dev/null run --cwd apps/api typecheck` and reproduced exactly
three TS2322 errors: freight amount, expected quantity and source unit price were
plain strings where the shipment draft review requires `ExactDecimalString`.

The existing validated `parseExactDecimal` constructor now supplies those three
fixture values. Their canonical strings remain `400`, `200` and `3.2`; all review
assertions remain unchanged. The same test file's refund object was formatted to
meet its existing Biome check. No runtime type, domain function, merchant behavior,
payment setting, capability, database schema or mobile source changed.

The compiler diagnostic directly identifies the fixture/type mismatch, so no
runtime instrumentation, competing production hypotheses or new regression suite
was needed. The existing full API type check is the red-to-green regression check;
the existing review tests preserve the relevant output assertions. An intermediate
check still found the freight amount mismatch; it was corrected before final
verification. The first smoke attempt stopped at the existing refund formatting
violation, which was then fixed rather than skipped.

## Final validation

- Offline QA doctor passed; no service or database probe was performed.
- Full API `typecheck` exited 0 after the repair. This is the current working
  graph, including concurrent source; it does not certify a clean release SHA.
- Exact-file shipment review tests passed: 3 tests, 26 assertions. The command
  used `--env-file=/dev/null` and an unusable loopback database sentinel; the
  tests exercise pure review formatting/projection, not database operations.
- `test:quick --plan --files apps/api/src/assistant/general-shipments.test.ts`
  mapped all four existing groups with zero unknown paths. The matching scoped
  run passed 285 tests / 1,820 assertions, QA-tooling types and changed-file Biome.
  Foreign WIP was excluded from changed-path selection, not certified by this run.
- Owned whitespace and documentation links passed. UI testing is not applicable
  to this test-fixture typing repair; no rendered product source changed.

Assistant gates remain explicit: H01 `assistant:coverage --check` failed for
unclassified `catalog.findByCode`, `stores.publicListing` and
`stores.updatePublicListing`. Whole-working-tree H02 failed because concurrent
domain/client changes had no new impact record. Neither failure was suppressed,
and no snapshot was regenerated to manufacture a pass. The canonical
`classifyChangedPaths` helper confirms this repair's test/document paths use the
existing exemptions and touch zero gated areas; that is not a full H02 pass.
Runtime shipment code, the decimal utility and coverage snapshot are unchanged
by this repair. Source-owner follow-through is needed before whole-candidate
acceptance.

No provider calls, credential change, purchase, fixture database write, schema
operation, build, install, OTA, deployment or public activation was performed.
Apple remains 3/6; its [acceptance ledger](../billing/apple-paid-launch-2026-11-07.md)
and original signed10 evidence retain their existing bounds.

Brain impact: local `.brain/tasks/apple-billing-workshop-handoff-2026-11-08.md`
records the source-only repair and outstanding candidate gates. Feature/API/schema
documentation needs no behavior update because only test inputs were corrected.
