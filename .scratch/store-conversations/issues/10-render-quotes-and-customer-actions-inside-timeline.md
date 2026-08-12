# 10 — Render Quotes And Customer Actions Inside The Timeline

**What to build:** Present current Quote options, payment, pickup, delivery,
booking, cancellation, reschedule, and human-help actions as structured Store
Conversation messages while preserving exact existing source/action authority
and making stale or completed history understandable.

**Blocked by:** 03 — Support Multiple Typed Requests In One Store Conversation; 05 — Add The Mobile Customer Shell And Universal Store Links

**Status:** ready-for-agent

- [ ] Released Quote Versions append one structured Action Message linked to the
      exact typed source and Quote Version through replay-safe idempotency.
- [ ] Quote presentation shows safe immutable option labels, currency, exact
      totals, selected state, and display-only alternatives without adding
      mutually exclusive choices together.
- [ ] Current actions reuse the server-owned customer-action registry and
      digest-only purpose-bound capabilities rather than duplicating payment,
      booking, fulfilment, or Quote state in messages.
- [ ] Every preview and execution rechecks Tenant, Store, participant,
      source/target version, expiry, selection, lifecycle, availability,
      policy, and current capability immediately before effect.
- [ ] Old messages remain visible while actions render current, completed,
      expired, rejected, revoked, or superseded recovery rather than a usable
      stale button.
- [ ] Consequential actions retain explicit confirmation and payload-bound
      idempotency; concurrent retries create one selection, Order, payment
      handoff, booking, cancellation, or fulfilment choice.
- [ ] `Pay now` opens established provider-hosted checkout and only authoritative
      callback/reconciliation appends payment success/failure; navigation never
      proves payment.
- [ ] Pharmacy actions remain unavailable until current clinical release and
      policy facts pass; commercial approval never substitutes for pharmacist
      release.
- [ ] Web and native timelines support action loading, pending, failure, retry,
      external navigation/return, accessibility, and compact amounts/options.
- [ ] Verified-database acceptance covers multi-option generic Quote, Service,
      and Pharmacy paths through selected-only acceptance and exact Order/
      payment/fulfilment facts.
- [ ] Stale/concurrent/cross-scope/expired/revoked tests prove no partial or
      duplicate effects and no bearer/provider/internal facts in projections.
- [ ] Brain action, Quote, payment, fulfilment, API, permission, feature, and task
      records describe Action Messages as presentation, not authority.
