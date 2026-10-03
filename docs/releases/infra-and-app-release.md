# Database preparation and application release

Use the existing `local-infra-kit` database commands before application release.

```sh
bun run release:run --env preview
bun run release:run --env production
```

The sequence is:

1. `db:push --local`
2. `db:push --preview` or `db:push --prod`
3. `release:plan --env` for that environment

The default final command displays an advisory application plan. It does not
deploy applications. Both database pushes must succeed before the next stage.
Failure or cancellation stops the sequence. Existing target isolation,
Production confirmation and Prisma warnings remain interactive. The runner
supplies no data-loss acceptance or reset flags and refuses mutation in CI.
If Prisma schema files or their configuration change between stages, the runner
stops; run the sequence again to test the changed schema locally first.

Preview the commands without effects by adding `--dry-run`.

To choose an existing application deployment as the final stage:

```sh
bun run release:run --env preview --then api:preview:deploy
bun run release:run --env production --then api:deploy
bun run release:run --env production --then jobs:deploy
```

These are individual continuations. Preview jobs, Dashboard, Marketing and mobile
use their separately configured release interfaces. Unsupported commands or
environment mismatches are rejected before a database push. Other supported
continuations are `release:plan`, `release:status`, `release:collect` and
`release:check`. Direct root database commands remain available. API deployment
itself no longer runs database operations.
Builds generate the Prisma client with a schema-only configuration that needs no
database credentials. Connected push/migration commands retain the existing
environment and target isolation checks.

The application assurance gate covers API, Dashboard, Marketing, mobile and jobs.
Prisma/schema/migration source still affects application artifact fingerprints.
Database receipts, migration-ledger certification and backup attestations are
outside this gate. Manage database recovery through the provider separately;
there is no added manual backup-per-release requirement.

Application assurance still requires exact reviewed source, owned deployments,
selected environments, fresh active provider state and trusted signed evidence.
Mobile needs independent Android/iOS build and runtime compatibility. Preview
jobs cannot reuse Production evidence. Collection currently emits partial
unsigned facts; it does not produce ready signed release evidence. Hosted
protection, signing and live acceptance must be configured before treating the
application gate as active. Planning and local tests do not establish readiness.

Trigger collection defaults to the verified School Clerk/EwaTrade ownership
identifiers. Explicit protected overrides remain supported. Preview jobs still
require verified isolation or a protected waiver before acceptance.
