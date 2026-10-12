# A04 native catalog/order editor source review — device acceptance open

Reviewed the six-action editor packet and its current callers. This is a source
checkpoint, not mounted or device proof. The implementation agent's 13 native
assistant tests / 68 assertions and affected type diagnostics are reused; no
broad tests or compiler were rerun.

- Price uses existing MoneyField and shared minor-unit conversion, with the
  shared action schema validating the candidate. Copy states all-Store price
  effect; availability copy states current-Store effect.
- Details and identifiers retain undefined/keep versus null/clear. Metadata
  provides keep/remove/set choices, a native date/time picker and an exact ISO
  candidate. A different customer still requires resolution through chat; the
  editor offers only the originally drafted customer.
- Save goes through the existing `assistant.editProposal` mutation and fresh
  server review. The editor is keyed by proposal ID/revision. Confirmation remains
  disabled without a current token or after expiry. New edit fields do not call
  canonical business commands directly.
- Cancellation contains a reason and no refund action. Unknown receipt kinds
  return no route; the previously reproduced payment-ID-as-Order-ID fallback was
  repaired and independently revalidated in the payment review.
- Offline/scope guards, cache behavior and original-object return depend on the
  existing hook/navigation. Their presence in source does not certify keyboard,
  large-text, mount/unmount, role, reload or background behavior.

Native setup observation: the existing Android Studio Device Manager shows
GreenTill API34 as a stopped virtual device. AX focus of the list succeeds, but
the visible Play control's coordinate action fails with `noWindowsAvailable`.
No emulator launched; no app build or native assistant journey was exercised.
Do not count that setup observation as device acceptance. No user-owned process,
device, account or settings was stopped or changed.

![Device Manager observation, not a native assistant test](../../../../artifacts/assistant-operations-parallel/A04/device-manager-launch-unavailable-v1.jpg)

Actual device gates remain: current build visibility, Owner/Manager/Cashier
journeys, exact original objects and same-chat return, fresh edited/expired review,
offline and scope-switch fences, keyboard and large text, persisted confirmation
and recovery. The parent A04 also needs native coverage beyond these six actions.
No additional accepted bookmark; the full 45-ticket objective remains open.
