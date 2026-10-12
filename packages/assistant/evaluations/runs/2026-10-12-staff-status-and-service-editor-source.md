# Staff status/global object and bounded service editor source integration

12 October 2026. S03 and D04 remain partial, planned and unbookmarked; accepted
13/45 (28.9%) unchanged. This checkpoint contains no signed status command, saved
status fixture, model/provider, rollout activation, API restart or mobile work.

## S03 implemented behavior

Strict staff_status action carries selected membership, active/suspended intent,
current access revision and required reason. App review loads the current revision
server-side; no typed IDs/revision JSON is required from the merchant. Three
planned dashboard capabilities reuse current native Owner/Admin authority; native
LEGACY Manager status policy is preserved. The adapter reuses one locked prepared
canonical writer and returns the original lifecycle event as its receipt identity.
GENERAL confirmation/idempotency continues owning atomic execution and replay.

Protected retailOps.staffStatusReview and staffStatusReceipt derive actor/Tenant
from auth. Original role/status/reason/time/actor reference remains separate from
current same-business identities and membership. Removed grants are not restored,
and unaccepted invitations cannot be activated through reactivation.

The two-field editor fixes the selected person, shows current access and whole-
business impact, fetches a fresh review on Save and requires separate app confirm.
Changing intent withholds the old review impact until re-review. Global SheetFrame,
header/content, strict Open and shared sibling transitions keep the current route.
staffStatusEvent owns original-event identity; the existing staffStatus directory
filter is unaffected. Pending/fetching/paused/errors withhold protected data.

Six focused registration/parser/refusal/coverage tests pass, 53 assertions. Actual-
source scoped TypeScript and changed-file formatting pass. Existing prepared/native
source evidence is reused for unchanged paths; no repeat connected status suite.

Desktop verification used production components with explicitly synthetic review
and event projections on a temporary exact-QA-owner dashboard route. Empty reason
refuses; valid edited fields contain only status/reason. Changing status shows fresh-
review guidance. Paused/unavailable states withhold current identities and disable
Save; retry returns the source view. The original suspension and later current
active membership are shown separately. Actual registered unavailable receipt
Open/Close retains URL conversation selection, existing staffStatus filter and
unsent local draft. Malformed event target shows invalid-link state. Temporary
route and agent-created tab were removed. This is not saved GENERAL chat or fresh
successful native receipt/confirmation proof; the source preview's edited-fields
callback does not impersonate a completed server re-review.

Ignored screenshots under artifacts/assistant-operations-web:
s03-status-editor.jpg, s03-status-original-receipt.jpg,
s03-status-reason-validation.jpg, s03-status-global-unavailable.jpg,
s03-status-close-continuity.jpg and s03-status-invalid-link.jpg.
Original/current screenshots were inspected. Source preview copies are retained
as s03-status-source-page.tsx and s03-status-source-preview.tsx.

Remaining S03 gates: actual signed completion/refusal/recovery, accepted-membership
reactivation/plan/grant matrix, lock concurrency/offline revocation and saved web.

## D04 bounded editor prerequisite

The protected serviceAssistantIntake.options query reuses the existing strict
query/cursor/offeringAfter helper, namespaced native catalog/services reads and
current-Store eligible assignees. It returns one 20-item catalog page with bounded
100-Offering continuation. The editor replaces unbounded catalog/Tenant-wide staff
reads with search/first/next controls; only explicit selections are retained across
pages and scoped by current Tenant/Store/membership. Original off-page or missing
assignee identities stay explicit and cannot silently become another selection.
Pending/fetching/paused/error and wrong-Store responses withhold cached choices,
customer names and draft fields; unavailable selections prevent Save.

Child source evidence reused: 4 top-level tests/13 assertions (three helper tests
and isolated actual-view fixture), changed six-file TypeScript zero diagnostics,
Biome and whitespace pass. Nested fixture checks are not added to the top-level
count. No connected/browser acceptance was run for this new options loader.
Canonical four-case v4 and prior 32-domain-test evidence remain unchanged and were
not rerun. Existing planned options capability maps the new read-only route;
registered coverage is regenerated. Scoped-Manager write remains closed. Signed,
saved web, Finance-backed initial payment and reminders remain separate gates.

Brain impact: staff-status feature/implementation plan, API contracts/endpoints/
permissions, task progress and parallel delivery plan updated; D04 feature/source
plan updated by its owning chat. No schema/database structure change.
