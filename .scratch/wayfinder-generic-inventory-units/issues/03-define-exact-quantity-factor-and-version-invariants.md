# Define Exact Quantity, Factor, And Version Invariants

Parent: [Wayfinder: Catalog Variants, Product Units, And Sellable Offerings](../map.md)

Type: grilling

Status: resolved

Blocked by: 02, 12

## Question

What exact numeric representation, precision validation, canonical-factor
rules, rounding policy, immutability boundary, transaction snapshots, and
configuration-version transitions guarantee that unit operations never create,
lose, or reinterpret stock?

## Comments

Use exact base-10 decimal quantities and factors with configured precision;
never use binary floating-point for stock. The canonical unit has factor 1.
Every other factor must be positive, direct to the canonical unit, and
representable at the configured precision.

Indivisible units accept whole quantities only. Divisible units accept
quantities up to their configured precision. Ledger operations that cannot be
represented exactly must be rejected rather than silently rounded.

Once used, a unit configuration is immutable. A change creates a new version,
while transactions snapshot the version, unit, factor, precision, and entered
quantity. Factor changes against existing stock require an explicit recount or
reconciliation rather than reinterpreting prior balances.

## Resolution

- Quantities use exact decimals with up to six decimal places; Unit Factors use
  exact decimals with up to twelve decimal places. APIs exchange decimal
  strings, never binary floating-point quantities.
- Transaction Precision controls entered quantity precision per Inventory
  Unit. Canonical Balance Precision independently supports every exact
  canonical stock effect.
- Unit Factor is the positive canonical quantity represented by one configured
  unit. The canonical factor is one; all other factors are direct to it, with
  no stored inverses or conversion chains.
- Publishing a Unit Configuration Version proves that every allowed transaction
  quantum converts exactly within Canonical Balance Precision. Invalid
  combinations are rejected before stock operations use them.
- Unit Configuration Versions follow Draft, Current, and Superseded states.
  Draft is editable but unusable; Current and Superseded are immutable.
- Safe additive changes may become Current while stock exists. Changes to
  canonical unit, existing factors, Stock Behavior, reduced precision, or
  referenced units require an explicit Stock Transition.
- A late offline operation pinned to a Superseded version returns a typed
  conflict unless it is an idempotent replay of an already accepted movement.
- Ledger calculations and aggregation never round. UI/report formatting may
  approximate display but cannot become a stock-write input.
- Every Stock Movement snapshots the configuration version, unit identity and
  vocabulary, entered quantity, Transaction Precision, Unit Factor, canonical
  effect, affected balances, actor, Store, source/reason, timestamp, and
  idempotency identity.
- Accepted movements are immutable; corrections create reversing and
  replacement movements.
