# Lock The Service Domain And Bounded Contexts

Parent: [Wayfinder: Generic Service Catalog And Work Operations](../map.md)

Type: grilling

Status: resolved

Blocked by: None

## Question

What are the final terms, entities, ownership boundaries, and relationships for
Service Item, Service Offering, request, quote/estimate, booking, commercial
Order and line, intake, work package, Service Job, task/line, assignment,
evidence, due commitment, event, customer tracking, and notification intent?

## Comments

Adopt these boundaries:

- Service Item and Service Offering belong to Catalog.
- Service Request is unconfirmed customer intent.
- Quote is a priced proposal; approval can create a Commercial Order.
- Commercial Order owns money, discounts, payments, and refunds.
- Intake captures customer-provided items, instructions, condition, and
  evidence.
- Service Job is the operational work package.
- Job Lines represent tracked ordered offerings.
- Assignment, due commitment, evidence, work events, customer tracking, and
  notification intents belong to Service Operations.

Include direct intake and request/quote conversion in v1. Defer recurring
services, appointment capacity, arbitrary workflow builders, and consumable
Product deduction.

## Resolution

Owner approved recommendations 129–136 on 2026-07-18.

### Bounded contexts

| Context | Owns | Does not own |
| --- | --- | --- |
| Catalog | Catalog Item, Service classification, Sellable Variant, Service Offering, Offering Pricing Policy, Store Offering Availability | Customer intent, work instances, payment, inventory |
| Commerce | Quote and Quote Version, Commercial Order and Order Line, Offering Snapshot, charges, discounts, taxes, deposits, receipts, payment state, cancellation, and refunds | Intake condition, assignment, progress, due work, evidence |
| Service Operations | Service Work Policy, Service Intake, Service Job, Service Job Line, Work Allocation, Assignment, Due Commitment, Service Evidence, Service Work Event, exception/rework history | Catalog configuration, price history, payment state, inventory |
| Customer Access | Service Request Form, Customer Tracking Access, safe customer-facing milestones and explicitly published information | Internal notes, staff identities, private evidence, payment implementation |
| Communications | Notification Intent, rendered Customer Message, and provider Delivery Attempt | Work truth, payment truth, provider-native integrations in v1 |
| Reporting | Tenant-scoped projections over immutable Commerce and Service Operations sources | Independent mutable revenue or work facts |

### Canonical relationships

- A Catalog Item is classified as Service and has one or more Sellable
  Variants. Each active Service Sellable Variant resolves to one Service
  Offering.
- A Service Offering is the stable customer-selectable catalog identity. It
  may reference a Service Work Policy, but it never owns a work instance.
- A Service Request records unconfirmed customer intent. It guarantees no
  price and creates neither a Commercial Order nor Service Job.
- A Quote is a versioned commercial proposal. Acceptance may idempotently
  create one Commercial Order; it does not itself represent completed payment
  or operational work.
- A Commercial Order owns money and immutable Offering Snapshots. Product and
  Service lines may coexist. Its payment state never substitutes for Service
  work state.
- A Service Intake records the operational handover and optional context. A
  direct staff Intake may create a Commercial Order; a Request/accepted Quote
  may supply the commercial path before Intake.
- A Service Job is a work package containing Service Job Lines. A Job Line is
  an operational allocation of an exact quantity from one tracked Service
  Order line, not an arbitrary merchant-authored task.
- Assignment, Due Commitment, Service Evidence, Service Work Event, and
  exception/rework history describe work without changing the Commercial
  Order's monetary facts.
- Customer Tracking Access projects an allowlisted customer-safe view of a
  Service Job. It is not the Job record and grants no internal access.
- Notification Intent records that a customer communication should occur;
  message rendering and provider delivery are separate facts.

### Terminology decisions

- Use **Service Request**, not Order Request, booking, enquiry/order, or
  pending sale, for unconfirmed intent.
- Use **Quote**, not estimate, provisional Order, or request total, for a
  priced proposal.
- Use **Service Intake**, not Service Order, check-in, garment intake, or job
  creation form, for operational handover.
- Use **Service Job** for the work package and **Service Job Line** for an
  allocated ordered Service Offering quantity. Do not introduce arbitrary
  Service Tasks in v1.
- Use **Due Commitment** for a merchant promise. A customer-requested time is
  separate and is not automatically a promise.
- Use **Service Evidence** for condition/progress/completion media or files;
  it is never inventory and is private unless explicitly published.
- Use **Customer Tracking Access** for scoped public access, not Public Job or
  shared internal Job.
- Use **Notification Intent** for the desire to communicate, not for proof of
  provider delivery.

### Explicit v1 scope boundary

Direct staff Intake and Service Request → Quote → Commercial Order conversion
belong in v1. Recurring Services, appointments, time slots, capacity planning,
arbitrary workflow builders, provider-native integrations, and automatic
Product-consumable deduction remain outside this implementation.

## Approved Pipeline Comment

> *This was generated by AI during Wayfinder issue commenting.*

Proposed answer: Catalog owns Service Offerings; Commerce owns versioned Quotes,
Commercial Orders, Offering Snapshots, and all monetary facts; Service
Operations owns Service Work Policy, Intake, Jobs, Job Lines, allocations,
assignments, due commitments, evidence, events, and rework; Customer Access
owns scoped public request/tracking projections; Communications owns
notification and delivery facts; Reporting owns projections only. Keep Service
Request, Quote, Service Intake, Service Job, Service Job Line, Due Commitment,
Service Evidence, Customer Tracking Access, and Notification Intent distinct.

Why: Separating catalog, commercial, work, public-access, and communication
truth prevents work status from becoming payment state and prevents customer
surfaces from exposing internal records.

Assumptions / risk: Recurring work, appointments, capacity planning, arbitrary
workflow builders, provider integrations, and automatic Product consumption
remain outside v1.
