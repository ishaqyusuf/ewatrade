# Define Reporting, Reconciliation, And Audit Semantics

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: research

Status: resolved

Blocked by: 03, 04, 05, 07, 12

## Question

What should inventory, availability, valuation-input, sales, movement,
transformation, stock-count, closeout, staff-wallet, and audit reports display
when quantities may be canonical shared-pool amounts or separately packaged
balances with immutable historical unit snapshots?

## Comments

Inventory reports should identify each owned balance and show canonical
quantity plus optional human-readable equivalents. Shared-pool transaction
units are presentation/conversion choices; Packaged Stock appears as separate
balances.

Never sum raw quantities from different units. Sales use captured offering and
price snapshots. Movements show entered quantity/unit and canonical effect.
Transformations display linked debit and credit entries plus any separate loss
adjustment. Counts, reservations, returns, staff custody, and closeouts must
retain the balance and configuration version they affected.

Valuation consumes posted cost snapshots but does not invent cost from current
selling prices or mutable factors.

## Approved Direction

- Inventory reports expose Product/variant, Store/custody, Balance Source,
  on-hand/reserved/available quantities, entered unit, exact canonical effect,
  Unit Configuration Version, source/reason, and actor.
- Packaged balances remain separate. Reports never sum incompatible raw units.
- Transformations display linked debit, credit, and loss adjustments.
- Sales reporting uses immutable Offering Snapshots and Price Change history.
- Exact decimal strings are retained in exports; display formatting never
  becomes ledger input.
- Valuation uses posted cost snapshots from the costing domain, never current
  Unit Price or mutable conversion data.

## Resolution

### Reporting source and grain

- Official inventory reports read immutable Stock Operations/Movements and
  their transactionally maintained Balance Source projections, never current
  ProductVariant metadata or reconstructed conversion ratios.
- The base inventory grain is one actual Balance Source: Business, Store,
  optional Stock Custody, Product, Sellable Variant, configuration/versioned
  Inventory Unit meaning, and Stock Behavior.
- Every row shows exact on-hand, reserved, and available quantities in the
  balance's owned unit plus its canonical equivalent. Alternate Transaction
  Unit equivalents are optional display calculations and are never presented
  as additional balances.

### Aggregation

- Operational availability never aggregates across Sellable Variants and never
  substitutes one Balance Source for another.
- Shared Stock Pool and Packaged Stock rows remain separate. An analytical
  physical-stock total may sum their exact canonical equivalents within one
  Product variant and compatible configuration meaning, but it must retain the
  component breakdown and cannot drive fulfillment.
- Cross-Store and cross-variant summaries are analytics only, grouped
  explicitly. They never imply transferable or immediately sellable stock.
- Raw quantities from different Inventory Units are never added.

### Availability and low-stock state

- Low/out/available state is calculated per Balance Source from exact available
  quantity and that source's threshold policy.
- An offering is not marked available because another variant, Store, custody,
  shared pool, or packaged balance holds equivalent stock.
- Reports display the Product Unit Offering and exact Balance Source used for
  availability so merchants can distinguish configured sale choices from
  physical stock.

### Movement and transformation audit

- Movement reports show the Stock Operation header and all of its Stock
  Movements together: type, Business/Store/custody, product/variant, balance,
  entered quantity/unit, Unit Configuration Version, Unit Factor, signed
  canonical effect, before/after projection, actor, source, reason, effective
  time, creation time, and idempotency identity.
- A Stock Transformation displays its source debit and target credit as one
  atomic operation and proves that canonical net is zero.
- Loss, damage, or variance appears as a separately typed Stock Adjustment,
  even when recorded beside a transformation.
- Transfers display matching source/destination meaning and do not appear as
  repackaging.

### Counts and reconciliation

- A count session records expected and observed quantities per declared
  Balance Source, the entered Inventory Unit, exact canonical observation,
  variance, counter, reviewer, timestamps, and notes/evidence.
- Approval posts the explicit reconciliation Stock Adjustment. The observed
  value never overwrites or rewrites the prior ledger.
- Shared Stock Pool counts may accept multiple exact alternate-unit entries,
  while Packaged Stock counts remain separate.
- Reconciliation reports connect the count, approval, adjustment, and
  resulting balance without hiding variance.

### Reservations and returns

- Reservation reports include lifecycle status, age/expiry, offering and
  Commercial Order provenance, entered quantity, configuration/factor
  snapshot, exact held canonical amount, and Balance Source.
- Official available stock includes only active holds; released, expired, and
  committed holds remain historical rows.
- Return reports separate commercial refund/payment state from inventory
  disposition and identify whether stock returned to its original Balance
  Source, another explicitly chosen source, quarantine/out-of-scope handling,
  or no restock.

### Custody and closeout

- Replace “staff wallet” reports with Stock Custody reports.
- A custody statement shows opening custody, transfers in/out, sales, returns,
  adjustments, expected closing, declared closing, and variance per Balance
  Source and immutable unit meaning.
- Closeout review links every variance to its count/reconciliation and any
  approved Stock Adjustment. It never edits the custody projection directly.

### Sales, pricing, and valuation

- Sales reports group by immutable Offering Snapshot, Catalog Item, Sellable
  Variant/options, offering subtype, Store, quantity, fixed/quoted price,
  currency, discount/tax, and fulfillment meaning captured at order time.
- Product and Service lines may appear in the same Commercial Order report but
  retain distinct Product-inventory and Service-work dimensions.
- Price reporting joins Price Changes for future/current analysis without
  repricing historical order lines.
- Inventory valuation consumes posted cost/cost-layer snapshots owned by the
  costing boundary. It never derives cost from Unit Price, current Unit Factor,
  or a mutable catalog value.

### Pending operations, exports, and access

- Pending Stock Operations appear as a separate provisional overlay and are
  excluded from official totals until authoritative acceptance.
- Conflicted/discarded operations remain visible locally with their attempted
  meaning but never fabricate server movements.
- CSV and other machine-readable exports preserve decimal strings,
  configuration versions, Unit Factors, canonical effects, stable resource and
  operation identities, source time zone/offset, actor, reason, and audit
  references. Display rounding is never exported as ledger truth.
- Report authorization follows `inventory.view` plus narrower management or
  audit capabilities for sensitive custody, actor, costing, and adjustment
  detail. Tenant/Business and Store scoping is enforced in every query and
  export.
