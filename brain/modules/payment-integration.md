# Payment Integration

## Core Principle

**EwaTrade holds no money.**

All customer payments flow directly to the merchant's registered bank account via payment gateway subaccounts. EwaTrade is not a payment aggregator, wallet, or escrow. EwaTrade's role is to facilitate the payment UX and optionally deduct a platform fee via split payment — not to custody funds.

---

## Recommended Payment Providers

### Primary — Paystack
- Best fit for Nigeria (NGN), excellent API, subaccount model
- Supports: card, bank transfer, USSD, mobile money
- Subaccount model: merchant registers their bank account → platform creates a Paystack subaccount → all payments to that merchant go directly to their subaccount
- Platform fee: configured as a split percentage per subaccount (e.g. 1.5% to EwaTrade platform account)
- Docs: paystack.com/docs

### Secondary — Flutterwave
- Broader Africa coverage: Ghana, Kenya, Rwanda, Uganda, South Africa
- Used when Paystack is not optimal in a given country
- Also supports subaccounts and split payments

### POS Payments
| Method | Provider |
|---|---|
| Cash | No gateway needed |
| Card (physical terminal) | Merchant's bank POS terminal (not integrated by EwaTrade — merchant uses their bank's terminal) |
| Mobile money / USSD | Paystack or Flutterwave |
| QR payment | Paystack (via QR on receipt) |

---

## Payment Flow (Online Storefront)

```
Customer adds to cart → initiates checkout
  → EwaTrade resolves merchant's PaymentGatewayAccount (subaccount ID)
  → Paystack Inline / Flutterwave modal initialized with:
      - amount
      - merchant subaccount ID
      - platform split (if applicable)
  → Customer pays
  → Paystack settles directly to merchant's bank account
  → Webhook received by EwaTrade
  → Order status updated to PAID
  → Merchant notified
```

---

## Multi-Store Checkout (Main Site)

When a customer checks out with items from multiple stores:
1. Cart is split by merchant tenant
2. A separate payment transaction is initiated **per merchant**
3. Each merchant's payment goes to their own subaccount
4. EwaTrade does NOT pool the funds — each transaction is independent

---

## Merchant Payment Setup

During merchant onboarding (Step 4 — Banking):
1. Merchant enters bank name, account number, account holder name
2. Platform calls Paystack API: `POST /subaccount` — creates a subaccount for that merchant
3. `PaymentGatewayAccount` record is created linking `Tenant → subaccount`
4. All subsequent payments for that tenant reference this subaccount

### `PaymentGatewayAccount` Entity
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenantId` | FK → Tenant | |
| `provider` | enum | `paystack` \| `flutterwave` |
| `subaccountCode` | string | Provider-assigned subaccount ID |
| `businessName` | string | As registered with provider |
| `settlementBank` | string | Bank name |
| `accountNumber` | string | |
| `percentageCharge` | decimal | Platform split % (0 if no fee) |
| `isActive` | boolean | |
| `createdAt` | datetime | |

---

## Dispatch Payment

- Delivery fees are paid by the customer at checkout as a separate line item
- Delivery fee goes directly to the dispatch provider's subaccount
- EwaTrade does not hold or pool delivery fees

---

## Refunds / Disputes

- EwaTrade does not process refunds on behalf of merchants
- Merchant is responsible for issuing refunds via their Paystack dashboard
- EwaTrade provides dispute support only: when a merchant is accused of fraud or non-delivery, EwaTrade provides the requesting authority with all available tenant information (see `brain/legal/legal-framework.md`)

---

## No-Wallet Policy

- EwaTrade does not maintain a customer wallet or merchant wallet
- No funds are stored on the EwaTrade platform
- EwaTrade does not earn float or interest on any funds
- Any future loyalty/points system uses non-monetary credits (points, not cash)

---

## Future Considerations
- BNPL (Buy Now Pay Later) via Paystack Bnpl or Carbon API
- Invoice-based B2B payments for bulk orders
- Escrow for high-value or disputed categories (optional, future)
