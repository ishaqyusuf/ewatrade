# Apple reviewer workspace preparation — 8 November 2026

## Account and workspace

The owner completed email-code verification directly after the Production signup
email repair (`dafec2e0`, live receipt `331f5755`). The existing signup session
showed Account verified and resumed Business type. The approved reviewer workspace
was completed through the normal Production Dashboard flow: **EwaTrade Review**,
General store, one Main store, Nigeria, NGN, product sales. Optional location,
description and assistant-generated records were left empty. The Dashboard opened
successfully; no sale, payment or sample product was submitted.

A bounded lookup of only the approved reviewer identity confirmed email verified
and exactly one active Owner workspace. The immutable owner/Tenant IDs remain in
private local evidence for later server-side review allowlisting; no email-based
authorization or client privilege was added.

## Dedicated Free cohort

With owner billing still closed, ordinary signup assigned the historical active
Starter `owner_signup_launch` grant. This would mask a subsequent Sandbox purchase.
Only this newly created review workspace was prepared as a versioned Free cohort.

The bounded script first ran without a business-data write, retaining a private
backup of the original grant/metadata. Both dry run and application required the
captured immutable owner/Tenant IDs, exact approved reviewer email and verified
status, matching workspace name, creation within 24 hours, one Store and one
active Owner membership belonging to that user, zero durable owner billing
account/Tenant subscription/coverage rows, and zero catalog items. Any mismatch
aborts without a broader fallback.

Application used a Serializable transaction, exact Tenant row lock and
updatedAt/metadata compare-and-set. The existing `withOwnerSignupSubscription`
helper produced `billingPolicy=owner-subscriptions-v1` and
`subscription.planId=free`, source `owner_billing_free`, requested plan Starter.
All unrelated metadata was preserved; the original launch grant remains in the
private backup. Exactly one Tenant was updated. Canonical
`getRetailOpsTenantPlan` readback confirmed **Free / owner_billing_free** at
**14:04:32 WAT**. No purchased entitlement, provider receipt, subscription or
coverage was manufactured. Global billing/reviewer flags and webhook URLs were
not changed; ordinary workspaces were not rewritten.

Private operational script SHA-256:
`c9c9fc0ecb6a5d7ed29a1b8e247e2dafacbd11ca66e7784bbb9988128f3aa590`.
The script, original metadata, IDs and effective-plan evidence remain under
`/private/tmp`; they are not source changes or committed customer data. Concurrent
checkout-message source edits did not change the reused cohort/projection helpers.

## Reviewer password and Apple commercial recheck

The app uses verified email signup, so a dedicated password is needed for Apple to
sign in without the owner's inbox. One reset-link request was made for the
approved reviewer account. Resend marks **Reset your EwaTrade password** Delivered,
email `01a1bb44-822e-7489-98ef-3d2778c637b4`. The email body/reset link/password
was not read. The owner must choose and submit the password directly.

App Store Connect version 1.0.0's review form is prepared, **unsaved**, with the
approved reviewer email, existing Account Holder contact and workspace notes.
Its Password field is left for the owner to enter and save directly. No build is
selected or submitted, and no screenshot assets are claimed ready.

Fresh Business readback shows the Paid Apps Agreement **Active (New Agreement
Available)**. The Apps notice requires Account Holder acceptance of the updated
Paid Applications Schedule before updates, new IAP or submissions. This differs
from the Developer Program License accepted on 7 November. Bank and DSA remain
Active. The owner has a direct review/acceptance request; the agent accepted no
agreement. I01 is reopened until fresh acceptance readback, so **1/6 current
Apple milestones** is accepted (I02), superseding the prior 2/6 checkpoint.

## Validation and next steps

This is an operational reviewer setup, not a schema, API or application-code
change. Existing cohort/helper and signed-review source evidence is reused.
Focused checks are the actual signup/dashboard result, guarded dry run, exactly
one metadata application, canonical effective-plan readback and Resend delivery.
No additional fixture suites, native matrix, migrations or deployment were run.
Whitespace/staged ownership checks cover this documentation change.

Remaining: owner password setup, Apple review-form save and updated agreement
acceptance; controlled review identity/configuration and notification routing;
registered signed iOS candidate plus real Sandbox purchase/lifecycle acceptance;
truthful policy/privacy/store declarations, assets and first-version submission.
The earlier genuine TEST notification proves receiver delivery only. Sentry API
DSN/release provisioning is still separate and unchanged.

Local Brain owner-wide/native billing, BRAIN and task pointers are updated and
remain ignored. No schema or API contract documentation change is needed.
