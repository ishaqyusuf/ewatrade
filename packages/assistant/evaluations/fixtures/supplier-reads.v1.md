# Supplier discovery and statements — fixture v1

Planned dashboard Owner/Admin finance.suppliers.read and finance.supplier_statement.read.
No model runs yet. Expected scenarios only.

| ID | Scenario | Required outcome |
|---|---|---|
| SR01 | Find supplier by name/code | Exact Book, at most10 identities, clarify ambiguity |
| SR02 | Continue supplier search | Preserve Book/query, use returned cursor; no inferred balance |
| SR03 | Read supplier payable and advance | Show both separately with currency and complete snapshot totals |
| SR04 | Continue statement | Preserve supplier/Book/snapshot; reject cursor without snapshot |
| SR05 | Missing or foreign Book/supplier, revoked access | Refuse without leaking identities or financial history |
| SR06 | Ask whether goods arrived or bank paid | Do not infer receipt, ownership, recognition or bank settlement from statement |

Unit checks are distinct from actual tool/database and live-model acceptance.
