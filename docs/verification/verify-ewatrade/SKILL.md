---
name: verify-ewatrade
description: Verify a completed EwaTrade change with focused source checks and, when needed, one bounded existing-data app session using the repository QA workflow.
---

Use this recipe after a coherent change is ready for verification. It adapts
pstack's Launch / Doctor / Drive / Evidence / Cleanup pattern to EwaTrade's
existing tooling. It does not install or require the Cursor plugin.

Read `docs/testing.md` and the affected Brain feature/last receipt. Check for
existing proof before executing: reuse only unchanged relevant source and
dependencies on the same proven target; a source pass cannot prove runtime,
native behavior, signed builds or a different deployment.

- **Launch:** source-only work needs no runtime. If the invariant needs the app,
  identify the owning checkout and reuse its healthy stack, or start only the
  required surfaces through the existing root `dev` launcher. An isolated
  worktree does not isolate hosted database quotas. Do not start duplicate jobs.
- **Doctor:** run `bun run qa:doctor --offline` for profile setup. A missing
  profile is a setup limitation, not permission to copy another chat's secrets.
  For an app session, use the runbook's local services/device check. Stop at an
  unavailable dependency rather than repeatedly probing it.
- **Drive:** inspect `bun run test:quick --plan`, run the selected sanitized
  suite, then only change-specific checks needed to prove the invariant. For a
  visual change, use one representative success and relevant failure/back path.
  Reuse existing QA records and the configured `qa:smoke` runner where suitable;
  do not broaden to a daily live sweep or rerun unrelated matrices.
- **Evidence:** give the execution one dated run ID in `.brain/qa/`. Record the
  source SHA, relevant path hashes, dependency/lock hashes, invariant, start/end,
  commands, result, exact platform/target and cleanup. Connected runs also need
  profile and provider project/branch/endpoint identity without credentials.
  Link the receipt from current indexes; don't copy it as a new execution.
  Candidate release receipts remain owned by the existing release verifier.
- **Cleanup:** stop only processes this session owns and no longer needs.
  Close owned idle polling clients. Report any retained stack or unresolved
  fixtures; preserve offline queues and shared user sessions.

If a check fails, diagnose the failure and repeat only the affected check after
the fix. Record coverage gaps and inherited failures explicitly. No plan upgrade,
schema/retention change, provider send, deployment or store rollout is authorized
by this verification recipe.
