# Android documentation-only candidate equivalence — 8 November 2026

The Preview OTA at 3ac9a217 was rejected by the canonical runner after receipt
commits advanced HEAD to 7878ad701, although that intervening diff was only
AGENT_CHAT and Markdown release evidence. This blocked retrying the existing
candidate in the current checkout; the release clean-copy helper uses a worktree,
which the owner explicitly prohibits.

The runner now resolves the provider's full SHA in local Git history, requires it
to be an ancestor of the selected candidate, and compares the entire tree with
NUL-separated paths and rename detection disabled. Only `AGENT_CHAT.md` and
Markdown under `docs/` may differ. Native app source, locks, config, QA tooling,
Maestro flows and unknown paths still reject. No candidate override, branch
change, worktree or manually authored passing receipt is introduced.

Exact build/project/channel/update/manifest validation remains unchanged and uses
the verified provider SHA. The receipt retains the selected checkout in `sha` and
records the actual native source separately in `runtimeSourceSha`. Both visible
runtime assertions, complete journey, clean-tooling check and end-of-run source
check remain mandatory. Production freshness/config/runtime gates are unchanged.

Validation: offline doctor passes; scoped `test:quick --files scripts/qa-smoke.ts
scripts/qa-release.test.ts` passes 51 tests / 254 assertions, QA TypeScript and
Biome. Scope excludes concurrent Android flow/component work. Real temporary Git
fixtures cover exact and documentation-only source, unknown/non-ancestor commits,
runtime/lock/config/tooling/flow changes, source-to-document rename, and a leading-
whitespace filename. Test invocation uses explicit `./` paths, as the canonical
quick runner already does. No connected fixtures or business writes.

This runner change itself is not documentation-only and is mapped to the mobile
release component. It must be committed with the separately owned setup/sign-out
repairs before normal Preview publication and canonical native acceptance.
The combined candidate `7ba0fd68c` subsequently published through the normal
mobile-only Preview path. Canonical Android smoke passed 1/1 with clean/verified
receipt `2bd3d2fd-2dc9-40c0-9731-4ff36eb88b69` at 10:40:51Z on 8 November. Both
receipt source fields name 7ba0fd68c; documentation-only equivalence is covered by
the Git fixture rather than claimed as an exercised hosted difference in this run.
See the full Production release journal for exact runtime, retry and gate limits.
No merchant capability, API, schema or assistant authority changed; existing
assistant coverage/impact evidence is reusable. Brain QA feature and task pointers
are updated locally; they remain ignored rather than force-added.
