# Validation Strategy

## Purpose
Track how EwaTrade validates product-market fit, assumptions, and feature bets before and during build.

---

## Core Hypothesis

> African merchants (starting with Nigeria) need a single platform that gives them a storefront, order management, dispatch coordination, POS, and customer communication — and they will pay for it if it is affordable, works offline, and integrates with WhatsApp.

---

## Validation Approach

EwaTrade is an infrastructure play. Validation must happen at two levels:
1. **Merchant demand** — will merchants pay and use this?
2. **Network effects** — does more merchants → more dispatch → more customers → more merchants?

---

## Stage 1 — Problem Validation (Pre-Build)

**Goal:** Confirm merchants have the pain, don't have good solutions, and would switch.

### Methods
- **Direct interviews**: 20–30 small business owners across Lagos (food/restaurant, fashion, pharmacy, logistics)
- **Shadow a merchant for a day**: watch how they take orders (WhatsApp screenshots, voice notes, manual notebooks, Excel)
- **Interview dispatch riders/companies**: how do they get jobs? WhatsApp groups, referrals, phone calls
- **Interview customers**: how do they discover local stores? How do they track orders?

### Key Questions To Answer
| Question | Validation Target |
|---|---|
| How do merchants currently manage orders? | Manual pain confirmed |
| Do merchants use any existing software? (QuickBooks, Excel, SimpleBooks) | Switching cost |
| How do merchants handle delivery today? | Dispatch pain confirmed |
| What do merchants pay monthly for current tools? | Willingness-to-pay range |
| Do merchants have WhatsApp Business? | Channel validation |
| Do customers expect delivery or pickup? | Fulfillment model fit |

### Success Signal
- 8/10 interviewed merchants say "I need this" or "I'd pay for this"
- At least 3 willing to be pilot customers

---

## Stage 2 — Solution Validation (MVP / Pilot)

**Goal:** Confirm that what we built solves the pain and merchants use it regularly.

### MVP Scope (Minimum Viable Product)
The smallest version of EwaTrade that delivers real value:
1. Merchant onboarding (business registration, store creation)
2. Product catalog + basic inventory
3. WhatsApp-linked order intake (manual order creation from WhatsApp messages)
4. Order management dashboard (status updates, fulfillment tracking)
5. Basic POS (cashier + receipt)
6. One dispatch provider integration (find rider, open bid)

Everything else (website builder, marketplace, AI WhatsApp bot, full self-service checkout) is Phase 2+.

### Pilot Program
- **Cohort size**: 5–10 pilot merchants in Lagos
- **Duration**: 8 weeks
- **Support**: founder-led onboarding, daily check-ins for first 2 weeks
- **Tracking metrics**:
  - Daily/weekly active merchants (DAM/WAM)
  - Orders processed per week per merchant
  - % orders from WhatsApp vs direct
  - Merchant NPS at week 4 and week 8
  - Churn: how many stopped using after first week?

### Success Signal
- ≥ 60% of pilot merchants still active at week 8
- Average ≥ 5 orders/week processed through the platform per merchant
- At least 2 merchants willing to pay before the pilot ends
- At least 1 organic referral (merchant tells another merchant)

---

## Stage 3 — Growth Validation (Post-PMF)

**Goal:** Confirm repeatable acquisition and retention.

### Metrics To Track
| Metric | Target (Month 3) | Target (Month 6) |
|---|---|---|
| Paying tenants | 20 | 100 |
| Monthly GMV (value of orders processed) | ₦10M | ₦100M |
| MoM tenant growth | 20% | 30% |
| Monthly churn (tenant) | < 10% | < 5% |
| Dispatch orders brokered | 200/mo | 2,000/mo |
| WhatsApp orders created | 50/mo | 500/mo |

---

## Key Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Merchants won't trust a new platform with their orders | Start with a free tier; founder-led onboarding builds trust |
| Offline POS is complex to ship fast | Ship basic web POS first; Tauri desktop app is Phase 5 |
| Dispatch network needs supply AND demand simultaneously | Start with 2–3 pre-vetted dispatch partners, not open marketplace |
| WhatsApp AI is technically hard | Start with manual WhatsApp-to-order flow; AI is overlay later |
| Merchants already use WhatsApp Business alone and it's "free" | Show the delta: inventory, order history, dispatch, customer records |
| Payment gateway CAC requirements block small merchants | Partner with Paystack directly; help merchants complete KYC |

---

## Validation Artefacts To Maintain
- `brain/startup/validation.md` (this file) — assumptions and evidence log
- Interview notes (linked from here when available)
- Pilot cohort tracking sheet (external)
- Weekly metrics snapshot (linked)
