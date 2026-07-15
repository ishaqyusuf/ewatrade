# 04 — Sales-Rep Home Screen

**What to build:** Sales reps get a role-specific home screen focused on daily selling work instead of admin business management.

**Blocked by:** 01 — Mobile Role Navigation Foundation.

**Status:** implementation-complete; runtime visual QA pending

- [x] Sales-rep home is visually and structurally different from admin home.
- [x] Sales-rep home prioritizes current session, quick sale, assigned stock, recent sales, customer lookup, sync status, and closeout/end-shift work.
- [x] Admin-only tools such as Sales Reps management, business settings, and broad reporting are hidden from sales-rep home navigation.
- [x] Shared primitives are reused so sales-rep UI still belongs to the same design system.
- [x] Empty/new-user and no-active-session states are handled clearly.
- [ ] Light/dark and compact-phone visual QA covers the sales-rep home.
- [x] Role QA verifies that sales reps do not see admin-only navigation entries.

Runtime evidence captured:
- [x] Android emulator local fallback `role=CASHIER` session renders `SALES REP HOME`, `QA Store`, `Hi, Sales Rep`, `Assigned stock`, and sales/customer-only bottom navigation.
- [x] Android emulator sales-rep hierarchy does not show admin `More`, `Sales Reps`, `Settings`, or `Theme` navigation entries.
