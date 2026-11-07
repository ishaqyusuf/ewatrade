# Android catalog navigation readiness

Started after explicit release freeze handback at `5d961377e`, in the current
main checkout. Apple owns its reviewer-environment/billing paths; this slice owns
only the Android smoke/sign-out flows and this diagnostic evidence. No product navigation,
authorization, API, billing policy or native dependency changed.

## Corrected failure interpretation

The failed `bf9bc356` journey's PNG visibly contains Home, Orders, create, Goods
and More. Its separately captured accessibility tree contains Home/Orders/More
but no `admin-tab-catalog`. Thus the earlier 'blank dock' report is not supported
by that screenshot. A subsequent current `uiautomator` tree contains the enabled
Goods control and its stable `admin-tab-catalog` ID. The failure is a missing
accessible target at the tap, not established permanent absence of the dock.

Original private artifact:
`.scratch/qa-release/artifacts/20fd40f2-dc8a-49b1-a016-bf351c0ca305`.
The PNG is copied outside the checkout under
`/private/tmp/ewatrade-android-bf9-navigation-failure/`; SHA256
`ace7804003124221efb8b2062aadf523d1b04938f5fce4dd2d9bac885ef8b5fe` matches.
The captured command waited only 2,886 ms before reporting Goods missing.
An offline hierarchy assertion reproduces that exact absent catalog target;
the same target is present in the later device tree. This bounds the observation
but does not establish the precise native timing cause or TalkBack acceptance.

Source confirms the catalog label can resolve from Catalog to Goods or Services
after feature availability loads. `AdminTabBar` already exposes the stable
catalog ID. No permission guard hides the catalog definition during that label
resolution. No speculative product patch was made to the dock/auth implementation.

## Focused repair

`.maestro/smoke.yaml` waits up to 60 seconds for `admin-tab-catalog`, then taps
that existing route control. The selected business, runtime identity, expected
catalog item, sale-draft amount/cancellation and sign-out assertions remain.
There is no coordinate tap, optional skip, sleep or fallback deep link. A missing
control still fails; a wrong catalog still fails the existing item assertion.

The minimized retry also exposed a deterministic Sign out harness failure:
Maestro reported the row 100% visible (bounds y1199–1238 on a 1616-high display),
but kept scrolling to center it at the menu's scroll limit and timed out.
Disabling centering alone was insufficient: the recovery run reported Sign out
at y1579–1616 as fully visible, tapped it, and opened Quick Create. The existing
confirmation assertion failed correctly. The final flow keeps centering disabled
and adds one ordinary downward scroll toward the menu end before tapping Sign out,
so the control moves above the fixed dock. It retains the visibility threshold,
60-second lookup deadline and normal sign-out confirmation. This is separate
from the catalog observation; no app navigation or menu implementation changed.

The launch command also passes `permissions: {}`. A bare Maestro launch defaults
to granting all permissions, contrary to this flow's existing preservation
comment. This behavior was visible in diagnostic logs and verified in installed
Maestro's Orchestra/AndroidDriver bytecode: only a null map supplies `all:allow`;
an empty map reaches no permission grant/revoke operation. Empty does not mean
`unset`/reset. App data and cold-launch behavior remain unchanged.
See [Maestro launch documentation](https://docs.maestro.dev/reference/commands-available/launchapp)
and [its command implementation](https://github.com/mobile-dev-inc/Maestro/blob/main/maestro-orchestra/src/main/java/maestro/orchestra/Orchestra.kt).
Earlier bare-launch diagnostics cannot prove refusal/first-permission behavior.

## Verification

- Offline doctor passes; no service/database setup was started.
- Owned `.maestro`/docs/log source plan maps to core, unknown paths zero.
  Final scoped fast check passes **50 tests / 237 assertions**, plus QA tooling
  types. This is source/workflow verification, not a native acceptance receipt.
- YAML parse confirms an explicit empty permission map and the bounded catalog
  readiness condition. Installed command/driver inspection verifies empty-map
  behavior without granting/revoking a permission to test it.
- Canonical `qa:smoke --target preview --surface android` correctly refuses the
  docs-only HEAD versus `bf9bc356` OTA mismatch. That new failed receipt was not
  promoted or rewritten, and the source identity gate was not relaxed.
- A bounded direct Maestro diagnostic uses the known build35/OTA identity and
  existing QA account/catalog. Its first attempt hit the earlier 60-second
  startup condition before reaching catalog; the app subsequently reached Home.
  This is not evidence that the catalog change failed or passed.
- A minimized retry starts from the running foreground app and retains normal
  sign-out, QA selection, exact on-screen OTA/build assertion and catalog-item
  assertion. Its first run failed on the evidenced Sign out centering condition;
  the next run failed its starting condition because Android displayed an app
  not responding dialog. Saved `last-anr.txt` reports input dispatch timeout
  (5,125 ms waiting for a MOVE event), timestamp 22:08:24 on 7 November. This
  occurred during the earlier scrolling attempt, before the centering repair
  could be exercised. This timing does not establish the cause of the ANR.
  Recovery used ordinary force-stop/reopen and dismissed the observed Android
  dialog through its Close app control; it did not clear app data or change
  permissions. Recovery reached the sign-out tap but failed its confirmation
  assertion with Quick Create visible, exposing the dock overlap described above.
  The final sign-out-only check passed (exit 0): menu scroll, Sign out tap,
  confirmation, confirmed sign-out and login-screen assertion. Artifacts are
  in `signout-final/` beneath the private diagnostic directory. It created no
  records and used ordinary session sign-out.
  These runs are diagnostic only: they omit cold launch and do not complete
  the full sale/billing smoke.

- Final catalog diagnostic matched the exact build 35 / Android update
  `01a1b7ac-21e8-784a-8d43-95e8b7db8470` on the build-details screen, returned to
  the chooser, and tapped the expected Jawdah Poultry QA OWNER profile. It then
  failed the unchanged `assertNotVisible: QA businesses` condition, before the
  new catalog wait/tap. Its captured hierarchy contains system status controls
  but no app controls; screenshot capture also failed. This does not establish
  whether the chooser visibly persisted, or whether app/automation responsiveness
  failed. Do not promote it to catalog success or label it a proven auth defect.
  Artifacts: `catalog-final/2026-11-07_221855/QA catalog and sale draft` beneath
  the private diagnostic directory. Catalog navigation is still unverified by
  this retry. No timeout increase or assertion bypass was added.

No sale/payment is submitted; no fixture, app-data clearing, developer deep-link
exception, release gate change, provider activation or deployment is included.
Native Production remains unreleased and Android paid acceptance stays 1/8.
The separate teen/store/billing gates still require their actual evidence.

Brain impact: local-only `.brain/features/mobile-dev-preview-qa-accelerator.md`
and `.brain/tasks/in-progress.md`; no schema/API/merchant capability changed.
The sole release coordinator must pin the next clean candidate and obtain a
matching Preview runtime receipt through the existing executor. A direct
diagnostic on the prior binary cannot be substituted for that receipt.
