# Shared native Preview billing configuration proposal

9 November 2026. **Prepared for coordinator review, not approved or applied.**
One shared configuration proposal for Android and Apple ordinary Preview testing;
no separate per-flag approval sequence. Actual deployment/build/purchase steps
still require a final clean candidate and reviewed test case. Android1/8 remains.

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

- Dashboard: verify exact `ewatrade-dashboard` project identity and Preview
  selection through the canonical release verifier. Reuse the verified Preview
  profile; no product map or Publisher/Apple credential needs to be sent here.
- Jobs: only `proj_qxavabbrflnewutcortw` / `ewatrade-preview-fXYm`, provider
  environment `prod` within that isolated Preview project, never the Production
  project. Use normal selected-Preview sync, which sets `DEV_PROFILE=preview`,
  the four reader settings (`OWNER_BILLING_ENABLED=true`,
  `STORE_BILLING_ENABLED=true`, `STORE_BILLING_ENVIRONMENT=sandbox`,
  `APP_STORE_REVIEW_SANDBOX_ENABLED=false`) and explicitly clears the reviewer
  list to `[]`. Keep schedule mode and unrelated provider flags unchanged.

These reader additions are part of the same proposed operating change, not
authority to write now. Before seeking execution approval, root must finish the
current web identity/configuration audit and bind exact Dashboard identity,
reader differences and final release procedure. That review is still open.

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
