# Legal Framework

## Purpose
Document all legal obligations, compliance requirements, and platform policies for EwaTrade.

---

## Business Registration — CAC Requirement

**All businesses registering on EwaTrade must provide CAC documentation.**

CAC (Corporate Affairs Commission) is the Nigerian government body that registers businesses. This is mandatory for:
- Merchant tenants (store owners)
- Logistics / Dispatch companies

**Why mandatory:**
- Establishes legitimate business identity
- Enables EwaTrade to hand over verifiable tenant information to authorities during disputes or fraud investigations
- Protects the platform from hosting shell/fraudulent businesses
- Required for payment gateway subaccount creation (Paystack/Flutterwave require business registration proof)

**Accepted CAC documents:**
| Document | Accepted For |
|---|---|
| CAC Certificate of Incorporation | Limited liability companies |
| CAC Business Name Registration | Sole proprietorships / partnerships |
| CAC IT Registration | Technology companies |

**Individual riders / drivers:** Not required to have CAC. Must provide government-issued ID instead.

---

## Terms & Conditions — Platform Liability

### EwaTrade Is Not Responsible For:

- Product quality, authenticity, or fitness for purpose
- Order non-fulfillment by merchants
- Delivery failures or damages caused by dispatch providers or riders
- Fraud committed by a tenant against their customers
- Disputes between a merchant and their customer
- Any direct, indirect, or consequential losses arising from transactions on the platform

### EwaTrade's Role:

EwaTrade is a **technology infrastructure provider** — it provides tools for merchants, dispatch companies, and customers to interact. EwaTrade is not a party to any transaction between a merchant and a customer.

EwaTrade does not:
- Hold funds on behalf of merchants or customers
- Guarantee delivery of goods or services
- Act as an insurer or guarantor for any transaction

---

## Dispute & Fraud Policy

### When a Merchant Is Accused of Fraud

EwaTrade will cooperate with:
- Law enforcement agencies (with valid legal order)
- Consumer protection authorities
- Regulatory bodies

**Information EwaTrade will provide upon lawful request:**
- Tenant registration details (name, CAC number, address)
- Owner identity documents (as submitted during onboarding)
- Transaction records and order history
- Bank account details (as registered with the platform)
- Communication logs (where applicable)

This policy is clearly disclosed to all tenants during onboarding via the platform Terms of Service.

### Customer Escalation

For customer disputes:
1. Customer first raises dispute with the merchant directly (via messaging)
2. If unresolved after 72 hours, customer can escalate to EwaTrade support
3. EwaTrade may mediate by facilitating communication — not by forcing a refund
4. If fraud is confirmed, EwaTrade may suspend the tenant pending investigation

---

## Terms of Service Structure (Planned)

The platform ToS must cover:

### For Merchants
1. Acceptable use policy (no counterfeit, illegal, or prohibited goods)
2. CAC and identity verification requirements
3. Payment and settlement terms (direct-to-merchant, no EwaTrade wallet)
4. Liability disclaimer (EwaTrade not responsible for product/service failures)
5. Platform fee terms
6. Data processing agreement (NDPR compliance)
7. Account suspension and termination policy
8. Intellectual property (tenant owns their content)

### For Dispatch Providers / Riders
1. Verification requirements (ID, vehicle docs, CAC for companies)
2. Service standards and SLAs
3. Liability for damages during delivery
4. Reputation scoring and suspension criteria
5. Payout terms

### For Customers
1. Terms of purchase (transaction is between customer and merchant)
2. Dispute process
3. Data usage and privacy
4. Prohibited activities

---

## Data Privacy

- Nigeria Data Protection Regulation (NDPR) compliance required
- GDPR-aligned for any EU-reachable surfaces
- Customer PII is never shared across tenants
- Activity feed payloads are anonymized (no PII)
- Customer can request account deletion (right to erasure)
- Data retention policy: active account data retained; deleted accounts anonymized after 30 days

---

## Compliance Checklist (Pre-Launch)
- [ ] Finalize platform Terms of Service (merchant, rider, customer versions)
- [ ] Finalize Privacy Policy
- [ ] Finalize Acceptable Use Policy
- [ ] Legal review of CAC verification process
- [ ] Payment gateway compliance (Paystack KYC requirements for subaccounts)
- [ ] NDPR data processing agreement template for tenants
- [ ] Document dispute escalation and response SLAs
- [ ] Platform liability insurance (if applicable)

---

## Notes
- Legal documents should be reviewed by a qualified Nigerian commercial lawyer before launch
- Terms must be agreed to during onboarding (checkbox with link; stored as `LegalAcceptance` record)

### `LegalAcceptance` Entity
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `userId` | FK → User | |
| `tenantId` | FK → Tenant | null for customers |
| `documentType` | enum | `terms_of_service` \| `privacy_policy` \| `acceptable_use` |
| `documentVersion` | string | e.g. `v1.0` |
| `acceptedAt` | datetime | |
| `ipAddress` | string | for audit |
