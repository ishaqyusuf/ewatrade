# Dispatch Network

## Dispatch Provider Types
- Individual riders (solo micro-tenant)
- Courier companies
- Fleet operators
- 3PL providers

## Capabilities
- Provider and driver onboarding
- Verification system (document review, approval)
- Service zones
- Open delivery bidding system
- Reputation / rating scoring
- Rider and driver management
- Dispatch management dashboard

---

## Open Bidding Model

When an order is ready for dispatch, a `DeliveryRequest` is created and **opened for public bidding**. Any verified dispatch provider or rider whose service zone covers the delivery area can place a bid.

```
Order READY
  └── DeliveryRequest created (open)
  └── Nearby verified dispatch providers / riders notified
  └── Providers submit bids (price, ETA)
  └── Merchant reviews bids OR auto-assigns by lowest price / best rating
  └── Winning bid accepted → Assignment created → DISPATCHED
  └── Merchant can also invite a specific provider directly (closed bid)
```

**Auto-assignment rules (configurable by merchant):**
- Lowest bid
- Fastest ETA
- Highest reputation score
- Preferred provider (merchant's saved preference)

---

## Find Dispatch

Merchants can also proactively search for a dispatch provider before an order is ready:
- Browse available providers in their area
- Filter by vehicle type, rating, price range
- Send a direct delivery request

Customers on the main site can also find local dispatch providers (for independent deliveries, not tied to an EwaTrade order).

---

## Onboarding Data

See full step-by-step flow: `brain/workflows/onboarding-flows.md`

### Logistics Company Onboarding

**Account (Step 1):** Full name, email, phone, password

**Company / Tenant (Step 2):**
- Company name, company type (courier / fleet operator / 3PL)
- CAC registration / license number (**mandatory**)
- Country, state, city, street address
- Company phone, company email

**Service Configuration (Step 3):**
- Service zones: cities/regions served
- Vehicle types: bicycle / motorcycle / car / van / truck (multi-select)
- Service types: same-day / express / scheduled / intercity (multi-select)
- Pricing model: per km / flat rate / weight-based
- Base price (minimum delivery fee)
- Max delivery distance (optional)

**Fleet Size (Step 4):** Estimated number of active riders/drivers

**Banking / Payout (Step 5):** Bank name, account number, holder name, type

**Verification Documents (Step 6):**
- CAC certificate (mandatory)
- Owner government ID (National ID / Passport / Driver's license)
- ID expiry date

---

### Individual Driver / Rider Onboarding

**Account (Step 1):** Full name, email, phone, password

**Personal Info (Step 2):**
- Date of birth (must be 18+)
- Home address: country, state, city, street
- Emergency contact name + phone
- Government ID type, ID number, ID expiry date

**Vehicle Info (Step 3):**
- Vehicle type: bicycle / motorcycle / car / van / truck
- Make, model, year, plate number, color

**Verification Documents (Step 4):**
- Government ID photo (front + back)
- Driver's license (front + back) — not required for cyclists
- Vehicle registration document — not required for bicycles
- Vehicle insurance document — not required for bicycles
- Proof of residence (utility bill or bank statement)

**Service Zone (Step 5):**
- Primary city / operating area
- Willing to do intercity: yes / no

**Banking / Payout (Step 6):**
- Bank name, account number, account holder name, account type

---

## Dispatch Management Dashboard

Available to logistics company owners and managers:

- **Driver roster**: list of all drivers (active, suspended, pending verification)
- **Live map**: real-time location of active riders (if location sharing enabled)
- **Delivery queue**: active delivery requests, bids submitted, assignments in progress
- **Performance reports**: deliveries per driver, average completion time, ratings
- **Invite driver**: send invite link to onboard a new driver into the tenant
- **Suspend/remove driver**: deactivate a driver's access

---

## Post-Onboarding States

### Company
- `Tenant` provisioned (type = `logistics`)
- `DispatchProvider` created under tenant
- `TenantSite` created (status = `draft`)
- `Membership`: owner → tenant, role = `logistics_owner`
- Status = `pending_verification` (limited access until documents reviewed)

### Driver (solo)
- `Tenant` provisioned (type = `logistics`)
- `DriverProfile` created under tenant
- Status = `pending_verification`; cannot receive bids until approved

### Driver (invited by company)
- `DriverProfile` created under the company's tenant
- `Membership` created, role = `driver`
- Status = `pending_verification`

---

## Verification Flow
1. Driver/company submits documents during onboarding
2. Platform admin reviews documents
3. Approved → status = `verified`; driver appears in dispatch network and can bid
4. Rejected → status = `rejected`; applicant notified with reason

---

## Reputation Scoring
- Per-driver rating accumulated from completed deliveries (customer rates delivery)
- Score affects bid visibility and platform trust badge
- Providers with score below threshold may be auto-excluded from certain order types
