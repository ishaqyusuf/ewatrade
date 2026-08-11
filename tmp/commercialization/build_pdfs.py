from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = Path("/Users/M1PRO/Documents/code/ewatrade")
OUT = ROOT / "output" / "pdf"
LOGO = ROOT / "apps" / "marketing" / "public" / "brand" / "ewatrade-logo.png"
OUT.mkdir(parents=True, exist_ok=True)

GREEN = "#079447"
DARK_GREEN = "#056333"
INK = "#111827"
MUTED = "#667085"
LINE = "#D9E1DD"
SOFT = "#EAF7EF"
LIGHT = "#F5F7F6"
YELLOW = "#FFF4CC"
WHITE = "#FFFFFF"
RED = "#C73E3E"


def color(c, value):
    c.setFillColor(c_hex(value))


def c_hex(value):
    from reportlab.lib.colors import HexColor
    return HexColor(value)


def wrap(text, font, size, width):
    words = str(text).split()
    lines, current = [], ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text(c, text, x, y, width, size=11, leading=None, font="Helvetica", fill=INK, max_lines=None):
    leading = leading or size * 1.35
    lines = wrap(text, font, size, width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    color(c, fill)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_bullets(c, items, x, y, width, size=10.5, gap=10, bullet_color=GREEN):
    for item in items:
        c.setFillColor(c_hex(bullet_color))
        c.circle(x + 3, y + 3, 2.5, fill=1, stroke=0)
        y = draw_text(c, item, x + 14, y + 8, width - 14, size=size, leading=size * 1.35) - gap
    return y


def logo(c, x, y, width=130):
    img = ImageReader(str(LOGO))
    c.drawImage(img, x, y, width=width, height=width * 0.28, preserveAspectRatio=True, mask="auto")


def top_rule(c, w, h, label="EWATRADE PRESCRIPTION COMMERCE"):
    c.setFillColor(c_hex(GREEN))
    c.rect(0, h - 8, w, 8, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 7.5)
    color(c, DARK_GREEN)
    c.drawString(38, h - 29, label)


def footer(c, w, page_no, note="Commercial strategy for validation"):
    c.setStrokeColor(c_hex(LINE))
    c.line(38, 31, w - 38, 31)
    c.setFont("Helvetica", 7.5)
    color(c, MUTED)
    c.drawString(38, 18, note)
    c.drawRightString(w - 38, 18, str(page_no))


def section_title(c, kicker, title, subtitle, w, h):
    top_rule(c, w, h)
    c.setFont("Helvetica-Bold", 8)
    color(c, GREEN)
    c.drawString(38, h - 62, kicker.upper())
    y = h - 92
    for line in wrap(title, "Helvetica-Bold", 25, w - 76):
        c.setFont("Helvetica-Bold", 25)
        color(c, INK)
        c.drawString(38, y, line)
        y -= 31
    if subtitle:
        y = draw_text(c, subtitle, 38, y - 2, w - 76, size=10.5, leading=15, fill=MUTED)
    return y - 18


def card(c, x, y, w, h, title, body, accent=GREEN, value=None):
    c.setFillColor(c_hex(WHITE))
    c.setStrokeColor(c_hex(LINE))
    c.roundRect(x, y - h, w, h, 8, fill=1, stroke=1)
    c.setFillColor(c_hex(accent))
    c.roundRect(x, y - h, 5, h, 3, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 10)
    color(c, INK)
    c.drawString(x + 16, y - 22, title)
    ty = y - 40
    if value:
        c.setFont("Helvetica-Bold", 20)
        color(c, accent)
        c.drawString(x + 16, ty, value)
        ty -= 23
    draw_text(c, body, x + 16, ty, w - 30, size=8.8, leading=12, fill=MUTED)


def pill(c, x, y, text, fill=SOFT, text_color=DARK_GREEN):
    width = stringWidth(text, "Helvetica-Bold", 8) + 18
    c.setFillColor(c_hex(fill))
    c.roundRect(x, y - 14, width, 18, 9, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 8)
    color(c, text_color)
    c.drawString(x + 9, y - 9, text)
    return width


def flow(c, steps, x, y, width, compact=False):
    gap = 7
    box_w = (width - gap * (len(steps) - 1)) / len(steps)
    h = 82 if compact else 104
    for i, (num, title, body) in enumerate(steps):
        bx = x + i * (box_w + gap)
        c.setFillColor(c_hex(WHITE))
        c.setStrokeColor(c_hex(LINE))
        c.roundRect(bx, y - h, box_w, h, 7, fill=1, stroke=1)
        c.setFillColor(c_hex(GREEN))
        c.circle(bx + 17, y - 18, 10, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 8)
        color(c, WHITE)
        c.drawCentredString(bx + 17, y - 21, str(num))
        c.setFont("Helvetica-Bold", 8.5)
        color(c, INK)
        for j, line in enumerate(wrap(title, "Helvetica-Bold", 8.5, box_w - 18)[:2]):
            c.drawString(bx + 9, y - 42 - j * 11, line)
        draw_text(c, body, bx + 9, y - 66, box_w - 18, size=7.4, leading=9.5, fill=MUTED, max_lines=4)
        if i < len(steps) - 1:
            c.setStrokeColor(c_hex(GREEN))
            c.setLineWidth(1.5)
            c.line(bx + box_w + 1, y - h / 2, bx + box_w + gap - 1, y - h / 2)


def cover(c, w, h, title, subtitle, audience, mobile=False):
    c.setFillColor(c_hex(DARK_GREEN))
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(c_hex(GREEN))
    c.circle(w * 0.86, h * 0.86, w * 0.42, fill=1, stroke=0)
    c.setFillColor(c_hex("#0FA958"))
    c.circle(w * 0.95, h * 0.07, w * 0.48, fill=1, stroke=0)
    logo(c, 38, h - (95 if mobile else 84), width=145 if mobile else 130)
    y = h * (0.65 if mobile else 0.66)
    size = 34 if mobile else 35
    for line in wrap(title, "Helvetica-Bold", size, w - 76):
        c.setFont("Helvetica-Bold", size)
        color(c, WHITE)
        c.drawString(38, y, line)
        y -= size * 1.12
    y = draw_text(c, subtitle, 38, y - 14, w - 90, size=13 if mobile else 12, leading=18, fill="#D8F3E4")
    c.setFont("Helvetica-Bold", 8.5)
    color(c, WHITE)
    c.drawString(38, 52, audience.upper())
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 38, 52, "AUGUST 2026")


def begin_page(c, w, h, page_no, kicker, title, subtitle="", note="Commercial strategy for validation"):
    y = section_title(c, kicker, title, subtitle, w, h)
    footer(c, w, page_no, note)
    return y


def strategy_pdf():
    path = OUT / "ewatrade-prescription-commerce-commercialization-strategy.pdf"
    w, h = A4
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("EwaTrade Prescription Commerce Commercialization Strategy")
    c.setAuthor("EwaTrade")
    c.setSubject("Internal commercialization strategy for prescription commerce")

    cover(c, w, h, "Prescription Commerce Commercialization Strategy", "A pharmacy-owned digital prescription intake, quotation, payment, pickup, and delivery operating layer.", "Internal EwaTrade leadership")
    c.showPage()

    y = begin_page(c, w, h, 2, "Executive decision", "Build the category around the pharmacy, not a single hospital", "The hospital-gate opportunity is a strong pilot wedge. The product itself should serve prescription demand from any approved source.")
    card(c, 38, y, 250, 118, "Recommendation", "Proceed now with a bounded design-partner pilot, while keeping production launch conditional on operational, privacy, and regulatory readiness.", value="PURSUE")
    card(c, 306, y, 250, 118, "Commercial thesis", "Charge the pharmacy for workflow software and measurable outcomes. Keep medicine sales, clinical judgment, and dispensing with the licensed pharmacy.", accent=DARK_GREEN, value="B2B2C")
    y -= 145
    draw_bullets(c, [
        "Do not build a standalone consumer marketplace first. Start with QR, web link, WhatsApp, and staff-assisted intake.",
        "Use OCR only to create an editable transcription. An attendant checks every line; a licensed pharmacist controls clarification, substitution, approval, and release.",
        "Monetize through implementation, recurring branch subscription, completed-order fees, and optional delivery coordination margin.",
        "Replace every price, conversion, cost, and target hypothesis with baseline and pilot evidence before commercial rollout.",
    ], 42, y, w - 84, size=10.6, gap=13)
    c.showPage()

    y = begin_page(c, w, h, 3, "Product thesis", "One managed route from prescription to fulfilment", "EwaTrade turns fragmented calls, chats, walk-ins, and paper notes into a visible pharmacy workflow.")
    flow(c, [
        (1, "Enter", "QR, web link, WhatsApp, app, or staff-assisted intake"),
        (2, "Send", "Upload or photograph the prescription and add contact details"),
        (3, "Verify", "OCR draft, line-by-line attendant check, pharmacist gate"),
        (4, "Quote", "Availability, price, alternatives, validity, and terms"),
        (5, "Fulfil", "Pay, choose pickup or delivery, receive updates"),
    ], 38, y, w - 76)
    y -= 135
    card(c, 38, y, 164, 124, "Customer job", "Know what is available, what it costs, and when it can be collected or delivered - without unnecessary movement or repeated explanation.")
    card(c, 216, y, 164, 124, "Pharmacy job", "Convert incoming prescriptions into accurate, traceable, paid orders with controlled handoffs and less channel chaos.")
    card(c, 394, y, 164, 124, "EwaTrade job", "Provide the workflow, integrations, evidence, and operational controls without becoming the medicine seller or clinical decision-maker.")
    c.showPage()

    y = begin_page(c, w, h, 4, "Market entry", "Demand can originate anywhere the pharmacy earns trust", "The product is channel-agnostic; the pharmacy decides which sources and delivery lanes it supports.")
    sources = [
        ("Hospital and clinic", "QR posters, discharge desks, outpatient units, referral cards"),
        ("Doctors and diagnostics", "Secure link shared after consultation or test results"),
        ("Pharmacy channels", "Website, social pages, Google profile, call centre, storefront QR"),
        ("Repeat and chronic care", "Refill request, caregiver ordering, saved contact and preferred fulfilment"),
        ("Distant demand", "Approved service zones, manual delivery quote, restricted-item exclusions"),
        ("Walk-in recovery", "Staff capture queues, out-of-stock follow-up, quote now and collect later"),
    ]
    for i, (title, body) in enumerate(sources):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 132, 250, 112, title, body)
    c.showPage()

    y = begin_page(c, w, h, 5, "Customer experience", "The customer flow stays simple even when operations are complex", "QR scan opens a choice: continue online or continue in the pharmacy's WhatsApp chat.")
    flow(c, [
        (1, "Scan or open", "QR or shared web link"),
        (2, "Choose channel", "Online flow or pharmacy WhatsApp"),
        (3, "Upload", "Image/PDF plus contact and fulfilment preference"),
        (4, "Receive quote", "Available, partial, unavailable, or clarification required"),
        (5, "Pay and hand off", "Pickup or configured delivery lane"),
    ], 38, y, w - 76)
    y -= 138
    c.setFillColor(c_hex(SOFT))
    c.roundRect(38, y - 136, w - 76, 136, 10, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 13)
    color(c, DARK_GREEN)
    c.drawString(55, y - 27, "Fulfilment choice")
    card(c, 55, y - 43, 224, 74, "PICKUP", "Pay ahead or reserve; receive a ready notification and pickup code.", accent=GREEN)
    card(c, 296, y - 43, 224, 74, "DELIVERY", "Select an approved zone. Initial local hospital/campus zone may be NGN 500; other locations are calculated or confirmed.", accent=DARK_GREEN)
    y -= 166
    draw_text(c, "The NGN 500 hospital/campus fee is an initial pilot configuration, not a universal product promise.", 42, y, w - 84, size=9.5, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 6, "Feature system I", "Customer, transcription, and pharmacist controls", "Prescription commerce is a controlled workflow, not just an upload form.")
    feature_groups = [
        ("Customer intake", ["QR, shareable link, responsive web", "Continue online or WhatsApp", "Image/PDF upload and capture guidance", "Contact, source, consent, and fulfilment intent", "Status page and notifications"]),
        ("OCR and transcription", ["Image-quality check and clearer-image request", "Line extraction with confidence indicators", "Mandatory line-by-line attendant verification", "Edit history, timestamps, and reviewer identity", "Original image retained under approved policy"]),
        ("Pharmacist control", ["Clinical clarification queue", "Prescription validity and restricted-item gate", "Substitution/alternative approval", "Final quote and release authority", "Exception and rejection reasons"]),
    ]
    for i, (title, items) in enumerate(feature_groups):
        x = 38 + i * 178
        c.setFillColor(c_hex(LIGHT))
        c.roundRect(x, y - 350, 164, 350, 8, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 11)
        color(c, INK)
        c.drawString(x + 14, y - 25, title)
        draw_bullets(c, items, x + 13, y - 55, 140, size=8.8, gap=10)
    c.showPage()

    y = begin_page(c, w, h, 7, "Feature system II", "Quote, payment, fulfilment, and management", "Each request has a visible owner, status, promise, and audit trail.")
    feature_groups = [
        ("Quote and order", ["Full, partial, unavailable, clarification states", "Item, quantity, price, total, validity", "Versioned quote and acceptance", "Payment link, receipt, reconciliation", "Cancellation and refund controls"]),
        ("Pickup and delivery", ["Packing queue and ready status", "Pickup code and authorised collector", "Configurable zone fees and eligibility", "Manual or calculated distant-location fee", "Courier assignment, proof, failure handling"]),
        ("Operations and analytics", ["Role-based staff inbox and SLA timers", "POS/inventory/accounting integration path", "Templates, customer updates, escalations", "Branch/channel/source performance", "Conversion, stock, turnaround, reliability"]),
    ]
    for i, (title, items) in enumerate(feature_groups):
        x = 38 + i * 178
        c.setFillColor(c_hex(LIGHT))
        c.roundRect(x, y - 350, 164, 350, 8, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 11)
        color(c, INK)
        c.drawString(x + 14, y - 25, title)
        draw_bullets(c, items, x + 13, y - 55, 140, size=8.8, gap=10)
    c.showPage()

    y = begin_page(c, w, h, 8, "AI boundary", "AI transcribes; people remain accountable", "The design must reduce typing without automating clinical judgment.")
    steps = [
        ("1. Capture", "Customer submits image or PDF. The system checks legibility and asks for a clearer image when needed."),
        ("2. Extract", "OCR produces a draft list of lines and highlights low-confidence text. It does not create a clinical order."),
        ("3. Verify", "The attendant compares every generated line to the original and confirms or corrects it before proceeding."),
        ("4. Approve", "A licensed pharmacist resolves clinical ambiguity, restricted items, and substitution, then releases the quote."),
    ]
    for i, (title, body) in enumerate(steps):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 138, 250, 116, title, body, accent=GREEN if i < 2 else DARK_GREEN)
    y -= 302
    c.setFillColor(c_hex(YELLOW))
    c.roundRect(38, y - 86, w - 76, 86, 8, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 11)
    color(c, INK)
    c.drawString(54, y - 25, "Non-negotiable release rule")
    draw_text(c, "No quote proceeds from raw OCR output. Verification is line by line, recorded, and followed by the pharmacy's licensed review and dispensing controls.", 54, y - 45, w - 108, size=9.8, leading=14)
    c.showPage()

    y = begin_page(c, w, h, 9, "Commercial architecture", "A hybrid model aligns recurring software value with completed orders", "Commercial terms below are hypotheses for customer discovery and pilot negotiation.")
    cards = [
        ("Implementation", "NGN 250k-750k", "Configuration, workflow mapping, training, launch support, and initial integrations."),
        ("Branch subscription", "NGN 100k-300k / month", "Workflow workspace, roles, dashboards, support, and standard channel operations."),
        ("Completed order", "NGN 100-300", "Fixed fee only when a prescription request becomes a paid medicine order."),
        ("Delivery coordination", "10%-20% margin", "Optional margin on the customer delivery fee where EwaTrade coordinates dispatch."),
        ("Premium services", "Quoted separately", "Additional integrations, SLA, analytics, storage, messaging, and multi-branch controls."),
        ("Customer charge", "Pharmacy-controlled", "Medicine price and delivery fee remain transparent and approved by the pharmacy."),
    ]
    for i, (title, value, body) in enumerate(cards):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 128, 250, 108, title, body, value=value)
    c.showPage()

    y = begin_page(c, w, h, 10, "Illustrative economics", "A decision model, not a revenue claim", "Base-case figures below demonstrate the mechanics for one branch and must be replaced with pharmacy and pilot data.")
    metrics = [
        ("Requests / month", "1,500"), ("Paid orders", "675"), ("Monthly revenue", "NGN 333,573"),
        ("Direct cost", "NGN 132,500"), ("Contribution", "NGN 201,073"), ("Contribution margin", "60.3%"),
    ]
    for i, (label, value) in enumerate(metrics):
        col, row = i % 3, i // 3
        card(c, 38 + col * 178, y - row * 110, 164, 92, label, "Illustrative base scenario", value=value)
    y -= 244
    draw_bullets(c, [
        "The model includes a monthly subscription, completed-order fee, delivery coordination margin, and setup fee amortised over 12 months.",
        "Direct cost includes illustrative OCR, messaging, storage/security, and branch support allowances.",
        "The workbook contains Conservative, Base, and Growth scenarios; a 24-month branch ramp; formula checks; and pilot data capture.",
        "Do not approve pricing from this page. Validate willingness to pay, basket value, pharmacy margin, channel volume, support workload, and delivery economics first.",
    ], 42, y, w - 84, size=10.2, gap=12)
    c.showPage()

    y = begin_page(c, w, h, 11, "Go-to-market", "Win one design partner, prove the workflow, then sell a repeatable operating system", "The first pharmacy is a learning partnership and reference case, not the definition of the market.")
    phases = [
        ("1", "Design partner", "Executive sponsor, branch owner, pharmacist lead, customer service, finance/POS, privacy/legal, and dispatch owner."),
        ("2", "Active test", "Baseline observation, prototype walkthrough, shadow-mode transcription, controlled live orders, daily issue review."),
        ("3", "Proof package", "Measured conversion, turnaround, readiness, staff workload, customer trust, safety, and privacy evidence."),
        ("4", "Repeatable sale", "Segment playbook for hospital-adjacent, urban delivery, multi-branch, and chronic-care pharmacies."),
    ]
    for i, (num, title, body) in enumerate(phases):
        c.setFillColor(c_hex(SOFT if i % 2 == 0 else LIGHT))
        c.roundRect(38, y - 88 - i * 101, w - 76, 82, 8, fill=1, stroke=0)
        c.setFillColor(c_hex(GREEN))
        c.circle(65, y - 47 - i * 101, 15, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 11)
        color(c, WHITE)
        c.drawCentredString(65, y - 51 - i * 101, num)
        c.setFont("Helvetica-Bold", 11)
        color(c, INK)
        c.drawString(92, y - 35 - i * 101, title)
        draw_text(c, body, 92, y - 56 - i * 101, w - 148, size=9.3, leading=13, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 12, "Pilot scorecard", "Commercial conversion is primary; speed and reliability must support it", "Targets are provisional gates. Guardrails override growth metrics.")
    metrics = [
        ("Primary", "Quote-to-paid conversion", ">= 50% hypothesis"),
        ("Primary", "Median quotation turnaround", "<= 10 min hypothesis"),
        ("Primary", "Ready-on-promise rate", ">= 95% hypothesis"),
        ("Driver", "Image clarification", "Measure friction"),
        ("Driver", "OCR line correction", "Measure workload"),
        ("Driver", "Full availability", "Measure stock coverage"),
        ("Driver", "Delivery selection", "Size dispatch demand"),
        ("Guardrail", "Safety/privacy/pharmacy errors", "Zero tolerance"),
    ]
    for i, (kind, metric, target) in enumerate(metrics):
        row_y = y - i * 48
        c.setFillColor(c_hex(SOFT if kind == "Primary" else (YELLOW if kind == "Guardrail" else LIGHT)))
        c.roundRect(38, row_y - 37, w - 76, 36, 5, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 8)
        color(c, DARK_GREEN if kind != "Guardrail" else RED)
        c.drawString(50, row_y - 23, kind.upper())
        c.setFont("Helvetica-Bold", 9.5)
        color(c, INK)
        c.drawString(126, row_y - 23, metric)
        c.setFont("Helvetica", 9)
        color(c, MUTED)
        c.drawRightString(w - 50, row_y - 23, target)
    c.showPage()

    y = begin_page(c, w, h, 13, "Evidence plan", "Collect the facts that determine product, pricing, and authority", "No patient names, prescription images, phone numbers, diagnoses, or medicine details belong in the commercial pilot workbook.")
    groups = [
        ("Demand", "Requests by day/hour and channel; average lines; source mix; abandonment reasons."),
        ("Commercial", "Average basket, pharmacy gross margin, lost-sale value, willingness to pay, approval path."),
        ("Operations", "Current quote time, staff minutes, availability outcomes, packing and pickup wait."),
        ("Delivery", "Zone demand, fees, courier payout, distance, failure rate, eligibility and cold-chain rules."),
        ("Customer", "Web vs WhatsApp preference, trust, payment preference, delivery willingness."),
        ("Technical", "POS/inventory/accounting systems, WhatsApp provider/number, devices, connectivity, access."),
        ("Compliance", "PCN role/licence pathway, privacy roles, retention, processor terms, delivery SOP."),
        ("Risk", "Misread text, impersonation, leakage, incorrect fulfilment, controlled items, downtime."),
    ]
    for i, (title, body) in enumerate(groups):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 101, 250, 84, title, body)
    c.showPage()

    y = begin_page(c, w, h, 14, "Governance", "The pharmacy remains the regulated clinical and commercial operator", "EwaTrade provides technology and workflow controls. Final structure must be confirmed with pharmacy leadership, PCN guidance, and Nigerian privacy counsel.")
    card(c, 38, y, 250, 126, "Pharmacy owns", "Medicine catalogue and price; professional review; substitution; dispensing; sale; controlled-item policy; packing; customer promise; refund authority.", accent=DARK_GREEN)
    card(c, 306, y, 250, 126, "EwaTrade provides", "Intake, transcription assistance, role-based workflow, quote/order/payment orchestration, messages, fulfilment coordination, reporting, and audit evidence.")
    y -= 154
    draw_bullets(c, [
        "Confirm the applicable electronic-pharmacy licence and role arrangement before production launch.",
        "Document controller/processor responsibilities, lawful basis, consent where required, retention, access, deletion, incident response, and subprocessor terms.",
        "Use managed private object storage, time-limited access, encryption, least privilege, audit logs, backups, and tested recovery for prescription media.",
        "Define explicit delivery exclusions and escalation for cold-chain, restricted, controlled, or clinically unsuitable items.",
        "Treat legal interpretation and implementation guidance as launch dependencies, not assumptions hidden inside the product.",
    ], 42, y, w - 84, size=10, gap=11)
    c.showPage()

    y = begin_page(c, w, h, 15, "Roadmap", "Advance through evidence gates, not feature volume", "The workforce commitment enables speed; governance and operating truth determine readiness.")
    phases = [
        ("0-2 weeks", "Discovery and authority", "Sponsor alignment, baseline, workflow map, data map, licence/privacy questions, commercial hypotheses."),
        ("3-6 weeks", "Concierge MVP", "QR/web/WhatsApp intake, OCR draft, verification, pharmacist quote, pickup, fixed local zone, manual other-zone quote."),
        ("7-10 weeks", "Controlled live pilot", "Payments, notifications, operations dashboard, service levels, de-identified metrics, daily exception review."),
        ("11-14 weeks", "Decision and hardening", "Pricing decision, ROI case, security controls, SOPs, integrations, delivery policy, support model."),
        ("After gate", "Repeatable rollout", "Multi-branch configuration, partner onboarding, channel kits, analytics, approved service lanes."),
    ]
    for i, (time, title, body) in enumerate(phases):
        row_y = y - i * 78
        c.setFont("Helvetica-Bold", 9)
        color(c, GREEN)
        c.drawString(38, row_y - 16, time)
        c.setStrokeColor(c_hex(GREEN))
        c.line(38, row_y - 26, 112, row_y - 26)
        c.setFont("Helvetica-Bold", 11)
        color(c, INK)
        c.drawString(132, row_y - 16, title)
        draw_text(c, body, 132, row_y - 36, w - 170, size=8.8, leading=12, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 16, "Decision gates", "What must be true before expanding beyond the pilot", "A failed guardrail stops rollout even when demand is strong.")
    gates = [
        ("DESIRABILITY", "Customers understand and trust remote quotation; a meaningful share of approved quotes becomes paid orders."),
        ("VIABILITY", "The pharmacy sees measurable incremental or retained value; pricing clears support and variable costs."),
        ("FEASIBILITY", "Staff can verify, quote, pack, and hand off within target workload and service levels."),
        ("SAFETY", "Pharmacist controls, restricted-item rules, and release accountability operate without bypass."),
        ("PRIVACY", "Data roles, access, storage, retention, deletion, processor terms, and incident response are approved."),
        ("REPEATABILITY", "Configuration and onboarding can be repeated without bespoke rebuilding for each pharmacy."),
    ]
    for i, (title, body) in enumerate(gates):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 126, 250, 106, title, body, accent=RED if title in ["SAFETY", "PRIVACY"] else GREEN)
    c.showPage()

    y = begin_page(c, w, h, 17, "Sources and caveats", "Evidence used - and what it does not prove", "Official sources frame the regulatory questions. Category examples validate customer behaviour only; they do not prove EwaTrade demand or performance.")
    source_items = [
        ("Pharmacy Council of Nigeria - Electronic Pharmacy Regulations 2026", "https://pcn.gov.ng/wp-content/uploads/2026/04/Electronic-Pharmacy-Regulation-2026-B81-108.pdf"),
        ("Pharmacy Council of Nigeria - Publications", "https://pcn.gov.ng/about-pharmacy-council-nigeria/publications/"),
        ("Nigeria Data Protection Act 2023", "https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf"),
        ("Drugstore.ng - category workflow example", "https://drugstore.ng/"),
        ("Sanlive Pharmacy - prescription upload example", "https://sanlivepharmacy.com/upload/prescription"),
        ("Amkamed - WhatsApp prescription workflow example", "https://www.amkamed.com/our-services"),
    ]
    for i, (name, url) in enumerate(source_items):
        c.setFont("Helvetica-Bold", 9.5)
        color(c, INK)
        c.drawString(38, y - i * 67, name)
        draw_text(c, url, 38, y - 18 - i * 67, w - 76, size=7.8, leading=10, fill=GREEN)
    c.setFillColor(c_hex(YELLOW))
    c.roundRect(38, 90, w - 76, 70, 8, fill=1, stroke=0)
    draw_text(c, "Pricing, volumes, costs, conversion targets, timelines, and pharmacy ROI are hypotheses. They are included to make validation concrete, not to represent committed commercial terms or forecast performance.", 54, 132, w - 108, size=9.4, leading=13)
    c.save()
    return path


def partnership_pdf():
    path = OUT / "ewatrade-prescription-commerce-pharmacy-partnership.pdf"
    w, h = A4
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setTitle("EwaTrade Prescription Commerce Pharmacy Partnership Proposal")
    c.setAuthor("EwaTrade")
    c.setSubject("Pharmacy partnership proposal for digital prescription commerce")
    cover(c, w, h, "Turn every prescription into a managed digital order", "A pharmacy-owned service for quotation, payment, pickup, and delivery - powered by EwaTrade.", "Pharmacy partnership proposal")
    c.showPage()

    y = begin_page(c, w, h, 2, "The opportunity", "Customers should not need to travel just to discover price and availability", "Prescription demand reaches a pharmacy through many channels. Today, staff and customers often coordinate it through fragmented calls, chats, and physical visits.", "Confidential partnership proposal")
    card(c, 38, y, 250, 130, "For customers", "Get a clear, pharmacy-approved quote remotely; pay ahead; choose pickup or an eligible delivery option; receive timely updates.")
    card(c, 306, y, 250, 130, "For the pharmacy", "Create one visible queue for prescription intake, verification, quotation, payment, packing, handoff, and performance reporting.")
    y -= 160
    draw_text(c, "The same service can support prescriptions from:", 38, y, w - 76, size=12, font="Helvetica-Bold")
    y -= 28
    draw_bullets(c, ["Nearby hospitals and clinics", "Doctors and diagnostic centres", "Distant hospitals within approved service lanes", "The pharmacy website, social pages, WhatsApp, and storefront", "Repeat customers, caregivers, and chronic-care refill workflows"], 42, y, w - 84, size=10.8, gap=13)
    c.showPage()

    y = begin_page(c, w, h, 3, "How it works", "A simple customer journey with professional controls behind it", "The QR code or link opens a choice: continue online or continue in the pharmacy's WhatsApp chat.", "Confidential partnership proposal")
    flow(c, [
        (1, "Open", "Scan QR or use a shared link"),
        (2, "Choose", "Online service or pharmacy WhatsApp"),
        (3, "Send", "Upload the prescription and contact details"),
        (4, "Approve", "Staff verify; pharmacist releases quote"),
        (5, "Fulfil", "Pay, pickup, or choose eligible delivery"),
    ], 38, y, w - 76)
    y -= 143
    card(c, 38, y, 250, 118, "PICKUP", "The order can be packed before arrival. The customer receives a ready notification and presents a pickup code or approved identification.", accent=GREEN)
    card(c, 306, y, 250, 118, "DELIVERY", "The pharmacy can offer configured zones: an initial hospital/campus lane may be NGN 500, while other locations are calculated or confirmed.", accent=DARK_GREEN)
    y -= 146
    draw_text(c, "Delivery eligibility and fees remain configurable by the pharmacy and can reflect distance, item type, operating hours, courier availability, and regulatory policy.", 42, y, w - 84, size=9.8, leading=14, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 4, "AI with accountability", "Faster transcription without surrendering professional judgment", "OCR helps reduce retyping. It is never the final authority.", "Confidential partnership proposal")
    steps = [
        ("Image check", "The service checks capture quality and requests a clearer image when needed."),
        ("OCR draft", "The system extracts likely prescription lines and highlights uncertainty."),
        ("Line-by-line check", "An attendant compares every generated line with the original image and corrects any difference."),
        ("Pharmacist release", "A licensed pharmacist handles clarification, alternatives, restrictions, approval, and dispensing controls."),
    ]
    for i, (title, body) in enumerate(steps):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 139, 250, 118, title, body)
    y -= 306
    c.setFillColor(c_hex(YELLOW))
    c.roundRect(38, y - 86, w - 76, 86, 8, fill=1, stroke=0)
    draw_text(c, "The system does not diagnose, prescribe, or automatically substitute medicine. The pharmacy remains accountable for professional review, sale, and dispensing.", 54, y - 28, w - 108, size=10.5, leading=15, font="Helvetica-Bold")
    c.showPage()

    y = begin_page(c, w, h, 5, "Complete service", "Everything required to manage the order from first contact to handoff", "EwaTrade connects the customer-facing experience to the pharmacy's operating queue.", "Confidential partnership proposal")
    features = [
        ("Intake", "QR, web link, WhatsApp, mobile capture, image/PDF upload, consent and contact."),
        ("Verification", "Image quality, OCR draft, line correction, audit history, exception queue."),
        ("Quotation", "Availability status, itemised price, partial quote, clarification, validity and alternatives."),
        ("Payment", "Accept quote, payment link, receipt, reconciliation, cancellation and refund handling."),
        ("Pickup", "Packing queue, ready notification, pickup code, authorised collector and handoff record."),
        ("Delivery", "Zones, fees, eligibility, dispatch assignment, tracking, proof and failure handling."),
        ("Operations", "Staff roles, ownership, timers, templates, escalation, branch and channel configuration."),
        ("Management", "Conversion, turnaround, availability, reliability, revenue and source analytics."),
    ]
    for i, (title, body) in enumerate(features):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 100, 250, 82, title, body)
    c.showPage()

    y = begin_page(c, w, h, 6, "Business value", "A better experience that also improves operational visibility", "The partnership is designed around outcomes the pharmacy can measure.", "Confidential partnership proposal")
    values = [
        ("Convert more demand", "Capture prescriptions before customers travel or buy elsewhere."),
        ("Reduce avoidable waiting", "Quote and pack before pickup, with clearer promises and status."),
        ("Control every handoff", "See who verified, approved, packed, assigned, and completed each request."),
        ("Extend service reach", "Offer selected delivery zones without making every location a universal promise."),
        ("Learn what drives sales", "Measure sources, availability, quote time, conversion, delivery choice, and failures."),
        ("Build lasting customer trust", "Use transparent quotes, pharmacist oversight, reliable updates, and traceable resolution."),
    ]
    for i, (title, body) in enumerate(values):
        col, row = i % 2, i // 2
        card(c, 38 + col * 268, y - row * 128, 250, 108, title, body)
    c.showPage()

    y = begin_page(c, w, h, 7, "Design-partner pilot", "Start controlled, learn quickly, and protect normal pharmacy operations", "The pilot is configured with the pharmacy team and expands only after agreed service and safety gates.", "Confidential partnership proposal")
    phases = [
        ("Discover", "Map current prescription channels, responsibilities, stock workflow, customer questions, delivery rules, and compliance requirements."),
        ("Configure", "Launch QR/web/WhatsApp intake, verification queue, pharmacist quote, pickup, and selected delivery lanes."),
        ("Operate", "Run a controlled set of real requests with staff support, daily exception review, and clear escalation."),
        ("Measure", "Review conversion, quote time, ready-on-promise, workload, customer feedback, stock coverage, safety, and privacy."),
        ("Decide", "Agree the production scope, integrations, commercial terms, service levels, and rollout sequence."),
    ]
    for i, (title, body) in enumerate(phases):
        c.setFillColor(c_hex(SOFT if i % 2 == 0 else LIGHT))
        c.roundRect(38, y - 69 - i * 76, w - 76, 62, 7, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 10.5)
        color(c, INK)
        c.drawString(54, y - 31 - i * 76, title)
        draw_text(c, body, 143, y - 28 - i * 76, w - 197, size=8.7, leading=12, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 8, "Partnership roles", "Clear ownership keeps the service safe and commercially credible", "The operating and regulatory model is confirmed before production launch.", "Confidential partnership proposal")
    card(c, 38, y, 250, 154, "The pharmacy", "Provides executive sponsor, licensed pharmacist oversight, catalogue and pricing authority, prescription and substitution policy, dispensing, packing, refund approval, and delivery eligibility rules.", accent=DARK_GREEN)
    card(c, 306, y, 250, 154, "EwaTrade", "Provides product configuration, intake channels, workflow, transcription assistance, ordering and payment orchestration, customer updates, fulfilment coordination, reporting, training, and technical support.")
    y -= 184
    draw_text(c, "Production readiness includes:", 38, y, w - 76, size=12, font="Helvetica-Bold")
    y -= 28
    draw_bullets(c, ["Approved PCN/electronic-pharmacy role and licence pathway", "Documented privacy roles, retention, access, deletion, and incident response", "Managed private prescription media storage and audit logs", "Delivery SOP and exclusions for restricted, controlled, cold-chain, or unsuitable items", "Staff training, service levels, fallback procedures, and management reporting"], 42, y, w - 84, size=10.2, gap=12)
    c.showPage()

    y = begin_page(c, w, h, 9, "Next step", "Approve a discovery workshop and pilot design", "The immediate goal is a jointly approved operating blueprint - not a premature technology rollout.", "Confidential partnership proposal")
    card(c, 38, y, w - 76, 108, "WORKSHOP OUTPUT", "Current-state map, target customer flow, staff roles, service zones, compliance questions, integration scope, pilot cohort, measurement plan, and decision calendar.", value="90-120 MINUTES")
    y -= 143
    draw_text(c, "Suggested participants", 38, y, w - 76, size=12, font="Helvetica-Bold")
    y -= 28
    draw_bullets(c, ["Owner or executive sponsor", "Superintendent or pharmacist lead", "Branch/operations manager", "Customer service or WhatsApp owner", "Finance/POS or inventory owner", "Privacy/legal representative", "Dispatch or delivery owner"], 42, y, w - 84, size=10.5, gap=10)
    c.setFillColor(c_hex(DARK_GREEN))
    c.roundRect(38, 74, w - 76, 78, 8, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 14)
    color(c, WHITE)
    c.drawString(56, 121, "EwaTrade Prescription Commerce")
    c.setFont("Helvetica", 9.5)
    c.drawString(56, 99, "A safer, faster route from prescription to pharmacy fulfilment.")
    c.save()
    return path


def mobile_pdf():
    path = OUT / "ewatrade-prescription-commerce-mobile-pitch.pdf"
    w, h = 540, 960
    c = canvas.Canvas(str(path), pagesize=(w, h))
    c.setTitle("EwaTrade Prescription Commerce Mobile Pitch")
    c.setAuthor("EwaTrade")
    c.setSubject("Mobile-first prescription commerce pitch")
    cover(c, w, h, "Prescription to fulfilment - without unnecessary movement", "A pharmacy-owned digital service powered by EwaTrade.", "Mobile pitch", mobile=True)
    c.showPage()

    y = begin_page(c, w, h, 2, "The idea", "Let customers ask the pharmacy before they travel", "Send a prescription. Receive an approved quote. Pay. Choose pickup or eligible delivery.", "Mobile pitch | Shareable by WhatsApp")
    card(c, 38, y, w - 76, 128, "ONE SIMPLE SERVICE", "Works for nearby hospitals, distant approved locations, clinics, doctors, diagnostics, pharmacy channels, caregivers, and repeat customers.", value="ANY APPROVED SOURCE")
    y -= 165
    draw_bullets(c, ["Fewer unnecessary trips", "Faster answers on price and availability", "Orders can be packed before pickup", "Delivery extends reach where the pharmacy permits", "Every request has a visible status and owner"], 42, y, w - 84, size=14, gap=18)
    c.showPage()

    y = begin_page(c, w, h, 3, "Entry point", "Scan once. Choose how to continue.", "The QR code opens a page with two clear options.", "Mobile pitch | Shareable by WhatsApp")
    card(c, 38, y, w - 76, 152, "CONTINUE ONLINE", "A phone-first guided flow for image upload, contact details, quote status, payment, pickup, and delivery.", accent=GREEN, value="WEB")
    y -= 184
    card(c, 38, y, w - 76, 152, "CONTINUE ON WHATSAPP", "Opens the pharmacy's WhatsApp chat using the same approved messaging service and operating queue.", accent=DARK_GREEN, value="WHATSAPP")
    y -= 186
    draw_text(c, "No app installation is required for the first release.", 38, y, w - 76, size=15, font="Helvetica-Bold", fill=GREEN)
    c.showPage()

    y = begin_page(c, w, h, 4, "The flow", "From image to pharmacy-approved quote", "Simple outside. Controlled inside.", "Mobile pitch | Shareable by WhatsApp")
    stages = [
        ("1", "Send prescription", "Photo or PDF plus contact details"),
        ("2", "OCR creates a draft", "Low-confidence text is highlighted"),
        ("3", "Attendant checks every line", "Original image and extracted text are compared"),
        ("4", "Pharmacist approves", "Clarification, alternatives, restrictions, and final quote"),
        ("5", "Customer decides", "Accept, pay, pickup, or choose delivery"),
    ]
    for i, (num, title, body) in enumerate(stages):
        row_y = y - i * 132
        c.setFillColor(c_hex(SOFT if i % 2 == 0 else LIGHT))
        c.roundRect(38, row_y - 108, w - 76, 100, 10, fill=1, stroke=0)
        c.setFillColor(c_hex(GREEN))
        c.circle(71, row_y - 58, 19, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 13)
        color(c, WHITE)
        c.drawCentredString(71, row_y - 63, num)
        c.setFont("Helvetica-Bold", 14)
        color(c, INK)
        c.drawString(105, row_y - 43, title)
        draw_text(c, body, 105, row_y - 67, w - 152, size=11.5, leading=16, fill=MUTED)
    c.showPage()

    y = begin_page(c, w, h, 5, "AI safety", "OCR helps with typing. It does not make the clinical decision.", "Human checks are built into the operating flow.", "Mobile pitch | Shareable by WhatsApp")
    card(c, 38, y, w - 76, 144, "1. MACHINE DRAFT", "The system reads the image and produces editable text with confidence indicators.", value="OCR")
    y -= 174
    card(c, 38, y, w - 76, 144, "2. MANDATORY VERIFICATION", "The attendant checks the generated result line by line against the original prescription.", value="HUMAN CHECK")
    y -= 174
    card(c, 38, y, w - 76, 144, "3. PROFESSIONAL RELEASE", "A licensed pharmacist handles ambiguity, alternatives, restrictions, approval, and dispensing controls.", accent=DARK_GREEN, value="PHARMACIST")
    y -= 180
    draw_text(c, "No raw OCR output becomes a customer quote.", 38, y, w - 76, size=15, font="Helvetica-Bold", fill=RED)
    c.showPage()

    y = begin_page(c, w, h, 6, "Fulfilment", "Pickup or delivery - the customer chooses one", "The pharmacy controls price, eligibility, timing, and service area.", "Mobile pitch | Shareable by WhatsApp")
    card(c, 38, y, w - 76, 158, "PICKUP", "Pay ahead or reserve. The pharmacy packs the order and sends a ready notification with pickup instructions.", value="READY BEFORE ARRIVAL")
    y -= 190
    card(c, 38, y, w - 76, 158, "1. GENERAL HOSPITAL / CAMPUS", "Initial local-zone example: NGN 500 delivery. Final configuration is agreed with the pharmacy.", value="NGN 500")
    y -= 190
    card(c, 38, y, w - 76, 158, "2. OTHER LOCATIONS", "Fee is calculated or confirmed based on the approved zone, distance, medicine eligibility, and courier availability.", accent=DARK_GREEN, value="CALCULATED / CONFIRMED")
    c.showPage()

    y = begin_page(c, w, h, 7, "What the pharmacy gets", "One operating system for every prescription channel", "A shared queue replaces fragmented calls, chats, and manual follow-up.", "Mobile pitch | Shareable by WhatsApp")
    draw_bullets(c, [
        "QR, web link, WhatsApp, and staff-assisted intake",
        "OCR draft with line-by-line verification",
        "Pharmacist clarification and approval queue",
        "Availability and itemised quotation",
        "Payment, receipt, cancellation, and refund controls",
        "Packing, pickup code, and handoff record",
        "Delivery zones, dispatch, tracking, and proof",
        "Roles, service timers, notifications, and audit history",
        "Conversion, turnaround, stock, reliability, and revenue analytics",
        "Path to POS, inventory, accounting, and EwaTrade integration",
    ], 42, y, w - 84, size=13, gap=14)
    c.showPage()

    y = begin_page(c, w, h, 8, "Why it matters", "Better customer experience. Better pharmacy control.", "The same workflow can serve one hospital, a city, or approved distant lanes.", "Mobile pitch | Shareable by WhatsApp")
    cards = [
        ("CONVERSION", "Capture demand before it walks away"),
        ("SPEED", "Quote and pack before arrival"),
        ("REACH", "Offer delivery where the pharmacy approves"),
        ("CONTROL", "Know who handled every step"),
        ("TRUST", "Keep the pharmacist at the release gate"),
    ]
    for i, (title, body) in enumerate(cards):
        card(c, 38, y - i * 125, w - 76, 104, title, body, value=str(i + 1).zfill(2))
    c.showPage()

    y = begin_page(c, w, h, 9, "Pilot", "Start with a controlled active test", "The system is proven with real operations before wider rollout.", "Mobile pitch | Shareable by WhatsApp")
    draw_bullets(c, [
        "Map the current prescription journey",
        "Configure pharmacy roles, templates, and service zones",
        "Train attendants and pharmacist reviewers",
        "Run a controlled live cohort",
        "Measure quote-to-paid conversion",
        "Measure quotation turnaround and ready-on-promise",
        "Track staff workload and OCR correction",
        "Require zero safety, privacy, and pharmacy-error incidents",
        "Agree integrations, commercial terms, and rollout only after the evidence review",
    ], 42, y, w - 84, size=13.5, gap=16)
    c.showPage()

    y = begin_page(c, w, h, 10, "Partnership", "The pharmacy remains the seller and professional authority", "EwaTrade provides the digital workflow, integration path, and operational evidence.", "Mobile pitch | Shareable by WhatsApp")
    card(c, 38, y, w - 76, 154, "PHARMACY", "Owns medicine price, clinical review, substitution, dispensing, customer promise, refund authority, and delivery eligibility.", accent=DARK_GREEN)
    y -= 186
    card(c, 38, y, w - 76, 154, "EWATRADE", "Provides intake, OCR assistance, verification workflow, quotation, ordering, payment orchestration, fulfilment coordination, reporting, training, and support.")
    y -= 196
    c.setFillColor(c_hex(DARK_GREEN))
    c.roundRect(38, y - 142, w - 76, 142, 10, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 22)
    color(c, WHITE)
    c.drawString(58, y - 45, "Next step")
    draw_text(c, "Approve a pharmacy discovery workshop and pilot design.", 58, y - 76, w - 116, size=15, leading=21, font="Helvetica-Bold", fill=WHITE)
    draw_text(c, "Regulatory and privacy structure will be confirmed before production launch.", 58, y - 118, w - 116, size=10.5, leading=15, fill="#D8F3E4")
    c.save()
    return path


if __name__ == "__main__":
    paths = [strategy_pdf(), partnership_pdf(), mobile_pdf()]
    for path in paths:
        print(path)
