# Shared native Preview billing configuration proposal

9 November 2026. **Prepared for coordinator review, not approved or applied.**
One shared configuration proposal for Android and Apple ordinary Preview testing;
no separate per-flag approval sequence. Actual deployment/build/purchase steps
still require a final clean candidate and reviewed test case. Android1/8 remains.

**Android authoring handoff:** the known project identities and read limits below
are appended. This proposal is frozen for root/Apple finalization; Android will
not make overlapping edits or execute settings from this document. Root owns the
remaining shadow-inventory, final scope/test-case and execution review.

## Authoritative six-entry catalog replacement

Vercel team `ishaqyusufs-projects` (`team_BV5rgKHJH4fMyFL1YfscZIZK`), API project
`ewatrade-api` (`prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh`): replace only
`STORE_SUBSCRIPTION_PRODUCTS` with the exact UTF-8 bytes of
[native-preview-subscription-products.json](../billing/native-preview-subscription-products.json).
Keep type **Secret/sensitive**, target **Preview only**, no branch qualifier.
This covers all Preview branches for this project, not only a particular test
deployment. The file is 670 bytes, including its final newline, SHA256:

`b5d3e8653219f93202714728f832dca02f14ad45a9dfc0f9eef5801a1bb2dee1`.

This is an **authoritative replacement**, not a verified current-value merge.
Metadata and the normal protected pull both redact the existing sensitive value.
Its current equality, ordering and any additional entries remain unknown. Applying
this proposal would remove any unknown extra mappings. It does not mean the
existing variable is absent. Do not keep attempting value-recovery workarounds.

The proposed JSON contains exactly these six mappings and no other properties:

| Store | Product ID | Plan |
| --- | --- | --- |
| app_store | com.ewatrade.owner.starter.monthly | starter |
| app_store | com.ewatrade.owner.growth.monthly | growth |
| app_store | com.ewatrade.owner.pro.monthly | pro |
| play_store | com.ewatrade.owner.starter.monthly | starter |
| play_store | com.ewatrade.owner.growth.monthly | growth |
| play_store | com.ewatrade.owner.pro.monthly | pro |

The Apple subset exactly equals the accepted
[Apple source](../billing/apple-subscription-products.json); the Play subset
exactly equals the [Play source](../billing/play-subscription-products.json).
No prices are part of this mapping. Apple/Play store prices, product IDs,
territories and other product settings receive no provider write from it.

## Root's observed Preview metadata

Root's corrected, separate WEB-only read completed **19:28:41.153 UTC on
9 November 2026**. The original identity-check failure/case is preserved. Root
used the canonical verifier to establish both existing canonical Preview aliases
as owned and READY. Both returned raw `target=null`, branch `preview` and provider
source `b0e29c66dc663e781a46989c3415beecd94c2694`. Do not rewrite the raw target as
the literal string `preview` or infer a newer deployed source from current HEAD.
These are coordinator-reported metadata observations, not new reads by Android.

| Exact project | Observed project settings | Limits |
| --- | --- | --- |
| API `ewatrade-api` / `prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh` | `APP_ENV=preview` on branch `preview`; `DEV_PROFILE=preview` and `STORE_BILLING_ENABLED=true` without branch qualifier. `OWNER_BILLING_ENABLED` and `APP_STORE_REVIEW_SANDBOX_ENABLED` were not in the project list. | Store environment, public-checkout flag, Apple bundle and catalog were Sensitive/present/unreadable; no value GET was made. Apple IAP key/issuer/private-key and database custody were names/presence only. No value equality or missing-effective-setting claim follows. |
| Dashboard `ewatrade-dashboard` / `prj_KPSnNRftlTWRgW67OsnH2vUHzLYO` | `APP_ENV=preview` on branch `preview`; `BETTER_AUTH_URL` is the Preview Dashboard origin. `DEV_PROFILE`, owner/store/environment/reviewer/public-checkout settings were not in the project list. | `NEXT_PUBLIC_DASHBOARD_URL` was Sensitive on branch `preview`. Absence from this project list is not proof of absence from effective configuration. |

The first shared-variable metadata page was **incomplete**, with no matched
names. This does not prove shared settings absent. Retain project/branch/shared
shadow-inventory uncertainty before applying desired values; a global Preview
save may be overridden by a branch entry. Metadata does not establish the
promoted process's effective flags or equality with the inspected local Preview
database. No setting was changed by that read.

## Minimal ordinary Preview runtime settings

The table specifies desired values, not a claim that current values are missing
or equal. The coordinator's fresh hosted metadata/readiness review must resolve
the exact project/branch precedence and current native/backend candidate first.
Apply only the listed approved differences; keep secret values out of output.

| API Preview setting | Exact proposed value |
| --- | --- |
| OWNER_BILLING_ENABLED | true |
| STORE_BILLING_ENABLED | true |
| STORE_BILLING_ENVIRONMENT | sandbox |
| STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED | false |
| APP_STORE_REVIEW_SANDBOX_ENABLED | false |
| PLAY_PACKAGE_NAME | com.ewatrade.app |
| PLAY_NOTIFICATION_AUDIENCE | https://preview-api.ewatrade.com/webhooks/store/google |
| PLAY_NOTIFICATION_SERVICE_EMAIL | ewatrade-play-preview-rtdn@ewatrade-mobile-retail-ops.iam.gserviceaccount.com |

For these noncredential values use readable Config/encrypted project variables,
Preview only, no branch qualifier, after checking for existing conflicting
branch/shared entries. Do not create a second competing alias. `APP_ENV` and
`DEV_PROFILE` must already verify as `preview`; a mismatch stops the operation
instead of repairing an unknown target. The already approved Preview-only
Publisher Secret is reused in place, not uploaded again or forwarded elsewhere.

The same owner/store/environment and reviewer-disabled reader settings are
necessary in **Dashboard Preview** and the separate **Preview jobs project**
before multi-runtime paid/Free acceptance. Root owns the final reader scope:

- Dashboard: exact `ewatrade-dashboard` project
  `prj_KPSnNRftlTWRgW67OsnH2vUHzLYO`, in the same Vercel team above, Preview
  only. Desired reader values are `DEV_PROFILE=preview`,
  `OWNER_BILLING_ENABLED=true`, `STORE_BILLING_ENABLED=true`,
  `STORE_BILLING_ENVIRONMENT=sandbox`, and
  `APP_STORE_REVIEW_SANDBOX_ENABLED=false`. Use readable Config/encrypted
  project variables after root resolves branch/shared shadows. Preserve the
  observed `APP_ENV=preview` branch setting and existing origins. No product
  map or Publisher/Apple credential needs to be sent here.
- Jobs: only `proj_qxavabbrflnewutcortw` / `ewatrade-preview-fXYm`, provider
  environment `prod` within that isolated Preview project, never the Production
  project. Use normal selected-Preview sync, which sets `DEV_PROFILE=preview`,
  the four reader settings (`OWNER_BILLING_ENABLED=true`,
  `STORE_BILLING_ENABLED=true`, `STORE_BILLING_ENVIRONMENT=sandbox`,
  `APP_STORE_REVIEW_SANDBOX_ENABLED=false`) and explicitly clears the reviewer
  list to `[]`. Keep schedule mode and unrelated provider flags unchanged.

These reader additions are part of the same proposed operating change, not
authority to write now. The exact Dashboard identity is now bound by root's read;
before execution approval, root must finish shadow inventory, resolve desired
reader differences against actual readable/unreadable settings, and bind the final
release procedure/test case. That finalization remains open. Keep desired values
separate from current-value observations throughout review and execution.

## Effects, gates and execution order

Enabling these settings permits ordinary Sandbox owner subscription paths in
Preview; it is not restricted by the Production one-reviewer exception. Only
eligible, authenticated Preview accounts can use their existing authorization.
Do not copy the Production reviewer identity, change an existing owner's cohort,
add a manual grant, manufacture fixture records or let a launch-default legacy
plan mask downgrade results. The previously inspected QA business is not a valid
lifecycle purchase target; use a separately reviewed real-onboarding path.

No Apple IAP key/issuer/key ID, URLs, Production setting, web-payment gate,
legal publication, plan activation, Play RTDN switch or IAM grant is included.
The API catalog and eight settings are the bounded proposed write; Dashboard/
jobs readers must be finalized in the same root review before execution. A
configuration save alone does not update the promoted process or accept a test.

After approval, save only reviewed target settings, privately verify target/type/
value bindings through normal available methods, and use the normal exact clean
candidate release procedure. Because the catalog remains sensitive, a successful
save is write evidence rather than later readback equality. Preserve that limit;
subsequent runtime behavior must establish product availability. Keep public
Production checkout closed, Play plans Draft and Play RTDN off until their
separate exact controlled test steps are reviewed. Do not deploy dirty source.

## Validation

The existing strict server parser accepts all six entries, with unique store/
product identities and unchanged exact three-entry subsets. The committed file's
byte count/digest are the review binding, not an active runtime setting. No new
application interface, feature behavior or migration is implemented here.
Current signer/Publisher operational proof is in the
[readiness receipt](../verification/2026-11-09-play-signer-and-publisher-readiness.md).

The two-owned-path quick plan selects core with no unknowns. Its unchanged
51-test/254-assertion and QA-tooling pass from the immediately preceding signer
checkpoint is reused after checking relevant source differences. Fresh strict
catalog/subset/hash/byte assertions, JSON Biome, four relative links and whitespace
pass. Peer source changes are excluded; this is not whole-candidate acceptance.

Handoff addition: the one-owned-document quick plan also has no unknowns;
root's exact project/source/time/target and observation-limit bindings, unchanged
catalog digest, four links and whitespace pass. The prior 51/254 and QA-tooling
pass is reused after confirming the relevant sources remain unchanged. No
connected read, schema work or runtime write was added for this handoff.
