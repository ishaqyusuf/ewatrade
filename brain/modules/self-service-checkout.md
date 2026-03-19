# Customer Self-Service Checkout

## Overview
Customer uses the EwaTrade mobile app to scan items in-store and check out at the counter — reducing queue time and enabling a frictionless retail experience.

Full flow is documented in `brain/modules/pos-cashier.md` (Flow B — Customer Self-Service QR Checkout).

---

## States

```
SCANNING              — customer scanning items in-store via app
READY_FOR_SCAN        — customer at counter, showing QR code
CASHIER_REVIEW        — cashier verified cart on POS screen
APPROVED              — cashier approved, customer sees Pay Now
PAYMENT_PENDING       — customer on payment screen in app
PAID                  — payment confirmed
COMPLETED             — receipt issued, order closed
CANCELLED             — session abandoned or cashier cancelled
```

---

## Key Interactions

| Actor | Action |
|---|---|
| Customer (app) | Scans barcodes, reviews cart, shows QR at counter, selects tip, pays |
| Cashier (POS) | Scans customer QR, reviews cart on POS screen, approves or corrects, confirms |
| Customer display (2nd screen) | Mirrors cart, shows total, shows payment status |

---

## Rules

- Each self-service scan session is tied to a unique QR code (expires after 30 minutes of inactivity)
- Cashier can add or remove items from the customer's cart during the review step
- Customer cannot bypass cashier approval — payment is only unlocked after cashier approves
- Tip is optional; defaults to 0%
- If customer closes the app before paying, the session remains open for 10 minutes and can be resumed by scanning QR again at counter
