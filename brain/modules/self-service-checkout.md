
# Customer Self Service Checkout

Customer scans items → prepares cart → cashier verifies → customer pays.

Planned entry optimization:
- On app launch, attempt to infer the active store from device geolocation.
- Require confirmation or fallback selection when location confidence is low.

States:

DRAFT
READY_FOR_VERIFICATION
VERIFIED
PAYMENT_PENDING
PAID
