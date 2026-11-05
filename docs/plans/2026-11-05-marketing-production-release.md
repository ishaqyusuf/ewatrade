# Marketing Production release — pending by owner choice

Production source: `7beecf3877e382fd64c743769368fe06177b2ca3` (`origin/main`). Current main is 403 commits ahead.
The standard release status shows `--only marketing` still includes Dashboard
and API when pushing current main. No provider change or push has occurred.

Prepared packet: `/private/tmp/ewatrade-marketing-v15-release.patch`.
SHA-256: `82c3431cfc8d78c9ef426e0c6959e74c63961f9ed1f550654d89a47b8e5b10b6`.
The existing marketing baseline at the implementation parent is identical to
remote main; all 22 changed marketing paths belong to the approved v15 commit.
The two selected commits affect 25 unique paths: 22 marketing source/assets,
implementation plan/receipt and one assistant-impact record. No API, database,
Dashboard, jobs, shared package implementation or native code is included.

Proposed authorized execution once worktree permission is given:
1. Create temporary release worktree `codex/marketing-v15-production` from the
   current remote main; preserve the active main checkout, staged explainers and
   mixed Agent Chat history.
2. Cherry-pick only `40761833` and `2f060171`; validate the scoped candidate and
   build marketing with existing production configuration.
3. Run the existing Preview release and candidate-bound existing-data web smoke;
   inspect marketing's actual hosted rendering and destinations.
4. Publish/merge the narrow release through the repository's normal process,
   then run `bun run release --production --only marketing --mobile skip --yes`
   from the exact merged remote candidate. Preserve all gates and track any
   automatic Git-connected deployment without adding unrelated source.
5. Verify canonical www and record release receipt/Brain/Workshop evidence.

Worktree creation is pending because the owner's AGENTS.md explicitly requires
permission for worktree use on the current task. Release authorization does not
silently override that separate checkout rule.

## Owner decision

At the explicit worktree-permission question on 5 November 2026, the owner chose
“Keep the release pending.” No release worktree, remote push, merge, deployment,
provider configuration or production change occurred. The source packet and
narrow-release plan remain available for a later explicit resume. The owner then
confirmed web signup/setup design first. Impeccable v4.8.0 update was deferred to
a later turn; it was not installed during this work.
