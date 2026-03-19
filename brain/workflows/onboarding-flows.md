# Onboarding Flows

## Purpose
Define the step-by-step onboarding flow and every data field collected for each actor type on the platform.

## Actor Types

- Store Owner (Merchant)
- Logistics / Dispatch Company
- Individual Driver / Rider
- Customer

All onboarding begins from `ewatrade.com` ("Register to Get Onboard"). The visitor selects their role first, then proceeds through a role-specific flow.

---

## 1. Store Owner (Merchant)

Provisions a merchant `Tenant` and the first `Store` in one onboarding session.

### Step 1 — Account Registration
| Field | Required | Notes |
|---|---|---|
| Full name | Yes | |
| Email address | Yes | Becomes login credential |
| Phone number | Yes | |
| Password | Yes | Min 8 chars |

### Step 2 — Business Setup (provisions Tenant)
| Field | Required | Notes |
|---|---|---|
| Business name | Yes | Becomes tenant display name |
| Business type | Yes | Sole proprietor / Partnership / LLC / Other |
| Business registration number | No | Optional at start; required for verified badge |
| Country | Yes | |
| State / Region | Yes | |
| City | Yes | |
| Street address | No | |
| Business phone | No | May differ from personal phone |
| Business email | No | May differ from personal email |
| Tax ID / VAT number | No | Jurisdiction-dependent |

### Step 3 — First Store Setup
| Field | Required | Notes |
|---|---|---|
| Store name | Yes | |
| Store slug | Yes | Auto-suggested from name, editable → `{slug}.ewatrade.com` |
| Store description (short) | Yes | Tagline, max ~120 chars |
| Store description (long) | No | Full about text |
| Store category | Yes | Fashion / Electronics / Food / Beauty / Home / Other |
| Store logo | No | Image upload; recommended |
| Store cover image | No | Image upload |
| Store contact email | No | Public-facing contact |
| Store phone number | No | Public-facing contact |
| Physical address | No | For pickup or walk-in orders |
| Default currency | Yes | |
| Operating hours | No | Per-day open/close times |

### Step 4 — Payout / Banking
| Field | Required | Notes |
|---|---|---|
| Bank name | Yes | |
| Account number | Yes | |
| Account holder name | Yes | |
| Account type | Yes | Savings / Current |

### Step 5 — Delivery Preferences
| Field | Required | Notes |
|---|---|---|
| Delivery method | Yes | Own delivery / EwaTrade dispatch network / Both |
| Supported delivery zones | No | Cities or regions shipped to |
| Free shipping threshold | No | Order value above which shipping is free |

### Step 6 — Storefront / Website
| Field | Required | Notes |
|---|---|---|
| Site template | No | Choose from merchant template set |
| Primary brand color | No | Optional at onboarding |
| List on marketplace | Yes | Yes / No |

**Post-onboarding state:**
- `Tenant` created, type = `merchant`
- `Store` created, status = `active` (draft products)
- `TenantSite` created, status = `draft`
- `Membership` created: owner → tenant, role = `merchant_owner`
- Redirect → tenant dashboard

---

## 2. Logistics / Dispatch Company

Provisions a logistics `Tenant`. Drivers are added post-onboarding.

### Step 1 — Account Registration
Same as Merchant Step 1.

### Step 2 — Company Setup (provisions Tenant)
| Field | Required | Notes |
|---|---|---|
| Company name | Yes | Becomes tenant display name |
| Company type | Yes | Courier company / Fleet operator / 3PL provider |
| Registration / license number | No | Optional at start; required for verified badge |
| Country | Yes | |
| State / Region | Yes | |
| City | Yes | |
| Street address | No | |
| Company phone | Yes | |
| Company email | No | |

### Step 3 — Service Configuration
| Field | Required | Notes |
|---|---|---|
| Service zones | Yes | Cities / regions served; map-select or text list |
| Vehicle types available | Yes | Bicycle / Motorcycle / Car / Van / Truck (multi-select) |
| Service types offered | Yes | Same-day / Express / Scheduled / Intercity (multi-select) |
| Pricing model | Yes | Per km / Flat rate / Weight-based |
| Base price (min charge) | Yes | Minimum delivery fee |
| Max delivery distance | No | Optional cap in km |

### Step 4 — Fleet Size (estimate)
| Field | Required | Notes |
|---|---|---|
| Number of active riders / drivers | Yes | Rough estimate; individual profiles added later |

### Step 5 — Payout / Banking
Same as Merchant Step 4.

### Step 6 — Verification Documents
| Document | Required | Notes |
|---|---|---|
| Business registration certificate | Yes | Upload (PDF / image) |
| Owner government ID | Yes | National ID / Passport / Driver's license |
| ID expiry date | Yes | |

**Post-onboarding state:**
- `Tenant` created, type = `logistics`
- `DispatchProvider` created under tenant
- `TenantSite` created, status = `draft`
- `Membership` created: owner → tenant, role = `logistics_owner`
- Status = `pending_verification` until documents reviewed
- Redirect → tenant dashboard (limited access until verified)

---

## 3. Individual Rider / Driver

Two entry paths:
- **A — Invited by a logistics company:** receives invite link, joins existing tenant
- **B — Solo / independent:** self-onboards as a solo dispatch micro-tenant

Solo flow documented below. Invited flow follows Steps 1–2 then jumps to company's tenant.

### Step 1 — Account Registration
Same as Merchant Step 1.

### Step 2 — Personal Info
| Field | Required | Notes |
|---|---|---|
| Date of birth | Yes | Must be 18+ |
| Home address (country, state, city, street) | Yes | |
| Emergency contact name | Yes | |
| Emergency contact phone | Yes | |
| Government ID type | Yes | National ID / Voter's card / Passport |
| Government ID number | Yes | |
| ID expiry date | Yes | |

### Step 3 — Vehicle Info
| Field | Required | Notes |
|---|---|---|
| Vehicle type | Yes | Bicycle / Motorcycle / Car / Van / Truck |
| Vehicle make | Yes | Honda, Bajaj, Toyota, etc. |
| Vehicle model | Yes | |
| Vehicle year | Yes | |
| Plate number / registration | Yes | (Not required for bicycles) |
| Vehicle color | Yes | |

### Step 4 — Verification Documents
| Document | Required | Notes |
|---|---|---|
| Government ID photo — front | Yes | Upload |
| Government ID photo — back | Yes | Upload |
| Driver's license — front | Yes | Upload (not required for cyclists) |
| Driver's license — back | Yes | Upload (not required for cyclists) |
| Vehicle registration document | Yes | (Not required for bicycles) |
| Vehicle insurance document | Yes | (Not required for bicycles) |
| Proof of residence | Yes | Utility bill or bank statement |

### Step 5 — Service Zone
| Field | Required | Notes |
|---|---|---|
| Primary city / operating area | Yes | |
| Willing to do intercity deliveries | Yes | Yes / No |

### Step 6 — Payout / Banking
Same as Merchant Step 4.

**Post-onboarding state:**
- `User` created
- If solo: `Tenant` created, type = `logistics`; `DriverProfile` created under tenant
- If invited: `DriverProfile` created under the inviting tenant; `Membership` created, role = `driver`
- Status = `pending_verification` until documents reviewed
- Drivers cannot receive bids until verified

---

## 4. Customer

Lightweight. No tenant provisioned. Registration possible from main site or any tenant storefront.

### Step 1 — Registration
| Field | Required | Notes |
|---|---|---|
| Full name | Yes | |
| Email address | Yes | Shared credential across all EwaTrade stores |
| Phone number | Yes | |
| Password | Yes | Or social login (Google / Apple) |

### Step 2 — Profile (optional, deferrable to first checkout)
| Field | Required | Notes |
|---|---|---|
| Profile photo | No | |
| Default delivery address | No | Country, state, city, street, landmark |
| Date of birth | No | For birthday offers / age gating |

### Step 3 — Preferences (optional)
| Field | Required | Notes |
|---|---|---|
| Notification channels | No | Email / SMS / WhatsApp (multi-select) |
| Favourite categories | No | Fashion, Food, Electronics, etc. |

**Post-onboarding state:**
- `User` created, role = `customer`
- No tenant provisioned
- Can immediately shop on any EwaTrade tenant site
- Cart and orders are per-store; identity credential is global

---

## Onboarding State Machine

```
ewatrade.com → "Register to Get Onboard"
  │
  ├── Store Owner
  │     └── Account → Business → First Store → Banking
  │           → Delivery Prefs → Website → Dashboard
  │
  ├── Logistics Company
  │     └── Account → Company → Services → Fleet Size
  │           → Banking → Documents → Dashboard (limited, pending verification)
  │
  ├── Driver (solo)
  │     └── Account → Personal → Vehicle → Documents
  │           → Zone → Banking → Verification Queue
  │
  └── Customer
        └── Account → (Profile + Prefs optional) → Shop anywhere
```

---

## Shared Rules

- **One email = one identity.** A person can hold multiple roles (e.g., merchant AND customer) on the same account.
- **Tenants are provisioned at Step 2** for merchants and logistics companies. This creates the tenant boundary.
- **Cashiers and staff do not onboard here.** They are invited post-onboarding by the merchant/logistics owner.
- **Verification is async.** Documents are collected at onboarding but reviewed out-of-band. Merchants and logistics get limited dashboard access while pending.
- **Customer registration is instant.** No verification gate.
- **Tenant website is created in draft state** at onboarding. The owner must explicitly publish it.
- **No login on main site.** Merchants, staff, and drivers log in via their tenant URL. Customers log in from any tenant storefront.
