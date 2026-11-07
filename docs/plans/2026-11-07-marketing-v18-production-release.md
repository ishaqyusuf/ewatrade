# Marketing v18 Production release preflight — 7 November 2026

Status: release requested, source packet prepared; awaiting explicit worktree
permission under the owner's AGENTS.md. No push, merge, worktree, deployment or
provider change performed. Prior release pause is superseded by today's request,
but the separate explicit-worktree requirement remains.

## Verified scope

- Fresh origin/main: `7beecf3877e382fd64c743769368fe06177b2ca3`.
- Current candidate before this receipt: `d6e119163257c21aa490f8a8711b830a50921d87`; 422 commits ahead.
- Standard `bun run release status --production --only marketing --mobile skip`
  reports Dashboard, Marketing and API would deploy on the current-main push.
- Marketing history since origin/main contains exactly the v15 and v18 source
  implementations (`40761833` and `6c02ef33`). The v15 parent marketing tree matches
  fresh origin/main exactly. The prepared packet includes their two receipt commits.
- Packet: `/private/tmp/ewatrade-marketing-v18-release.patch`.
- SHA-256: `7bacda01013ef3f132c766a1e8ed03ce40243a83f6722b975ddb246ef74b7366`.
- Commit sequence: `40761833`, `2f060171`, `6c02ef33`, `d6e11916`.
- 32 unique paths: 27 marketing source/assets/test paths plus scoped
  plans, verification and assistant-impact documentation. No API, Dashboard,
  database, shared-package implementation, jobs or mobile source in the packet.
- Offline doctor passed. Existing v18 local UI/types/source/Logly test evidence
  remains valid for its source; it is not a candidate-bound hosted release receipt.

## Proposed release after checkout permission

1. Create `codex/marketing-v18-production` in a temporary sibling worktree from
   fresh origin/main, preserving the active checkout and all unrelated changes.
2. Apply only the four listed commits. Validate/build the resulting candidate and
   inspect the normal release graph; resolve any real dependency/gate failures
   within this scope rather than shipping the 422-commit current main.
3. Use the existing Preview release and candidate-bound existing-data qa:smoke.
   Review the hosted marketing page. No sales, payments or fixtures to pass checks.
4. Publish the narrow candidate through the repository's release path, preserving
   Preview/Production identity, health, environment and provider gates. Current
   main must not be pushed wholesale. Any branch integration must preserve local
   work and must not rewrite history or change this active checkout's branch.
5. Verify canonical Production marketing and Logly configuration/delivery evidence
   available through normal read-only access. Record the actual result and limits.

The release executor's dirty-checkout path also calls `git worktree add`; simply
running it from this checkout would violate the same explicit worktree rule. No
alternate deployment mechanism, detached source upload, manual receipt/mark or
allow-dirty flag is used to bypass these checks.

## Brain impact

Updated local `.brain/features/marketing-launch-v4.md` and
`.brain/tasks/2026-11-07-marketing-full-polish.md` with the pending release state.
No feature, API, schema or source changed in this preflight. Source validation is
reused; this receipt receives a whitespace/scope check only.
