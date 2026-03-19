# POS and Walk-In Cashier

## Overview
Supports physical store sales through a POS system and multiple walk-in customer flows.

For the full POS desktop software specification (Tauri, offline mode, dual-screen, import), see `brain/modules/pos-software.md`.

---

## Core Features

- Barcode scanning (USB scanner or camera)
- Walk-in orders
- Cashier sessions
- Receipt generation (print + digital)
- Stock deduction on sale
- Customer lookup and attachment
- Cash drawer management

---

## Walk-In Customer Flows

### Flow A — Cashier-Assisted (Standard)

1. Walk-in customer arrives at counter
2. Cashier creates a new order on the POS
3. Cashier scans or searches items
4. Cashier sets payment method (cash, card, USSD)
5. Customer pays
6. Receipt printed or sent digitally

### Flow B — Customer Self-Service QR Checkout (App-Assisted)

A customer uses the EwaTrade mobile app to self-scan items while in-store, then finalises at the counter.

#### Full Flow:

```
1. Customer opens EwaTrade app → "In-Store Scan" mode
2. Customer walks around the store scanning item barcodes via phone camera
   - Each scan adds the item to their in-app cart
   - Customer sees running total in real-time on their app

3. Customer finishes shopping → goes to the counter
4. Customer shows their app QR code (unique per session)
5. Cashier scans the customer's QR code using the POS primary screen
   - Customer's cart appears on the cashier's screen
   - Secondary (customer) display mirrors the cart

6. Cashier reviews and verifies:
   - Confirms items and quantities are correct
   - Checks for items that may not have been scanned (visual check)
   - Can add/remove items from the cart if needed

7. Cashier approves the order
8. Customer's app updates:
   - Shows order summary
   - "Pay Now" button appears
   - Optional tip selection (e.g. 0%, 5%, 10%, custom)

9. Customer taps "Pay Now" → pays via app (Paystack / Flutterwave)
10. Both screens show "Order Complete"
11. Digital receipt sent to customer's app + optionally via WhatsApp/email
```

#### States for Self-Service QR Order:
```
SCANNING          — customer adding items via app
READY_FOR_SCAN    — customer ready at counter (QR displayed)
CASHIER_REVIEW    — cashier reviewing cart on POS
APPROVED          — cashier approved, waiting for customer payment
PAYMENT_PENDING   — customer on payment screen
PAID              — payment confirmed
COMPLETED         — receipt issued
CANCELLED         — session abandoned or cancelled by cashier
```

---

## Tip Feature

At the payment step, customer optionally selects a tip:
- Preset options: 0%, 5%, 10%, 15%
- Custom amount option
- Tip amount shown clearly on screen
- Tip is added to the payment total
- Tip is tracked per order and per cashier session

---

## Walk-In Customers Without an App Account

If the customer has no EwaTrade account:
- Cashier can create an anonymous `TenantCustomer` record (name + phone)
- Standard Flow A is used (cashier-assisted)
- After purchase, customer is optionally prompted to register (link shown on digital receipt or printed on slip)

---

## Cashier Session

| Event | Description |
|---|---|
| Open session | Cashier clocks in, enters opening float (cash in drawer) |
| Process sales | All orders tagged to this session + cashier |
| Park order | Hold an order mid-session, resume later |
| End session | Cashier counts cash, system reconciles against recorded sales |
| Session report | Sent to merchant dashboard: total sales, by payment method, cashier name, discrepancy flag |

---

## Integration Points

- **Inventory**: stock decremented on order completion (POS or online)
- **Customer identity**: order linked to `TenantCustomer` (walked-in or looked up)
- **Payments**: cash recorded locally; USSD/card requires connectivity (queued if offline)
- **WhatsApp**: digital receipt can be sent via WhatsApp after POS sale
- **Order management**: all POS orders appear in the merchant's order management dashboard
