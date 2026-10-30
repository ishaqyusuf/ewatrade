# Dashboard directory hydration consumers — 30 October 2026

Local inert proof supplement to DP-102, not a production hydration change. Source parent `5d53d148c2f023fa89dc2d459a14bf6c21911e2e` plus the two new test files frozen in the Studio/Finance candidate. Opus5.5/high authored; Codex reviewed, corrected the harness and executed. No live DB, provider or business command.

The tests run actual Sales/Services/Inventory server routes and client table consumers, shared URL/input builders, real tRPC option/key construction and the real QueryClient factory/dehydrate/hydrate. Transport and rendering primitives are inert; tests observe requests and rendered data, not just key equality. Each process has a minimal environment and unusable loopback DB sentinel. The two files run separately to avoid unrelated shared mock state.

| Owner | Observed proof |
| --- | --- |
| Sales `orders.listPage` | Store-scoped filtered/sorted first page fetched once on server, consumed without a client fetch; following cursor fetched once, same non-page input; changed filter and another Store fetch their own data; refused role starts no read |
| Services `services.queuePage` | Selected work queue, default/explicit sort, filter, current Store and following cursor consumed as above; another Store cannot consume the old Store page |
| Inventory balances | Store/all-Stores compatible-total input consumed without a client fetch; Store B and all-Stores readers cannot consume Store A data |
| Stock history / transfers | Actual bounded limit200 and Store/all-Stores inputs consumed; foreign/all scope reads its own data; refused role starts no read across all3 routes |

Results: Sales/Services **5/34 pass**, Inventory **10/52 pass**. Private initial failures are retained. The synthetic DOM lacked `location`, which Nuqs legitimately reads. All-Store explanatory text was included in a whole-container assertion, so assertions now target the actual table's output while preserving the real help copy. The Store-change test now holds its URL filter constant and checks it explicitly, strengthening Store-key isolation rather than changing two key dimensions at once. No query, route or assertion about request counts was weakened to force a pass.

## Intentional fresh/unprefetched reads

| Owner | Policy and reason |
| --- | --- |
| These Sales/Services/Inventory directories | Inherit60s freshness; matching useful prefetch is consumed. Existing command-specific invalidation remains DP-203 |
| Services manager assignee lookup | Separate unprefetched manager-only name lookup; not an initial duplicate. Tests use non-manager presentation to isolate the queue count; existing route-role/scheduling proof retains manager admission |
| Finance route Book/panels | Actual installed Next adapter and route/consumer fixture proves document four-read overlap, warm fresh Book-only server ownership, browser panel ownership and foreign Book/currency refusal. New lazy bodies retain those22 child cases |
| Finance command forms' Book reads | Explicit zero freshness preserves current Book/authority facts; not replaced with a longer TTL or client authority bypass |
| Conversations queue | Matching initial hydration followed by required visible5s queue reads; source-reviewed P17 exception, not newly exercised here |
| Catalog/Inventory private detail | Raw unscoped prefetch was removed. Its consumer keys include actor/Tenant/Store/permission/generation/visit; current private-read and revocation owners remain authoritative |
| Workspace/account/Store/sign-out transition | Existing switching clears the QueryClient and bumps generation; server QueryClient is render/request-owned. These tests add Store-input isolation and reuse unchanged switch/private-scope proof; they do not simulate a real role change |

The [original52-site source audit](../plans/2026-10-29-dashboard-hydration-audit.md), Catalog directory, Reports matched-tab and Finance mounted/actual-adapter receipts remain separate evidence. Other literal Settings, Order, Conversation and Prescription pairs were source-matched there; this supplement does not claim new mounted coverage for them or indirect callers. No newly demonstrated mismatch was found. Existing optimized nine-family request samples and this candidate's canonical smoke supplement the inert proof; they are not a per-procedure59-page browser request census.

Scoped types/Biome,237/1533 smoke and full Dashboard build include both tests. Source/list/DTO/authority/pagination implementations are unchanged. DP-102 acceptance is reviewed against the original criterion; this receipt alone does not close the full27-ticket program, lifetime/revisit, mutation freshness, behavior or budget gates. No API/schema/permission change or deployment.
