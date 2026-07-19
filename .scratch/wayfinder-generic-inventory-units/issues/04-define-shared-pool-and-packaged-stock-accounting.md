# Define Shared-Pool And Packaged-Stock Accounting

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: grilling

Status: resolved

Blocked by: 02, 03, 12

## Question

How should balances, availability, reservations, sales, receipts, counts,
adjustments, and one-to-one Stock Transformations behave when a Sellable Variant
mixes Alternate Transaction Units with independently balanced Packaged Stock?

## Comments

An Alternate Transaction Unit never owns stock. Sales, receipts, reservations,
returns, counts, and adjustments entered through it convert exactly into the
variant’s canonical Shared Stock Pool.

Packaged Stock owns a separate balance. Its availability is not inferred from
the shared pool. A Stock Transformation explicitly debits one balance and
credits another for the same Product and Sellable Variant. Source and target
canonical values must balance; shortages, spoilage, or packaging loss use a
separate adjustment event.

Counts target one declared balance at a time. Reports may show equivalent
quantities but must never merge independently owned packaged balances into
shared availability.

## Resolution

- Every Product Unit Offering selects one deterministic Balance Source through
  its Inventory Unit and Stock Behavior. Shared and packaged stock never
  automatically fall back to each other.
- Stock Reservations hold exact quantity against one Balance Source.
  Available Stock is non-negative on-hand minus active reservations for that
  balance.
- Shared offering availability converts exact canonical availability through
  Unit Factor and Transaction Precision. Indivisible offerings expose complete
  sellable quantities only.
- Stock Receipts credit the Balance Source physically received. External
  packaged receipts credit Packaged Stock directly; repackaging existing Store
  stock requires a Stock Transformation.
- Stock Counts reconcile one Balance Source at a time. Shared-pool counts may
  combine compatible unit entries; packaged balances are counted separately.
  Finalization creates explicit adjustment movements.
- Stock Returns default to the original sale line's Balance Source and require
  explicit restock, reclassification, or loss disposition separate from
  commercial refund handling.
- Stock Adjustment changes one Balance Source for a required reason. It never
  represents a transfer into another balance.
- Stock Transformation atomically debits one actual Balance Source and credits
  one other with equal canonical value in the same Store, Product, and
  Sellable Variant. Alternate Transaction Units cannot be endpoints.
- Transformation loss is a separately linked Stock Adjustment. Accepted
  transformations and adjustments are immutable and reverse through new
  events.
- Stock Custody uses real Store sub-balances assigned to a staff member or
  session. Closeout reconciles each custody balance and transfers returned
  stock explicitly.
- Normal reservations, sales, custody transfers, transformations, and outbound
  movements cannot create negative stock. Conflicting offline operations
  require review.
- Stock Transfer changes custody or location without changing Inventory Unit,
  factor, configuration version, or Stock Behavior. Store-to-Store transfers
  use dispatched, in-transit, and received states.
