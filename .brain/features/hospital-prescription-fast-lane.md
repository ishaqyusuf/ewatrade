# Hospital Prescription Fast Lane (Superseded Concept)

## Status

Superseded on 2026-08-07 by the broader Prescription Commerce product direction
in `.brain/features/prescription-commerce.md` and
`.brain/decisions/ADR-0026-prescription-commerce-product-and-operating-boundary.md`.
This file remains as historical context for the first hospital-adjacent pilot
case. The old pitch artifact is not the current commercial proposal.

## Opportunity

- The proposed pilot pharmacy sits near a large general hospital gate, roughly
  one kilometre from the main hospital building.
- The working commercial input is more than 1,000 customers carrying hospital
  prescriptions on a normal day. This must be validated during pilot intake.
- The intended outcome is fewer repeated trips for availability, quotation,
  payment, packing, pickup, and delivery coordination.

## Customer Flow

1. A public QR code opens a channel selector without embedding patient data.
2. `Continue online` opens the secure web intake. `Continue on WhatsApp` opens
   the pharmacy's configured WhatsApp chat.
3. The customer sends a clear prescription image and contact details.
4. OCR produces an editable transcription draft.
5. An attendant compares every extracted line with the source image and must
   verify each line individually. Unclear or low-confidence fields remain
   blocked.
6. A licensed pharmacist reviews prescription validity, medicine mapping,
   quantities, availability, prices, and any permitted alternative before
   releasing the quote.
7. The customer accepts the quote, pays, and chooses one fulfilment route:
   - pickup, with the order packed before arrival; or
   - delivery, followed by one location choice: General Hospital at NGN 500,
     or another location with a separately calculated and confirmed fee.
8. The customer receives readiness or delivery status updates through the
   selected communication channel.

## AI And Safety Boundary

- OCR is a transcription assistant only. It cannot approve, price, substitute,
  dispense, charge, or release an order.
- The original prescription remains visible during attendant verification.
- The workflow cannot reach pharmacist review until every line is verified.
- Original OCR text, corrected text, reviewer identity, and timestamps form an
  audit trail.
- The licensed pharmacy remains the seller and operator. A pharmacist remains
  responsible for the clinical and dispensing decision.

## Pilot Direction

- Run one controlled 14-30 day pilot with one pharmacy and one hospital.
- Initial measurement targets in the draft pitch are 200 completed requests,
  median quotation time below ten minutes, at least 50% quote-to-order
  conversion, at least 95% readiness against the promise, and zero safety or
  privacy incidents.
- Web and WhatsApp should create one channel-neutral prescription request and
  one staff work queue.

## Open Decisions Before Implementation

- Pharmacy, hospital, legal, PCN, data-protection, consent, retention, and
  WhatsApp-processing approvals.
- Managed private object storage, malware scanning, signed access, retention,
  and audit policy for prescription images.
- OCR provider selection, processor terms, confidence metadata, and failure
  handling.
- Tenant-specific WhatsApp number onboarding for expansion beyond the first
  pharmacy.
- Pricing and dispatch policy for destinations outside General Hospital.
- Final request states, staff roles, service-level targets, refunds, partial
  fulfilment, cancellation, and exception handling.

## Related Product Areas

- `.brain/modules/whatsapp-commerce.md`
- `.brain/features/generic-service-operations.md`
- `.brain/features/commercial-order-delivery-scheduling.md`
- `.brain/features/ewatrade-dispatch-internal-app.md`
