# Supplier creation — version 1

Source-available dashboard Owner/Admin capability: finance.supplier.create.
These scenarios are fixtures, not recorded model passes.

| ID | Request or condition | Expected behavior |
|---|---|---|
| SC01 | Add ACME supplier, code ACME-1, in selected Book | Search existing identities, review normalized exact name/code and Book; explicit confirmation creates one identity |
| SC02 | Add ACME, no code / ambiguous existing suppliers | Ask for code or clarify; never invent an identity |
| SC03 | Same normalized code already exists | Refuse duplicate; no extra supplier |
| SC04 | Actor/Book changed after draft | Fresh authority/scope refusal; no effect |
| SC05 | Response lost or concurrent Confirm | Recover same receipt; exactly one identity and command |
| SC06 | Completion persistence fails | Supplier and command roll back with proposal |
| SC07 | Add supplier and opening debt/payment/stock | Separate explicit operations; identity creation never invents financial or stock effects |
| SC08 | Edit, Confirm, Open, Close | Saved exact identity; statement overlays assistant and Close preserves chat |

Schema rejects actor/tenant/command IDs and financial amount fields. Receipt requires
Book provenance. Isolated database and bounded full web evidence are recorded;
remaining authority/scenario and live-model acceptance stays separate.

[12 October actual supplier web report](../runs/2026-10-12-supplier-registration-web.md):
SC01/SC07/SC08 pass revised identity review/Confirm/statement Open/Close with zero
balances and no stock/posting, duplicate refusal and completed recovery. No model run.
