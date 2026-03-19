# Order Management

## Scope
Covers all order creation, fulfillment, and lifecycle management for merchant stores.

---

## Order Sources

Orders can originate from multiple channels:

| Source | Description |
|---|---|
| **Storefront (online)** | Customer shops on tenant site, checks out |
| **Main site multi-store checkout** | Customer checks out from main EwaTrade site; order split by store |
| **WhatsApp commerce** | Customer orders via WhatsApp chat; AI creates order session |
| **POS terminal** | Cashier creates order on POS for walk-in customer |
| **Walk-in self-service** | Customer scans items, cashier verifies, customer pays via app |
| **Manual order** | Merchant staff creates order manually from dashboard |

---

## Order Lifecycle

```
DRAFT
  → CONFIRMED       (payment received or manually approved for COD)
  → PROCESSING      (merchant packing / preparing)
  → READY           (packed, waiting for pickup or dispatch assignment)
  → DISPATCHED      (assigned to a rider, en-route)
  → DELIVERED       (confirmed received)
  → COMPLETED       (closed)

Alternative branches:
  CONFIRMED → CANCELLED (by merchant or customer before processing)
  DISPATCHED → FAILED_DELIVERY (rider couldn't deliver)
  COMPLETED → DISPUTED (customer dispute raised post-delivery)
```

---

## Manual Order Creation

Merchant staff can create an order directly from the dashboard without the customer going through the storefront.

**Use cases:**
- Phone orders (customer calls in)
- WhatsApp orders that weren't processed automatically
- Bulk orders from B2B customers
- Corrections to a previous order

**Fields required:**
| Field | Notes |
|---|---|
| Customer name | Look up from TenantCustomer or create new |
| Customer phone | |
| Customer email | Optional |
| Delivery address | Or mark as "walk-in / pickup" |
| Order items | Select products/variants + qty from catalog |
| Delivery method | Pickup / own delivery / dispatch network |
| Payment method | Paid online / cash on delivery / bank transfer |
| Payment status | Paid / pending / partial |
| Notes / instructions | e.g. "no onions", "call before arrival" |

**After creation:**
- Order created in `CONFIRMED` or `DRAFT` state depending on payment status
- Staff can immediately move to `PROCESSING`
- If dispatch is needed, a `DeliveryRequest` is created and opened for bidding

---

## Order Fulfillment Flow

```
Order CONFIRMED
  └── Merchant receives notification
  └── Staff reviews order → marks PROCESSING (begin packing)
  └── Packing done → marks READY

  If delivery required:
    └── DeliveryRequest created
    └── Open for dispatch bids (see dispatch-network.md)
    └── Bid accepted → Assignment created → status → DISPATCHED
    └── Rider picks up → tracking begins
    └── Rider delivers → status → DELIVERED
    └── Customer confirms → COMPLETED

  If self-pickup:
    └── Customer notified order is ready
    └── Customer picks up → staff marks DELIVERED → COMPLETED

  If own delivery:
    └── Merchant's own staff delivers
    └── Staff marks DELIVERED → COMPLETED
```

---

## Packing & Fulfillment Notifications

When an order is ready to ship and no dispatch instruction was given at checkout, the customer receives a prompt:

> "Your order is packed and ready. How would you like to proceed?"
> - 🚴 Find a dispatch rider for me
> - 🏠 I'll pick it up myself
> - 📞 Contact store

This applies to both storefront orders and WhatsApp orders.

---

## Order Splitting (Multi-Store Checkout)

When a customer checks out from the main EwaTrade site with items from multiple stores:
1. The cart is split into sub-orders per merchant tenant
2. A separate `Order` record is created for each merchant
3. Separate payment transactions are initiated per merchant (see `payment-integration.md`)
4. Each merchant receives and fulfills their own sub-order independently
5. Customer sees all their orders in one unified "My Orders" view

---

## Order Management Dashboard (Merchant)

Features visible to merchant staff:

- **Order queue** — filterable by status, date, channel, delivery method
- **Order detail** — line items, customer info, delivery address, payment status, timeline
- **Status transitions** — manual status updates with optional note
- **Dispatch control** — open order for dispatch / assign to specific dispatch provider
- **Manual order creation** — create order from scratch (see above)
- **Order notes** — internal notes per order (not visible to customer)
- **Print receipt / packing slip** — for physical packing

---

## Schema Additions

### `Order` (updated fields)
| Field | Type | Notes |
|---|---|---|
| `source` | enum | `storefront` \| `main_site` \| `whatsapp` \| `pos` \| `manual` \| `walkin` |
| `fulfillmentMethod` | enum | `delivery` \| `pickup` \| `own_delivery` |
| `paymentMethod` | enum | `online` \| `cash_on_delivery` \| `bank_transfer` \| `pos_terminal` |
| `staffNotes` | string | Internal notes |
| `parentOrderId` | FK → Order | null for root; set for split sub-orders |

### `OrderStatusEvent`
| Field | Type | Notes |
|---|---|---|
| `orderId` | FK → Order | |
| `fromStatus` | string | |
| `toStatus` | string | |
| `actorId` | FK → User | staff or system |
| `note` | string | optional |
| `occurredAt` | datetime | |
