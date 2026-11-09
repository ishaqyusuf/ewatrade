# Preview web readiness follow-through preparation

Status: **new private web-only runner prepared; not connected or accepted**.
Root owns technical review and any separately authorized follow-through case.
No new login is needed; cached Vercel CLI authentication is restored.

The original readiness runner remains byte-identical at SHA256
56ecce0509c2da0677cfef96288e864f9dbac0562ffc3d6a6da886150bbe9226.
The successful [three-part case](2026-11-09-preview-billing-readiness-observation.md)
and root's separate web attempt are immutable. The web attempt stopped at
PREVIEW_DEPLOYMENT_REFUSED at19:13:11.897UTC before flag reads. It is incomplete,
not an authentication failure or proof of actual settings.

## Concrete source mismatch and canonical guard

The original helper required raw deployment.target to equal the string preview.
The project's [canonical deployment validator](../../scripts/release-vercel-deployment-output.mjs)
requires target strictly null for Preview; undefined, preview, production and
custom targets are refused. It also validates exact observed deployment ID/URL,
expected project/team, READY/nondeleted status and created/building/ready
chronology. The normal [Preview smoke verifier](../../scripts/qa-smoke.ts) requires
gitSource.sha, and existing tests reject meta.githubCommitSha as its substitute.
The toolkit's /v6 list uses descriptive commit metadata for discovery; that is
not an alternative /v13 detail-source acceptance rule.

Offline comparison proved a valid canonical Preview fixture passes the normal
verifier and fails the old audit. The failed actual provider record was not
inspected, so the mismatch is established without claiming it was the sole
cause of that particular failure. No weaker target/source fallback is proposed.

## New private runner

/private/tmp/ewatrade-preview-web-followthrough-2026-11-09.mjs is mode0600,
SHA256f2b1d8766d160aef34ad6fd84d842a37b6c21129c9c9561430596188d8e62b11.
Its review diff is the same stem with .review.diff. It directly reuses
assertOwnedVercelDeployment and refuses canonical-validator source drift from
SHA2564d2235321afc49c345351d1a05b46eb7d9a2c373a437fdb8938daca14a7bb6f7.
Exact project name/id/team and strict40-hex gitSource.sha remain required.

This copy permits only part web and a manifest containing exactly parts=[web].
The original named scope, reviewed runner hash/window, fresh nonce, private
exclusive intent and result refusal remain. The same two Preview hosts,
36-request bound,4.5-second CLI bound,50-second total deadline, no-decrypt guard
and sanitized output are retained. Root must review the exact new source before
creating/executing a fresh case; no prior approval marker is reused.

For every selected project setting with metadata type sensitive, including
STORE_SUBSCRIPTION_PRODUCTS, the runner skips the single-value GET entirely.
It reports present-but-unreadable, the allowlisted type, branch-scope boolean,
safe updated timestamp and whether the setting changed after deployment.
valueRead=false and valueEquality=unverified are explicit. It does not call a
Sensitive catalog unset/invalid, claim installed mappings or equality, attempt
decryption, pull another secret copy or create a workaround. Ambiguous entries
remain ambiguous. Shared rows remain names/link metadata only; no shared values
or custody values are read.

Evidence is limited to current project Preview settings and provider deployment
metadata. Selected-candidate equality, deployed-process flags and hosted-versus-
selected database equality remain unclaimed. No runtime flag, source behavior,
account, cohort, provider setting, deployment, build, installation or purchase
changed. Apple remains3/6 with I05 open; mobile release remains excluded.

## Verification and Brain impact

The private companion .test.mjs passed47 offline checks using fake provider
ports, with zero network/provider calls. Fixtures cover strict canonical
positive/negative identity, source fallback refusal, Sensitive catalog zero
value GETs/no value-equality or absence claim, readable catalog behavior,
branch selection, ambiguity, pagination refusal, secret elision, web-only case
scope and retained intent/request/deadline bounds. Original runner hash matches.
Receipt: /private/tmp/ewatrade-preview-web-followthrough-offline-2026-11-09.evidence.json.

Scoped documentation mapping, source references, links and diff are checked;
the immediately preceding offline doctor and unchanged core51tests/254assertions
plus QA-tooling types are reused for their actual scope. None accepts a live
web read or payment/lifecycle behavior.

Brain impact: local .brain/features/native-store-billing.md,
.brain/features/owner-wide-billing.md and .brain/tasks/in-progress.md.
