# Wayfinder: Generic Service Catalog And Work Operations

Label: `wayfinder:map`

## Destination

Produce an implementation-ready specification and clean replacement plan for
generic Service Offerings and work operations across commercial orders, intake,
Service Jobs, fulfillment, assignments, due work, evidence, public requests,
customer tracking, notifications, reporting, offline behavior, database, API,
dashboard, and mobile—without dry-cleaning or other industry assumptions.

## Notes

- Planning only. Resolve decisions and prepare the implementation handoff; do
  not modify product code while working this map.
- Use `/grilling` and `/domain-modeling`. Keep
  [EwaTrade Commerce](../../CONTEXT.md) current as Service language resolves.
- The shared Catalog Item, Sellable Variant, Sellable Offering, Product Unit
  Offering, and Service Offering boundary is owned with
  [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../wayfinder-generic-inventory-units/map.md).
  This map consumes that boundary and owns Service work after selection/order.
- Services are never inventory. They have no Inventory Unit, canonical stock
  quantity, balance, reservation, transformation, stock wallet, reorder state,
  or closeout stock line.
- Commercial Orders own customer charges, discounts, receipts, payment state,
  refunds, and immutable Service Offering snapshots. Service work state must
  not become a second payment system.
- Treat the current implementation as an early prototype to audit, not a
  decision source. Current assumptions—including `immediate | tracked`,
  one Service Job per order, the current status enum, request conversion,
  assignment, due-date, evidence, notification, and report shapes—may all be
  replaced.
- The earlier
  [Wayfinder: Product And Service Catalog Items](../wayfinder-catalog-items-product-service/map.md)
  and its implemented spec are historical inputs. This map supersedes their
  Service-operation decisions wherever the new specification differs.
- This is an early-stage clean cutover. Existing development data is
  disposable. Do not design legacy backfills, dual writes, compatibility
  aliases, fallback metadata, or preservation of dry-cleaning-era records.
- Service examples may include cleaning, repair, tailoring, salon work,
  installation, consulting, and other work, but no example becomes a runtime
  industry type, schema branch, API namespace, or authorization gate.

## Decisions so far

- [Audit The Current Service Feature And Industry Residue](issues/01-audit-current-service-feature-and-industry-residue.md)
  is resolved. The current implementation is an early prototype whose generic
  names hide coupled assumptions: `IMMEDIATE | TRACKED`, one Job per Order,
  one Job Line per Order line, whole-job status/assignment/due/evidence,
  request pricing before quotation, direct request conversion, broad Retail
  Ops permissions, duplicate public-route ownership, and online-only mobile
  work. The clean replacement keeps tenant/Store scope, Commerce ownership of
  money, immutable snapshots/audit history, opaque public access, and Service
  exclusion from inventory. It deletes all legacy ids/migration readers and
  replaces the rest through explicit Catalog, Commerce, Service Intake,
  Service Work, Customer Access, Communication, and Reporting boundaries.
- [Lock The Service Domain And Bounded Contexts](issues/02-lock-service-domain-and-bounded-contexts.md)
  is resolved. Catalog owns Service Offerings; Commerce owns Quotes, Orders,
  and money; Service Operations owns Intake and work; Customer Access owns
  safe public projections; Communications owns notification/delivery facts;
  Reporting owns projections only. Service Request, Quote, Intake, Job, Job
  Line, Due Commitment, Evidence, and Tracking Access are distinct terms.

## Not yet specified

None. The owner-approved recommendation set 129–190 is assigned to the open
child tickets, which remain responsible for recording their implementation-
ready detail as they resolve.

## Out of scope

- Product Inventory Units, Product stock balances, stock transformations, or
  product-unit accounting; those belong to the sibling catalog/unit map.
- Industry-specific dry-cleaning, laundry, tailoring, salon, repair, or
  installation runtime models.
- Arbitrary merchant-authored workflow/state-machine builders.
- Recurring Services, appointments, time slots, resource-capacity planning,
  multi-worker optimization, and automatic scheduling.
- Automatic Product-consumable deduction from Service work.
- Provider-native payment, SMS, WhatsApp, email, calendar, or media-storage
  integrations.
- Payroll, commissions, workforce attendance, or HR management.
- Legacy data migration, compatibility aliases, dual-write rollout, or
  preservation of existing development records.
- Implementing schema, API, dashboard, mobile, public pages, migration, or
  rollout changes inside this Wayfinder map.
