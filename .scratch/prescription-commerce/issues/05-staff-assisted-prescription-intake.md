# 05 - Staff-Assisted Prescription Intake

**What to build:** Let authorized pharmacy staff create a Prescription Request for a walk-in or telephone customer while preserving source attribution, consent evidence, auditability, and the same downstream processing lifecycle used by self-service intake.

**Blocked by:** 04 - Public Channel Selection And Private Web Intake

**Status:** implemented-source; production acceptance pending

- [ ] An authorized attendant can start staff-assisted intake from the active store and identify the source as walk-in or telephone.
- [ ] The form captures the minimum customer/contact, consent, fulfilment intent, and media or manual-intake information required by store policy.
- [ ] Submission creates the same Prescription Request aggregate and enters the same store queue as web or WhatsApp intake.
- [ ] The audit trail identifies the assisting staff member without representing them as the customer or prescribing professional.
- [ ] Retry and duplicate-submission protection prevent multiple requests from a single assisted intake.
- [ ] Staff cannot create, view, or mutate assisted requests outside their active store and authorized prescription role.
- [ ] Tests prove downstream review behavior does not branch merely because the request was staff-assisted.
