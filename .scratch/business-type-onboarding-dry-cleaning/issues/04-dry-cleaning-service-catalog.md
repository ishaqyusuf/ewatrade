# 04 - Dry Cleaning Service Catalog

**What to build:** Dry-cleaning businesses can create, price, list, update, and deactivate service/laundry items with variants, while avoiding Product Sales stock inventory behavior.

**Blocked by:** 01 - Business Template Foundation And Product Sales Compatibility; 02 - Business-Type Onboarding Selection

**Status:** implemented

- [x] Dry Cleaning/Laundry tenants can manage service items such as complete kaftan, shirt and trouser, jalabiya, iro and buba, and other garments.
- [x] Service items support name, description, category, active state, base price, currency, and optional variants/modifiers.
- [x] Variants/modifiers can represent labels such as small, regular, child, adult, complex garment, or bounded merchant-defined size labels.
- [x] Service item prices are snapshotted for later order use and old records are not recalculated when prices change.
- [x] Service catalog actions do not create or deduct inventory stock balances.
- [x] Automated tests cover create, update, list, deactivate, price snapshot readiness, tenant/store scoping, and no inventory deduction.
