# WhatsApp Commerce

## Overview

WhatsApp is a first-class commerce channel on EwaTrade, operating at two levels:

1. **Platform-level bot** — the EwaTrade main WhatsApp number (AI assistant for any user)
2. **Store-level bot** — each merchant tenant has their own WhatsApp number (AI assistant for that store)

Both are powered by an AI assistant backed by the EwaTrade API.

---

## Level 1 — EwaTrade Platform Bot

The main EwaTrade WhatsApp number handles platform-wide queries.

### Supported Use Cases

#### Product Discovery
```
User: Where can I find Indomie near me?
Bot: Here are stores near you that sell Indomie:
  1. Mama Chidi's Store — Surulere, Lagos (2.3km away)
     👉 shop.mamachidi.ewatrade.com
  2. FoodHub — Yaba, Lagos (3.1km away)
     👉 foodhub.ewatrade.com
Would you like to order from any of these?
```

#### Image-Based Product Search
```
User: [attaches image of a pair of sneakers]
Bot: I found similar products on EwaTrade:
  1. Air Max replica — MikeShoes Store (₦12,500)
  2. Jordan 1 — Stepup Footwear (₦18,000)
Which would you like to explore?
```

#### Order Status (Cross-Store)
```
User: What is the update on my orders?
Bot: Here are your recent orders:
  📦 Order #1042 — Mama Chidi's Store
     Status: Out for delivery — Rider is 10 mins away
  ✅ Order #1038 — FoodHub
     Status: Delivered on March 17
```

#### Store Discovery
```
User: Open Mamtess Store
Bot: Here's Mamtess Store:
  🏪 Mamtess Fashion
  📍 Ikeja, Lagos
  🌐 mamtess.ewatrade.com
  📞 [clickable phone link]
  💬 [clickable WhatsApp link]
```

#### New Merchant / Driver Registration
```
User: I want to open a store on EwaTrade
Bot: Great! Click here to get started: ewatrade.com/register
     Choose "Store Owner" and follow the steps.
     It takes about 5 minutes. Need help? Just ask!
```

---

## Level 2 — Store-Level Bot

Each merchant tenant connects their own WhatsApp Business number to EwaTrade. The AI assistant is trained on their product catalog and store data.

### Supported Use Cases

#### Product Availability
```
Customer: Is chicken available?
Bot: Yes! We have:
  - Full chicken (1kg) — ₦4,500
  - Chicken thighs (500g) — ₦2,200
  - Grilled chicken (per piece) — ₦1,800
Would you like to order any of these?
```

#### Natural Language Order Creation
```
Customer: I need iyan x2, goat meat x1, ponmo x1, wara x1, with one bottle water

Bot: Got it! Here's your order summary:
  ✅ Pounded Yam (large) x2 — ₦3,200
  ✅ Goat Meat (1 wrap) x1 — ₦1,500
  ❌ Ponmo — Sorry, we're out of ponmo right now
  ✅ Wara (cheese) x1 — ₦500
  ✅ Water (50cl bottle) x1 — ₦200

  Subtotal (excl. ponmo): ₦5,400
  Would you like to proceed without the ponmo, or wait until we restock?
```

#### Handling Out-of-Stock
```
Customer: I want to proceed without the ponmo
Bot: No problem! Updated order:
  Pounded Yam x2, Goat Meat x1, Wara x1, Water x1
  Total: ₦5,400
  Delivery fee: ₦500
  Grand Total: ₦5,900

  [Add to Cart] [Checkout]
```

#### Substitution / Waiting
```
Bot: Sorry, we don't have iyan at the moment.
     It will be ready in about 1 hour.
     Currently available:
     - Eba, Semo, Fufu

     Would you like to:
     1. Order with a substitute
     2. Wait and we'll notify you when iyan is ready
     3. Order what's available now
```

#### Checkout Flow
```
Bot: Your cart is ready:
  [Order summary]
  Delivery to: [customer address]
  Payment: Pay online or cash on delivery

  [Checkout Now]
```

#### Packing & Dispatch Updates
```
Bot: 📦 Your order is packed and ready!
     Our dispatch rider is almost here to pick it up.

     [View Order Status] [Track Rider]
```

#### Dispatch Instruction (if not provided at checkout)
```
Bot: Your order is packed. How would you like to proceed?
  1. 🚴 Find a dispatch rider for me
  2. 🏠 I'll come pick it up
  3. 📞 Call the store
```

#### Order Tracking
```
Customer: Where is my order?
Bot: Your order #1042 is currently:
  📍 Rider picked up at 2:15pm
  🚴 En route — approximately 8 minutes away
  [View Live Map]
```

---

## Additional Chat Use Cases

### Store Hours Query
```
Customer: Are you open?
Bot: Yes, we're open! Hours today: 8am – 9pm
     Last order time: 8:30pm
```

### Promotion Inquiry
```
Customer: Any deals today?
Bot: Today's specials:
  🔥 Buy 2 wraps of goat meat, get 10% off
  🎉 Free delivery on orders above ₦5,000
```

### Complaint / Feedback
```
Customer: My order was wrong
Bot: So sorry to hear that! Let me get your order details.
     Please share your order number or I'll look it up now.
     [Escalate to human agent] [Continue with bot]
```

### Reorder
```
Customer: I want to order the same thing as last time
Bot: Your last order (March 15):
  - Pounded Yam x2, Egusi soup x1, Water x1 (₦4,800)
  Reorder this? [Yes, reorder] [Modify first]
```

---

## Technical Architecture

- WhatsApp Business API (Meta Cloud API)
- Each tenant has their own WhatsApp Business number linked to EwaTrade via webhook
- Platform bot uses EwaTrade's registered number
- AI model: Claude (Anthropic) with tool use (catalog lookup, order creation, tracking)
- Conversation state tracked in `Conversation` + `Message` entities
- Order sessions created in `DRAFT` from WhatsApp, confirmed when customer checks out

---

## Schema Entities

### `WhatsAppChannel`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenantId` | FK → Tenant | null for platform bot |
| `phoneNumberId` | string | Meta WhatsApp phone number ID |
| `wabaId` | string | WhatsApp Business Account ID |
| `isActive` | boolean | |
| `webhookSecret` | string | |

### `Conversation` (updated)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenantId` | FK → Tenant | |
| `channel` | enum | `whatsapp` \| `in_app` |
| `customerPhone` | string | |
| `userId` | FK → User | null if unregistered |
| `orderSessionId` | FK → Order | active order being built |
| `status` | enum | `open` \| `resolved` \| `escalated` |
