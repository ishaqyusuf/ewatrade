## Summary

<!-- What changed and why. -->

## Assistant and Brain impact

- [ ] Only tests, fixtures, docs, static assets or build/config tooling changed, **or**
- [ ] Merchant behavior changed (routers/schemas, Prisma schema, permissions,
      assistant adapters/contracts, domain commands/queries/services, or web/mobile
      feature source): coverage regenerated (`bun --cwd apps/api assistant:coverage`)
      and an impact record added under `packages/assistant/impact/` stating the
      assistant support or `noAssistantImpact` reason (`bun assistant:impact` passes)
- [ ] Each new or changed operation is a capability, planned with a ticket, form-only
      or excluded with a reason — never silently unclassified
- [ ] Feature, API, permission and schema docs updated where applicable (Brain
      files are local-only; do not force-add them)
- [ ] Schema changes use Prisma generation and root `bun db:migrate` / `bun db:push`
      on the verified profile; no hand-written migration SQL
- [ ] Evidence lists what was actually run; definitions are not passing results

## Verification

<!-- Commands run and their results. -->
