# Customer ledger Workshop and read-only QA

Three interactive sample directions in `index.html`; selected Statement first.
Screenshots prove only the browser fixture or the live saved-directory empty state.
All fixture mutations reject; layout persistence is explicitly stubbed to refuse.
No browser preview proves native, restart, financial write or source-activation acceptance.

Fixture source imports actual statement/sheet components. To reproduce using the existing
Portless dashboard, temporarily copy `index.html` and `fixture.html` to
`apps/dashboard/public/customer-ledger-workshop/`, resolve this artifact's imports using
its tsconfig and a temporary node_modules link to dashboard/node_modules, then run:

```
bun artifacts/customer-ledger-phase3-workshop/build-fixture.ts
```

Open the ordinary existing dashboard HTTP fixture URL. Do not launch/restart a shared
runtime. The linked Next stylesheet in fixture.html is the observed development stylesheet;
use the current observed stylesheet if the development hash changes. Remove only these
fixture public assets/link after QA. Generated fixture.js is temporary and not a product
entry point. Compare screenshots and source docs; `tests.log` records the focused suite.

Parent integration patch was checked with `git apply --check`; it is unapplied and needs
parent review. Shared files may change, so rerun that check before applying. Required
native landing/Customer Book links and API documentation text are in the delivery plan.
