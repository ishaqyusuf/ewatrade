# 06 - Dry Cleaning Evidence, Notes, And Status Lifecycle

**What to build:** Dry-cleaning service orders support package notes, optional photo/video evidence metadata, and clear status transitions through the service lifecycle.

**Blocked by:** 05 - Dry Cleaning Walk-In Service Order Flow

**Status:** ready-for-agent

- [ ] Staff can add package notes such as stain notes, missing buttons, special instructions, or bag details.
- [ ] Staff can attach or record metadata for optional photos and short videos associated with the service order.
- [ ] Media evidence is recommended in the UI but does not block order creation in v1.
- [ ] Media evidence remains private to authorized business users unless a future customer-facing policy explicitly allows exposure.
- [ ] Orders can transition through received, in progress, ready, delayed, pickup pending or delivery pending, completed, and cancelled states.
- [ ] Invalid status transitions are blocked or handled predictably.
- [ ] Automated tests cover notes, media metadata, status transitions, privacy/scoping, and invalid transitions.
