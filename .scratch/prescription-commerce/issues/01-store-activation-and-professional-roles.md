# 01 - Store Activation And Professional Roles

**What to build:** Give an owner/admin a store-scoped Prescription Commerce setup area where they can configure operating policies, assign prescription roles, record pharmacist credential references, and activate the capability only after every required readiness check passes.

**Blocked by:** None - can start immediately.

**Status:** implemented-source; production acceptance pending

- [ ] Prescription Commerce is disabled by default and cannot receive or process requests until the store passes its readiness checks.
- [ ] Owner/admin users can configure prescription operating hours, service policy, supported fulfilment modes, and customer-contact policy per store.
- [ ] Prescription attendant and pharmacist permissions are store-scoped and do not leak through tenant membership alone.
- [ ] Pharmacist setup records a credential reference and verification status without putting unnecessary professional data into logs or public responses.
- [ ] Every protected prescription action checks the active tenant, store, feature state, and required role and fails closed when context is absent or ambiguous.
- [ ] The setup screen explains each incomplete requirement and supports an explicit activation/deactivation action with audit history.
- [ ] Authorization and tenant-isolation tests cover owners, admins, attendants, pharmacists, ordinary staff, and cross-store access attempts.
