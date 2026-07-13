
# Dispatch Network

Dispatch providers can onboard as:

- individual riders
- courier companies
- fleet operators
- 3PL providers

Capabilities:

- verification system
- service zones
- delivery bidding
- reputation scoring

## Ewatrade Dispatch Wayfinder

The internal delivery-app Wayfinder is resolved in `.scratch/wayfinder-ewatrade-dispatch-internal-delivery-app/`.

Resolved direction:

- The v1 rider app is **Ewatrade Dispatch**.
- V1 is invite-only and internal-first for handpicked approved riders/dispatchers.
- Merchant apps create delivery requests; the Dispatch app owns rider availability, assignment acknowledgement, pickup/dropoff updates, proof, and incidents.
- Product Sales, Dry Cleaning/Laundry, and future templates should feed one delivery request lifecycle through source-specific adapters.
- Operations assignment is manual in v1. External provider bidding, automated matching, distance pricing, public provider discovery, and self-serve registration remain future-gated.

See `.brain/features/ewatrade-dispatch-internal-app.md`.
