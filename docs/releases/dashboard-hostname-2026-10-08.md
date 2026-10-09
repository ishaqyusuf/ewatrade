# Dashboard production hostname

8 October 2026. Owner requested `dashboard.ewatrade.com` → `dash.ewatrade.com`, including the live Vercel domain and production settings.

The canonical production Dashboard URL, signup fallback, staff invitation links, desktop default, mobile continuation links and analytics origin use `https://dash.ewatrade.com`. Reserve `dash` from signup slugs. Routing retains the old `dashboard` label for existing links; non-production mobile builds reject both production hosts. Preview/staging/local names and tenant `-dashboard` suffixes remain unchanged. Keep the old origin in auth/API allowlists during transition.

This supersedes the hostname portion of the 3 October signup-origin decision. No database/schema change. Source is isolated from the active dirty workspace using the current production commit `e9942695506b847b9fa439c7e926aa9ac80b9cc7`.

Validation: 52 focused tests / 269 assertions, desktop config smoke and mobile environment config pass. Live deployment verification is in progress.
