# Merchant System

## Capabilities
- Merchant onboarding
- Store creation and management
- Product catalog
- Inventory tracking
- Order management
- Store analytics
- Multi-store support (one merchant tenant → many stores)

## Onboarding Data

See full step-by-step flow: `brain/workflows/onboarding-flows.md`

### Account (Step 1)
- Full name, email, phone, password

### Business / Tenant (Step 2)
- Business name, type (sole proprietor / partnership / LLC / other)
- Business registration number (optional at start)
- Country, state, city, street address
- Business phone, business email
- Tax ID / VAT number (optional)

### First Store (Step 3)
- Store name, slug (→ `{slug}.ewatrade.com`)
- Short description (tagline), long description
- Category (fashion / electronics / food / beauty / home / other)
- Logo, cover image
- Contact email, contact phone
- Physical address (optional, for pickup/walk-in)
- Default currency
- Operating hours (optional)

### Banking / Payout (Step 4)
- Bank name, account number, account holder name, account type

### Delivery Preferences (Step 5)
- Delivery method: own / EwaTrade dispatch / both
- Supported delivery zones
- Free shipping threshold (optional)

### Storefront / Website (Step 6)
- Site template choice
- Primary brand color (optional)
- List on marketplace: yes / no

## Post-Onboarding States
- `Tenant` provisioned (type = `merchant`)
- `Store` created (status = `active`, products in draft)
- `TenantSite` created (status = `draft`, must be published manually)
- `Membership` created: owner → tenant, role = `merchant_owner`

## Staff Onboarding (post-owner setup)
Owners invite staff after their tenant is set up. Staff roles:
- `merchant_staff` — store ops: orders, inventory, POS
- (Cashier is a staff sub-role for POS sessions)

Invite flow: owner sends invite by email → staff registers or logs in → membership created.
