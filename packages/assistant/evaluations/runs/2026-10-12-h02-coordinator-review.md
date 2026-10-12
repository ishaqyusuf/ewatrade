# H02 coordinator review — changes required

The new implementation packet is ready for source review, not accepted. Existing
14-test evidence is reused; the coordinator did not repeat that unchanged suite.
Two additional provider-free probes reproduced gaps in the intended feature gate.

1. `evaluateImpactGate` accepts an actually added capability whose impact record
   declares `change: "unchanged"` and omits `rollout`. The computed coverage change
   was `customers.read: added`, but the errors array was empty. Require current
   rollout for nonremoved capabilities and reconcile declared change with the
   actual diff, including false `unchanged` claims. Add affected regressions;
   retain the generated coverage comparison.
2. A change to `packages/db/src/queries/service-intake.ts` with unchanged coverage
   rows and no impact record passes with no gated area. Canonical H02 requires
   feature impact decisions, not only endpoint-signature or manifest changes.
   Merchant command/repository behavior, shared authority and assistant adapters
   can change without changing a router/coverage row. Extend classification to
   these implementation boundaries and document deliberate exclusions. Web/mobile
   feature behavior also needs an explicit feature impact decision; the blanket
   client-only exemption leaves that requirement uncovered. Retain exemptions
   for unrelated assets and tests, and the low-friction draft command.

Reproduction: `bun artifacts/assistant-operations-parallel/h02-review-probes.ts`.
Both probes returned `errors: []`; the first reported the actual added row and
the second an empty area list. These are diagnostics of current source, not new
accepted impact records or a hosted workflow run.

The coordinator owns review and affected acceptance checks. The implementation
agent owns repairs and complete handoff. Clean CI install, actual GitHub execution,
ignored Brain limitations and runtime/security gates remain separate. No provider,
database, runtime, authentication, mobile, push or deployment action occurred.
H02 has no accepted bookmark; 13/45 web acceptance is unchanged.
