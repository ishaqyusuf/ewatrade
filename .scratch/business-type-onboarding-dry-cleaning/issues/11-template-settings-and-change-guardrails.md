# 11 - Template Settings And Change Guardrails

**What to build:** Authorized owners/admins can view or correct a business template choice with guardrails and audit history so Product Sales records are not reinterpreted as service orders.

**Blocked by:** 02 - Business-Type Onboarding Selection; 05 - Dry Cleaning Walk-In Service Order Flow

**Status:** implemented

- [x] Authorized owners/admins can view the current effective template and original onboarding answers.
- [x] Authorized owners/admins can request or perform a bounded correction when a business was set up with the wrong template.
- [x] Template changes are audited with actor, timestamp, previous value, new value, reason, and affected tenant/store.
- [x] Changing templates does not reinterpret existing Product Sales records as service orders or existing service orders as stock sales.
- [x] Unsafe template changes are blocked or require an explicit guarded path when existing operational records would be affected.
- [x] Support/admin surfaces can inspect template history for troubleshooting.
- [x] Automated tests cover authorization, audit history, safe correction, blocked unsafe changes, and data preservation.
