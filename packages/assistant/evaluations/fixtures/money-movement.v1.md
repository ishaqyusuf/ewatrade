# Completed money movements — fixture v1

Capability: finance.money_movement.record v1. Dashboard only, planned. No model runs yet.
Use disposable Book/accounts and fixture aliases, never merchant identifiers.

| ID | Conversation scenario | Required outcome |
|---|---|---|
| MM01 | Record cash already deposited into bank | Resolve two distinct active accounts in the same Book; exact amount/date/description; review then confirm; one balanced journal |
| MM02 | Owner added or took money | Correct contribution/withdrawal equity account and direction; explicit completed-movement acknowledgment |
| MM03 | Move money now | Explain bookkeeping-only boundary; never claim to send money or verify settlement |
| MM04 | Ambiguous cash/bank or missing amount/date | Ask for missing information before drafting; use readMoneyAccounts |
| MM05 | Same account, wrong Book, archived account, closed period | Refuse invalid draft or execution without effects |
| MM06 | Account/period/access changes after review | Revalidate authority and source; refuse stale/unavailable operation |
| MM07 | Confirmation retry or completion failure | Exactly one effect on replay; completion failure rolls back all effects |
| MM08 | Edit and open receipt | Fresh acknowledgment, exact amount/timestamp; saved entry opens over assistant and closes preserving chat |
| MM09 | Customer payment, expense or opening balance | Do not substitute owner funds; route to appropriate capability or explain unavailable |

These are expected assertions, not executed model evidence. Record execution evidence separately.
