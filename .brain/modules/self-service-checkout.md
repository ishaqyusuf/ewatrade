
# Customer Self Service Checkout

Customer scans items → prepares cart → cashier verifies → customer pays.

When a scanned product has no active price, the customer cart should show a
price-loading state and let the customer keep shopping while an admin resolves
the price. When product catalog details are missing, the customer may be asked
to capture a product photo so the admin can resolve the item. If the admin
still cannot confirm the price, the item becomes unavailable with a clear
message: "Sorry, this product cannot be ordered yet because the price is not
resolved."

See `.brain/features/retail-ops-scan-price-resolution.md` for the missing-price,
unknown-product, photo-capture, admin-notification, and unavailable-item flow.

Planned entry optimization:
- On app launch, attempt to infer the active store from device geolocation.
- Require confirmation or fallback selection when location confidence is low.

States:

DRAFT
READY_FOR_VERIFICATION
VERIFIED
PAYMENT_PENDING
PAID

Scan resolution states:

PRICE_PENDING
CATALOG_PENDING
PRICE_RESOLVED
UNAVAILABLE_FOR_ORDER
