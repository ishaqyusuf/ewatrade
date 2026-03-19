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
- Delivery bidding system
- Reputation / rating scoring

## Onboarding Data

See full step-by-step flow: `brain/workflows/onboarding-flows.md`

### Logistics Company Onboarding

**Account (Step 1)**
- Full name, email, phone, password

**Company / Tenant (Step 2)**
- Company name, company type (courier / fleet operator / 3PL)
- Registration / license number (optional at start)
- Country, state, city, street address
- Company phone, company email

**Service Configuration (Step 3)**
- Service zones: cities/regions served
- Vehicle types: bicycle / motorcycle / car / van / truck (multi-select)
- Service types: same-day / express / scheduled / intercity (multi-select)
- Pricing model: per km / flat rate / weight-based
- Base price (minimum delivery fee)
- Max delivery distance (optional)

**Fleet Size (Step 4)**
- Estimated number of active riders/drivers (individual profiles added later)

**Banking / Payout (Step 5)**
- Bank name, account number, account holder name, account type

**Verification Documents (Step 6)**
- Business registration certificate (upload)
- Owner government ID (National ID / Passport / Driver's license)
- ID expiry date

### Individual Driver / Rider Onboarding

**Account (Step 1)**
- Full name, email, phone, password

**Personal Info (Step 2)**
- Date of birth (must be 18+)
- Home address: country, state, city, street
- Emergency contact name + phone
- Government ID type, ID number, ID expiry date

**Vehicle Info (Step 3)**
- Vehicle type: bicycle / motorcycle / car / van / truck
- Make, model, year, plate number, color

**Verification Documents (Step 4)**
- Government ID photo (front + back)
- Driver's license (front + back) — not required for cyclists
- Vehicle registration document — not required for bicycles
- Vehicle insurance document — not required for bicycles
- Proof of residence (utility bill or bank statement)

**Service Zone (Step 5)**
- Primary city / operating area
- Willing to do intercity: yes / no

**Banking / Payout (Step 6)**
- Bank name, account number, account holder name, account type

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

## Verification Flow
1. Driver/company submits documents during onboarding
2. Platform admin reviews documents
3. Approved → status = `verified`; driver appears in dispatch network and can bid
4. Rejected → status = `rejected`; applicant notified with reason

## Reputation Scoring
- Per-driver rating accumulated from completed deliveries
- Score affects bid visibility and platform trust badge
