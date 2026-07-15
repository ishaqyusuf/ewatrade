
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

Implemented entry optimization:
- On app launch, the POS/self-service surface can request browser geolocation and call `POST /api/self-service/store-detection/resolve`.
- The resolver reads enabled store detection settings from `Store.metadata.retailOps.selfServiceDetection`, ranks nearby enabled stores by distance/confidence, and returns `confirmed`, `needs_confirmation`, or `manual_required`.
- The customer-facing launch panel always requires customer confirmation before continuing with a detected store and provides a manual store-code fallback when geolocation is denied, unavailable, or low confidence.

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
