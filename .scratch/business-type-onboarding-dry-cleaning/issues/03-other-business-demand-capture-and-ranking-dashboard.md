# 03 - Other Business Demand Capture And Ranking Dashboard

**What to build:** Unsupported businesses are captured, grouped, and ranked internally by demand signals, with raw examples visible so Ewatrade can decide the next business template from evidence.

**Blocked by:** 02 - Business-Type Onboarding Selection

**Status:** implemented

- [x] Other onboarding submissions are stored as durable demand signals, preserving both raw text and normalized grouping fields.
- [x] Similar submissions can be grouped into ranked categories without losing the raw examples behind each group.
- [x] Ranking uses at least total submissions, recent submissions, activated tenants, country/currency distribution, business size, repeated phrases/categories, and requested capabilities.
- [x] An internal dashboard or admin surface lists ranked unsupported business categories with summary metrics and sample raw submissions.
- [x] The ranking surface is not merchant-facing and is protected by an appropriate internal/admin authorization boundary.
- [x] Automated tests cover capture, grouping, ranking, sample retrieval, and authorization.
