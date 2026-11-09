# Restore age selection for undeclared mobile accounts

9 November2026. Current-checkout source repair only; not published, installed or
accepted on a new signed Android/iOS artifact. No real age/Terms/account mutation,
provider call, SDK integration, database change, build, OTA or deployment.

## Reproduced failure

`getCustomerAccountAgeStatus` returns the stored `ageBand` unchanged, including
`UNDECLARED`. The router returns that value to the existing authenticated age
procedure. Current `AccountAgeStartupGate` recognized only null as missing.
Consequently a legacy account with `UNDECLARED` and `eligible: false` saw the
under-13 refusal and could not reach the one-time age controls.

The Brain's 20 October physical Preview receipt documents an earlier successful
repair. That historical publication does not establish the current checkout's
behavior; the current predicate still omitted the explicit enum. The actual
component fixture also omitted its regression vector.

## Repair and verification

The client now recognizes null or `UNDECLARED` as a missing declaration and
excludes missing age from its underage-refusal branch. It renders the existing
neutral age choices and uses the same server mutation. Genuine under-13 refusal,
eligible teen/adult access, pending/error behavior, signed-out behavior and gated
update-recovery access are preserved. No adult status or verification is inferred.

The real component fixture (with mocked auth/query/native rendering boundaries)
now retains the screen title and exercises nine states: null, `UNDECLARED`,
under13, both eligible teen bands, adult, pending, error and signed out. Before the
source fix it fails specifically with `UNDECLARED: show declaration controls, not
an underage refusal`; afterward all vectors pass. The fixture never chooses or
submits an age for a real account.

```sh
NODE_ENV=test bun --no-env-file apps/mobile/src/lib/fixtures/app-update-age-gate-scenario.ts age-gate
```

- Offline doctor passes; owned source plan selects core/mobile/domain, no unknowns.
- Actual-component fixture red→green, preserving existing recovery behavior.
- Full Mobile TypeScript check passes (`--incremental false`,16GB heap cap).
- Initial owned two-path smoke:202tests/1056assertions+QA tooling types/Biome pass.
- H01 coverage snapshot is current; H02 passes with one reviewed personal-age
  exclusion record and zero capability/procedure row changes.
- Final four-owned-path plan has no unknowns; smoke passes284tests/1813assertions
  plus QA-tooling types/Biome. Diff/whitespace review passes.

Private red/green/type/smoke logs:
`/private/tmp/ewatrade-undeclared-age-*-2026-11-09.log`.

## Authority and remaining gates

The assistant cannot select, guess or mutate a person's age. Existing
`serviceCommerce.accountAgeStatus`/`accountDeclareAgeBand`, authenticated session
ownership and canonical server eligibility remain authoritative. No assistant
capability, procedure, schema or permission was added. The required H02 record
explains the personal identity-control exclusion.

This fixes declaration recovery; it does not ingest Play Age Signals, verify age,
accept Brazil/other jurisdiction compliance, or replace the separate two-stage
native SDK/privacy review. Current signed Android36 and iOS10 remain unchanged.
Actual signed candidate testing and controlled publication remain separate gates.

Brain updated locally: `.brain/features/mobile-account-age-startup.md` and
`.brain/tasks/in-progress.md`. Earlier physical receipts/history are retained.
