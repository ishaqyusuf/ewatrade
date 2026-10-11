# Money account lookup conversation fixtures — version 1

Capability: finance.money_accounts.read v1. Dashboard Owner/Admin, source-available; explicit Book required.
All live-model scenarios are **not run**; fixture existence is not acceptance.

| ID | Conversation | Required behavior |
|---|---|---|
| MA01 | “I returned that customer's deposit from cash.” | Resolve matching customer Book, find active cash account by identity, clarify if ambiguous; never invent IDs. |
| MA02 | “Use my other bank account.” | Show/resolve named active accounts from the same Book; ask which one if unresolved. |
| MA03 | “Show more accounts.” | Preserve Book, use nextCursor as afterCode; describe a partial page, not a complete list. |
| MA04 | “How much money is in that bank?” | Identity lookup cannot establish a balance, provider availability or settlement; use a supported balance tool or explain the limitation. |
| MA05 | Unauthorized or unknown Book | Return unavailable without account leakage, guessed identities or a zero-balance claim. |

Use owned QA aliases. Record code/prompt/model versions, sanitized step outcomes,
actual evidence and unmet assertions using the parent catalog's run format.

Recorded supplier funding subset: [12 October discovery report](../runs/2026-10-12-supplier-discovery.md).
The real executor returns the exact active Shop cash identity in the original Book.
This is not a balance, provider settlement or completed model evaluation.
