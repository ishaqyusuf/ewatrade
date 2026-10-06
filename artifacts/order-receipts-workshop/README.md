# Order receipt workshop

Date: 3 October 2026. Local design reference; no production integration.

Open `index.html`. Three distinct directions have separate dashboard/mobile and
single/group states. Direction 02 is the recommended starting point.

- **01 Quick receipt:** right sheet on dashboard; retained bottom sheet on mobile.
- **02 Preview & export:** preview workspace with settings alongside on dashboard;
  dedicated stacked mobile preview with sticky bottom prepare/save/share actions.
- **03 Receipt tray:** compact export dialog on dashboard; file-first mobile tray
  with a link to the full Direction 02 preview.

Direct links: `index.html#02/dashboard/single/preview`,
`index.html#02/dashboard/group/preview`, `index.html#02/mobile/single/preview`,
`index.html#02/mobile/group/preview` (numeric IDs 1–3 are also accepted).

Try the normal/part-paid/unpaid/offline/many-items/partial-failure scenarios.
Switch file format, customer and payment visibility; edit the thank-you note;
step through group receipts, exclude the canceled Order and retry failed output.
Back/Escape retains options; Reset clears only the current direction/surface/scope.
Direction states are isolated. The mobile share panel is a local handoff study,
not a device picker or a sent message.

## Sample output

Download produces actual fictional PDF/PNG files. Group PDF contains a separate
receipt per Order; group images use an uncompressed ZIP. Long sample PDFs are
paginated; PNG output grows with the number of item rows rather than cropping.
PDF sample rendering uses built-in Helvetica and ASCII `NGN`; PNG uses system
Arial. The sample PDF is an A4 study, while the on-screen receipt/PNG is a compact
receipt study. Production must unify the selected layout and fonts across outputs.
Custom Unicode text is supported in the visual/PNG preview but the minimal sample
PDF normalizes it to ASCII. That is a disclosed prototype limitation, not the
required production rendering contract.

These are Order records with actual sample total/received/balance status, not new
invoice issuance, payment collection or independent payment-proof receipts.
One Order keeps one receipt within a group; no balances/debt are consolidated.

## Grounding

- EwaTrade `orders` table/header/detail and native Classic Order detail/payment facts.
- Existing `BRAND_THEME`: green `#17684F`, ink `#182420`, white, muted `#F6F7F7`,
  border `#DCE2DF`; corresponding native dark tokens.
- Midday invoice details sheet, invoice URL params and invoice table bottom bar:
  explicit opener, scoped document preview and selected-record export.
- New workshop is separate from the earlier phase UI and private expense receipt
  workshops. Their accepted choices and assets are preserved.

## Verification

Run `node artifacts/order-receipts-workshop/verify.mjs dashboard` and
`node artifacts/order-receipts-workshop/verify.mjs mobile` from the repo root.
The script uses the existing local Playwright runtime. It exercises three
directions × two selection scopes × light/dark for each surface, plus edge cases.
Evidence and downloaded samples are under `evidence/`.

Browser checks do not establish Expo, native share-sheet, physical-device,
production rendering, source authorization or background-job acceptance.
All input is fictional and all processing stays local; no external request is
made. The workshop starts no server and changes no business records.
