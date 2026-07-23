# EwaTrade Commerce

EwaTrade models the commercial and inventory language shared by merchants,
stores, sales surfaces, and stock operations.

## Catalog And Inventory Language

**Catalog Item**:
A business-owned entry classified as either a Product or a Service when saved;
its kind cannot later be changed.
_Avoid_: Inventory item, product-or-service record

**Sellable Variant**:
A customer-selectable form of a Catalog Item, such as Red / XL,
Agbada / Large, or a simple item's implicit default. Every Catalog Item has at
least one Sellable Variant.
_Avoid_: Unit, stock unit

**Variant Option Group**:
A merchant-defined choice dimension, such as Colour, Size, or Garment, whose
values may generate Sellable Variants without acquiring unit or stock meaning.
_Avoid_: Inventory option, unit type

**Inventory Unit**:
A product-specific unit in which stock is counted, sold, received, or
transformed, such as piece, carton, kilogram, roll, or litre. It is configured
inside a Unit Configuration Version and may reference a Unit Definition for
its vocabulary, and may exist without a customer-facing Product Unit Offering.
_Avoid_: Variant, feed unit

**Stock Behavior**:
The exclusive classification of an Inventory Unit as the canonical shared
unit, an Alternate Transaction Unit, or Packaged Stock.
_Avoid_: Unit mode, inventory type

**Balance Source**:
The single Store balance selected by a Product Unit Offering's Inventory Unit
and Stock Behavior, with no automatic fallback to another balance.
_Avoid_: Preferred stock, fallback inventory

**Available Stock**:
The non-negative on-hand quantity remaining after active Stock Reservations
for one Balance Source.
_Avoid_: Total product stock, cross-balance availability

**Transaction Precision**:
The number of decimal places accepted when entering a quantity in one
Inventory Unit; zero makes that unit indivisible in transactions.
_Avoid_: Balance precision, display decimals

**Canonical Balance Precision**:
The number of decimal places required to represent every exact canonical stock
effect allowed by one Unit Configuration Version.
_Avoid_: Transaction precision, rounding scale

**Divisible Inventory Unit**:
An inventory unit that permits exact fractional quantities to a configured
precision of up to six decimal places, such as kilogram, litre, or metre.
_Avoid_: Decimal stock

**Indivisible Inventory Unit**:
An inventory unit counted only in whole quantities, such as piece, carton, or
bottle.
_Avoid_: Integer stock

**Unit Definition**:
A reusable display name, optional symbol, and measurement meaning offered when
configuring a product. Platform definitions are global suggestions; merchant
definitions belong to one business, and neither owns a product conversion
factor, precision, balance, price, or stock behavior.
_Avoid_: Unit template, conversion preset

**Unit Configuration Version**:
A revision of a product's configured units, factors, precision rules, and Stock
Behaviors shared by its sellable variants. Draft versions are editable but
unusable; every Product has one immutable Current version, while replaced
versions remain immutable and Superseded.
_Avoid_: Editable conversion settings

**Canonical Inventory Unit**:
The product-specific unit used as the single equivalence anchor for stock
quantities; every other inventory unit defines an exact factor relative to it.
It may remain internal without a Product Unit Offering.
_Avoid_: Primary selling unit, default package

**Unit Factor**:
The exact positive quantity of the Canonical Inventory Unit represented by one
quantity of another Inventory Unit; the canonical unit's factor is one.
_Avoid_: Conversion ratio, inverse factor

**Stock Transformation**:
An atomic, canonically balanced movement from one actual Balance Source to one
other within the same Store, Product, and Sellable Variant.
_Avoid_: Variant conversion, feed conversion

**Stock Transfer**:
A custody or location movement that preserves Inventory Unit, configuration
version, Unit Factor, and Stock Behavior without repackaging stock.
_Avoid_: Stock transformation, unit conversion

**Stock Movement**:
An immutable quantity change against one Store and Product Sellable Variant
balance, retaining the unit version, entered quantity, factor, and exact
canonical effect used at the time.
_Avoid_: Editable stock row, current conversion

**Stock Operation**:
One audited business action that atomically groups one or more Stock Movements,
such as a receipt, sale, transfer, adjustment, or transformation.
_Avoid_: Movement type, editable inventory transaction

**Pending Stock Operation**:
A locally recorded Stock Operation awaiting authoritative acceptance; its
stock effect remains provisional and may require review before posting.
_Avoid_: Completed offline movement, authoritative local stock

**Opening Stock**:
The initial declared quantity posted through an audited Stock Movement into one
specific Balance Source when stock tracking begins.
_Avoid_: Starting balance field, default inventory

**Stock Reservation**:
An exact temporary hold against one Balance Source, retaining the selected
offering, entered quantity, Unit Factor, and Unit Configuration Version.
_Avoid_: Cross-balance hold, promised stock

**Stock Custody**:
A Store subdivision holding balances assigned to a staff member or work
session, transferred without changing unit meaning or total Store stock.
_Avoid_: Staff wallet, staff stock summary

**Stock Receipt**:
An immutable external inbound addition to one declared Balance Source,
retaining the entered unit, quantity, factor, canonical equivalent, and source.
_Avoid_: Repackaging, stock transformation

**Stock Count**:
An observed quantity for one Balance Source that is reconciled to recorded
stock through an explicit adjustment; a Shared Stock Pool count may combine
several compatible unit entries.
_Avoid_: Balance overwrite, mixed-balance count

**Stock Return**:
The inventory disposition of a returned Commercial Order line, defaulting to
its original Balance Source and recorded separately from payment or refund.
_Avoid_: Refund, automatic reclassification

**Stock Adjustment**:
An immutable reasoned increase or decrease to one Balance Source that never
represents a transfer into another balance.
_Avoid_: Stock transformation, balance edit

**Stock Transition**:
An explicit audited reconciliation of balances and reservations required when
a new Unit Configuration Version would otherwise reinterpret existing stock.
_Avoid_: Configuration edit, automatic conversion

**Shared Stock Pool**:
A Store stock balance owned by one Product Sellable Variant and held in its
canonical inventory unit, which can be bought, sold, or reported through
equivalent alternate units.
_Avoid_: Virtual package stock

**Alternate Transaction Unit**:
A product unit used for purchasing or selling that converts against a shared
stock pool and does not own an independent physical balance.
_Avoid_: Virtual inventory, packaged stock

**Unit Price**:
The price charged for one quantity of a Sellable Offering. It may come from
the Offering's catalog price or an allocated Stock Price Layer, and for Product
Unit Offerings it is commercially independent from the Inventory Unit's
stock-equivalence factor.
_Avoid_: Converted price, ratio price

**Stock Price Layer**:
A Store-local quantity of one Balance Source carrying an approved Unit Price
for each eligible Sellable Offering and consumed in receipt order using exact
canonical stock quantity. It is a commercial allocation layer, not a claim
that the stock is physically separated.
_Avoid_: Global product price, physical lot, inventory batch

**Stock Price Allocation**:
An exact quantity reserved from one Stock Price Layer for a Product quantity
in a Commercial Order, retaining that layer's approved Offering Unit Price
until the reservation is released or committed.
_Avoid_: Checkout-time repricing, payment-time price lookup

**Price Change**:
An auditable revision affecting a Sellable Offering's future Unit Price without
altering historical Offering Snapshots.
_Avoid_: Historical repricing, factor-derived price

**Business Currency**:
The single operating currency used by a business's fixed catalog prices and
Commercial Orders in v1.
_Avoid_: Offering currency option, automatic exchange currency

**Sellable Offering**:
A business-owned customer-selectable choice governed by an Offering Pricing
Policy. It is exactly one immutable Product Unit Offering or Service Offering,
and once referenced it may be archived but not deleted or retyped.
_Avoid_: Product variant, unit

**Offering Pricing Policy**:
The rule requiring either a fixed Unit Price or an approved Quote before a
Sellable Offering can become a Commercial Order line.
_Avoid_: Placeholder price, unknown zero price

**Store Offering Availability**:
The relationship enabling an active Sellable Offering at a particular Store,
separate from whether that Store currently has stock available.
_Avoid_: Store product, local offering

**Product Unit Offering**:
A Product Sellable Offering through one configured Inventory Unit, with an
optional business-unique SKU and barcode. At most one exists for each Sellable
Variant and Inventory Unit, and it owns no factor, Stock Behavior, or balance.
_Avoid_: Unit variant, package variant

**Service Offering**:
A Service Sellable Offering that may be referenced by a Service Operations
policy and may have a business-unique merchant code. Each active Service
Sellable Variant has one, and it owns neither inventory meaning nor
work-instance state.
_Avoid_: Service unit, inventory-free product

**Packaged Stock**:
Stock physically prepared and counted in a particular inventory unit with a
Store balance owned by one Product Sellable Variant and distinct from its other
balances.
_Avoid_: Shared unit, display unit

**Supplier Pack**:
A supplier-specific purchasing description mapped to an existing Product
Sellable Variant and Inventory Unit without redefining its Unit Factor.
_Avoid_: Sellable variant, automatic inventory unit

## Order Language

**Commercial Order**:
A customer purchase containing Product Unit Offering lines, Service Offering
lines, or both. It owns commercial amounts and payment state, not inventory or
Service work state.
_Avoid_: Service Job, stock movement

**Offering Snapshot**:
The immutable description and pricing of the Sellable Offering selected on a
Commercial Order line, including its Product unit or Service policy meaning at
that time.
_Avoid_: Current offering, live catalog value

## Service Operations Language

**Service Work Policy**:
The Service Operations rule referenced by a Service Offering to determine
whether an ordered quantity is charge-only or requires tracked work.
_Avoid_: Fulfillment mode, service type

**Service Request**:
Unconfirmed customer intent to obtain one or more Services, without a price
promise, Commercial Order, or reserved work.
_Avoid_: Booking, pending sale, Service Order

**Quote**:
A versioned commercial proposal of offerings, quantities, and prices that may
be accepted to create a Commercial Order.
_Avoid_: Estimate, request total, provisional Order

**Service Intake**:
The operational handover that records selected Service Offerings and optional
customer context, instructions, condition, requested time, promise, or evidence.
_Avoid_: Service Order, check-in, job form

**Service Job**:
An operational work package for tracked quantities from a Commercial Order,
independent from that Order's payment state.
_Avoid_: Service Order, payment record

**Service Job Line**:
An exact quantity of one tracked Service Order line allocated into a Service
Job for operational progress.
_Avoid_: Arbitrary task, Order line

**Work Assignment**:
The audited responsibility of an authorized business member for a Service Job.
_Avoid_: Staff ownership, untracked assignee field

**Due Commitment**:
A merchant's current promise for when Service work will be ready, kept distinct
from a customer's requested time.
_Avoid_: Requested date, payment deadline

**Service Evidence**:
A condition, progress, completion, exception, approval, or handoff record
attached to a Service Job or Service Job Line and private unless published.
_Avoid_: Inventory image, public attachment

**Service Work Event**:
An immutable actor-and-time record of something that happened to Service work.
_Avoid_: Mutable activity note, payment event

**Customer Tracking Access**:
Scoped public access to an allowlisted customer-safe projection of Service
work, without access to the internal Service Job.
_Avoid_: Public Job, shared internal record

**Notification Intent**:
An auditable decision that a customer communication should occur, separate
from message rendering and provider delivery.
_Avoid_: Sent message, delivery receipt
