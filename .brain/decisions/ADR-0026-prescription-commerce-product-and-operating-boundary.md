# ADR-0026: Prescription Commerce Product And Operating Boundary

## Status

Accepted as a commercialization and validation direction on 2026-08-07.
Implementation and production launch remain unapproved until the evidence and
readiness gates in `.brain/features/prescription-commerce.md` are met.

## Context

The initial opportunity came from a large pharmacy serving customers around a
general hospital. Framing the product as a one-hospital fast lane would make a
useful pilot constraint look like a permanent product boundary. The workflow
also handles sensitive prescription media, relies on imperfect OCR, crosses
commerce and delivery, and may be mistaken for EwaTrade selling or clinically
approving medicine.

## Decision

- The durable category is `Prescription Commerce`, not `Hospital Prescription
  Fast Lane`.
- Hospitals and clinics are acquisition sources and potential pilot partners;
  the licensed pharmacy is the customer, seller, clinical authority, and
  dispensing operator.
- EwaTrade is the technology and workflow layer. It does not diagnose,
  prescribe, automatically substitute, approve, sell, or dispense medicine.
- Customer entry is channel-neutral: QR and link may continue online or open
  the pharmacy's WhatsApp chat, and both routes converge on one pharmacy-owned
  request queue.
- OCR produces an editable transcription only. Mandatory line-by-line attendant
  verification and licensed-pharmacist release are hard gates.
- Pickup and delivery are explicit alternatives. Delivery fees and eligibility
  are pharmacy-configured service-zone policy, not universal promises.
- The commercialization model is hybrid B2B2C: implementation, branch
  subscription, fixed completed-order fee, optional delivery coordination
  margin, and premium services. All current prices and target values are
  hypotheses pending discovery and pilot evidence.
- Production launch depends on PCN/electronic-pharmacy role confirmation,
  Nigerian privacy approval, private prescription-media controls, delivery
  SOPs, and explicit operational ownership.

## Consequences

- Product and sales materials can address hospital-adjacent, urban, distant,
  multi-branch, chronic-care, and pharmacy-channel demand without promising a
  marketplace.
- The first pharmacy may be a strong design partner without dictating the
  permanent data model or commercial terms.
- Existing generic request, quote, order, payment, stock, communication, and
  delivery primitives can be reused, but prescription media, inbound WhatsApp,
  pharmacist controls, and dispatch execution remain new or incomplete work.
- Pilot measurement must separate customer conversion, operational drivers,
  and zero-tolerance safety/privacy guardrails.
- Commercial artifacts must label pricing, volumes, costs, ROI, timelines, and
  KPI targets as validation hypotheses until evidence replaces them.
