# Define FIFO Reservation, Mixed-Price Order, And Concurrency Semantics

Parent: [Wayfinder: Prepared Inbounds And FIFO Stock Pricing](../map.md)

Type: grilling

Status: open

Blocked by: 03

## Question

How are exact quantities allocated FIFO across layers at reservation time,
represented when one Commercial Order quantity spans several Unit Prices,
snapshotted for customer totals and fulfillment, committed or released, and
protected against concurrent buyers without changing historical Orders?
