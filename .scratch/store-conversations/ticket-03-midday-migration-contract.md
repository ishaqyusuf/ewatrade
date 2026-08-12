# Ticket 03 Midday Migration Contract

## Reference Compared

- Ticket 02 Store Conversation contracts, guest cookie routes, transactional
  message append, and safe staff/customer projections.
- Existing Commerce Inquiry, public Service Request Form, and public
  Prescription private-media intake commands.
- Midday package boundaries, thin route orchestration, typed server state, and
  explicit loading/error/recovery behavior.

## Migration Principle

Keep Store Conversation as presentation and routing state. Add no universal
Request lifecycle. A customer message either links to one exact existing typed
source, creates the unambiguous Product Inquiry, or remains privately staged
until a deterministic customer choice and the owning Service/Prescription
intake command succeeds.

## Domain And Persistence Plan

- Extend the shared public-entry Request-kind contract with `service` only when
  the Store currently has an active eligible Service Request Form.
- Reuse optional `StoreConversationRequestLink` rows as the commit boundary:
  an unlinked customer message is staged; a linked message belongs to one exact
  Commerce Inquiry, Service Request, or Prescription Request.
- Add only a request-selection command kind for payload-bound replay. Do not
  add a universal Request row, duplicate status, clinical media, or workflow.
- Derive source-safe Request cards from each owning aggregate's current status
  at read time. Terminal state never archives the conversation.

## API And Transaction Plan

- Sending text rechecks current entry kinds and linked active sources after the
  conversation row lock. One eligible active source receives the message; one
  unambiguous Product intent creates a new Inquiry; ambiguity stays unlinked.
- Request selection accepts either one current linked active source or a new
  Product Inquiry. Changed replay, stale/terminal source, foreign scope, and
  already-linked messages fail closed.
- Existing Service and Prescription pages retain their authoritative forms,
  consent, media, policy, and professional gates. Conversation-aware server
  orchestration links the newly returned source id only after that command
  succeeds; source ids are never accepted from the browser.
- Guest/staff timelines return bounded safe Request summaries and staged intent
  state without contacts, clinical content, OCR, provider/object facts, or raw
  source errors.

## UI Plan

- The shared chat tracer opens for web-capable multi-Request entries while
  preserving any simultaneous WhatsApp compatibility projection until its
  later channel-mode ticket.
- Unlinked messages render an in-chat intent card. Product choice commits in
  place; Service and Prescription choices continue through their established
  safe forms and return to the same conversation after successful attachment.
- A compact Request rail shows clear type, safe current status, occurrence time,
  and current/complete distinction. Messages retain exact Request labels.
- Explicit active-Request buttons resolve ambiguity; no customer-facing AI or
  content inference is introduced.

## Testing And Acceptance

- Contract/repository tests cover entry allowlists, auto-link, staged choice,
  exact-source selection, terminal/new separation, stale replay, scope, and
  redaction.
- Existing Service, Prescription, Commerce, Quote, Order and policy suites stay
  green.
- A run-owned verified-Neon seam links Product, Service and Prescription
  sources to one conversation and proves independent lifecycle/isolation and
  cleanup.
- Desktop and 390px browser QA covers staged choice, multiple Request cards,
  active selection, terminal distinction, error/retry and overflow.

## Open Questions

None. General conversation image/document attachment remains Ticket 06. Ticket
03 reuses the already-authoritative Pharmacy prescription upload path only.
