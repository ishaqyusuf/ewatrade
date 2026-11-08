# iOS billing entry points — 8 November 2026

Apple remains **2/6**. Owner testing of build8 reached Free plan, usage and AI
usage but no upgrade controls. This exposed a source-routing defect, not a need
for another customer account. No purchase or paid acceptance occurred.

## Cause and correction

Metro prefers `.ios.tsx` over `.native.tsx`. Both iOS billing entry modules still
contained Android-only launch stubs: provider returned children with null context,
panel returned null. The enabled native release scope and linked IAP binary could
not override those explicit iOS modules. Earlier direct `.native` fixture tests
and artifact linkage checks did not exercise this entry path.

The existing iOS provider now re-exports StoreSubscriptionProvider and
useStoreSubscription from the shared native implementation. The iOS panel now
re-exports the shared native panel. No duplicate UI/provider or new feature flag.
Existing paid scope, native module, authenticated Owner/business, session/cache
fences, fresh server catalog/legal and purchase-binding gates remain authoritative.
The disabled-scope fixture explicitly mocks softwarePlanPurchases=false; its
meaning is independent of the current paid-launch scope.

## Verification and limits

An additional isolated wrapper imports actual `.ios` entries, runs the18 existing
controller cases and renders the real shared native panel within that provider.
It checks owner catalog, localized monthly offer and restore/manage controls with
no checkout. The old iOS stubs fail all19 cases; direct re-exports pass. Existing
shared controller, disabled-scope and coverage wrappers remain passing: four root
wrappers total, including19 iOS,18 shared,4 coverage and1 disabled-scope cases.
Mocked native/server/host-render evidence is not actual StoreKit or device proof.

No native capability/permission or server/schema change is needed for these
entry-point exports. The separate signed callback correction is224e6be99. Root's
local Preview wait for that commit was interrupted130 after its provider builds
were accepted; external Vercel builds were not cancelled. No Production224 rollout
or callback URL change occurred. Combine source into the next clean candidate
and use normal Preview/API→matching web smoke→Production gates.

Private Production TestFlight OTA is prohibited; keep that guard intact. Build9
must be compiled/uploaded and inspected, then the owner installs it and repeats
visible product, password, Sandbox purchase/restore and lifecycle checks. Build8
is superseded for paid testing; it may be used for login only. No public checkout,
App Review submission or private-purchase acceptance is granted by this fix.

Assistant impact remains form-only through existing canonical billing commands;
no new permission, procedure or entitlement authority. Brain feature/task/current
pointers updated locally; prior database/verification evidence retains its limits.

Final source checks: full mobile TypeScript passed with16GB heap; own nine-path
fast smoke passed284/1813 plus tooling types/Biome and zero unsupported mapping;
H02 passed with no capability/procedure changes. Four isolated wrappers passed
with their existing/native/iOS child cases as above. H01 unchanged800/604 is reused
from the immediately preceding callback correction because no merchant API or
assistant manifest changed. No extra device/viewport/theme matrix was run.
