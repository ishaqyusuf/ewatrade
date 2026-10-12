# Native receipt route review — A04 follow-up

Provisional coordinator source finding, not a reviewed or accepted native packet.
No emulator/device test was run. A04 remains pending; current native parity source
is in progress and its implementation owner retains responsibility for repairs.

The actual shared `generalReceiptSchema` accepts a payment receipt with its
`recordId` and no `orderId`. The current native `generalReceiptRoute` sends that
receipt to `/order/[orderId]` using the payment's record ID as an Order ID. The
probe returned `orderId: "exact-payment-record"`. That is a wrong-record fallback,
contrary to the new helper's stated exact-object behavior.

Require a canonically stored Order link for an Order route, or use the exact native
payment screen if available. A missing link must produce an explicit unavailable
result, preserving the saved receipt. Do not infer an Order from a payment ID,
substitute the latest Order, or widen the payment receipt's authority. Add the
affected missing-link regression; existing generic route tests always supply an
Order link and do not exercise this boundary.

Reproduction: `bun artifacts/assistant-operations-parallel/native-payment-route-review.ts`.
This uses the actual strict receipt parser and route helper with a synthetic value;
no database, credentials, business record, provider, native UI, auth, runtime,
push or deployment change occurred. The source issue predates the current default
fallback removal; A04's reopened exact-object acceptance must still cover it.

## Source repair revalidation

The implementation owner repaired the missing-link branch in the subsequent
[native catalog/order packet](2026-10-12-a04-native-catalog-order-changes.md).
The coordinator reran only the original failing probe against the current source:
the same schema-valid payment now returns `route: null`. This resolves the source
finding without inventing an Order link. Existing passing tests are reused.
Device navigation and the rest of A04 remain unaccepted.
