# 07 - Dry Cleaning Ready And Delay Notifications

**What to build:** Staff can mark dry-cleaning orders ready or delayed and generate customer notification intents plus manual WhatsApp/SMS copy fallback.

**Blocked by:** 06 - Dry Cleaning Evidence, Notes, And Status Lifecycle

**Status:** ready-for-agent

- [ ] Marking an order ready can create a customer notification intent tied to the service order event.
- [ ] Marking an order delayed can capture a delay note and revised ready/delivery expectation where known.
- [ ] Ready notification copy includes business name, order reference, amount due or total amount, and pickup/delivery instruction.
- [ ] Delay notification copy includes business name, order reference, delay note, and revised expectation where known.
- [ ] The UX supports configured WhatsApp/SMS channel targets where available and manual copy/share fallback where providers are not configured.
- [ ] Notification generation failures do not corrupt the service order status update.
- [ ] Automated tests cover ready notification payloads, delay notification payloads, manual fallback copy, provider-unavailable behavior, and tenant/customer scoping.
