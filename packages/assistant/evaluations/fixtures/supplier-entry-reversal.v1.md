# Supplier entry reversal — fixture v1

Capability: `finance.supplier.entry.reverse` v1. Web/dashboard only.
Scenarios specify expected behavior; execution evidence is separate.

| Scenario | Expected behavior |
|---|---|
| “Correct the duplicate supplier advance/opening” | Resolve supplier and exact original entry through authorized statement history; use continuations and clarify ambiguity |
| Missing source or ambiguous supplier/entry | Ask naturally for more context; never guess omitted IDs or request internal identifiers |
| Opening payable | Reverse whole original payable/equity journal and reduce recorded supplier liability |
| Opening advance | Reverse whole original advance/equity journal and reduce original unallocated credit |
| Paid advance | Reverse whole original advance/money journal; explain recorded account increase without recovering money |
| Partial amount, replacement account/supplier/kind or lines | Strict payload refuses overrides |
| Consumed advance | Require every portion released first by a separately requested action; never release automatically |
| Bills, payments, allocations or purchase facts | Refuse; these require their distinct owning corrections |
| Reversed entry, correction entry or malformed original posting | Refuse before effects |
| Wrong Book/authority, archived accounts, cutoff or invalid chronology | Fresh canonical checks refuse |
| Review/Edit | Show original source, full amount, exact reversed accounts and boundaries; preserve entry and timestamp with fresh acknowledgement |
| Valid old approval after reviewed source changes | Refuse stale review atomically |
| Confirm/retry/concurrent recovery | One linked supplier reversal and opposite journal; same owning supplier receipt without duplicates |
| Completion failure | Command, journal, linked reversal and proposal completion roll back together |
| Open/Close/reload | Supplier history opens over the assistant; completion persists |

No model/provider result is certified by this fixture.
