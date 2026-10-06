# Dashboard Order receipts QA — 3 October 2026

Requested local dashboard scope: 6/6 accepted. Mobile and hosted deployment pending.

| Check | Evidence |
| --- | --- |
| Shared source/settings/payment/scoping | 14 passing tests, 50 assertions; tests.log |
| Full API / receipt package typing | Clean TypeScript compiler exits |
| Dashboard typing | Clean scoped receipt/orders route compiler via Bun; tsconfig.json |
| Lint | Scoped Biome passes for 30 receipt/source/test files |
| Bundled renderer | verify-bundle.ts, 4.98 MB standalone bundle, successful PDF/embedded font |
| Settings save/override/reset | settings-inheritance.png, saved-settings-final.json |
| Single Store export | single-store.pdf / single-store.png |
| Two-Order Store export | group-store.pdf / group-store-images.zip / group-preview.png |
| Fresh inherited business export | single-business.pdf / single-business.png / dashboard-receipt.png |
| Independent file inspection | download-inspection.json; PDF page/text/totals checks, PNG dimensions, ZIP CRC |
| Long/Unicode PDF | renderer-long.pdf: 80 items/12 pages; renderer-single/group.pdf; Inter embedded |
| Return behavior | Close preserves selection; Clear removes it; browser back/forward restores preview |

Existing jawdah.owner QA login used via the normal bounded accelerator in Chrome and
Codex's in-app browser. Synthetic ORD-001/ORD-002 were created through canonical QA
Order commands and remain as clearly labeled demonstration fixtures. Their totals
are ZAR 345.00/690.00, both unpaid. No stock movement or payment was performed.
Business defaults restored to both visibility flags true and standard thank-you
note; Store override removed. Saved settings independently reread from QA database.

Local development hot reload canceled preparation during backend/dependency edits;
stable retries and subsequent exports succeeded. Native PDF iframe was blank in the
in-app browser and was replaced by PDF.js rendering of the exact same PDF. Browser
automation download-event wait timed out; actual files exist in Downloads and were
copied/parsed independently. UI feedback now says Download ready.

Renderer transitive font 4.1.2 broke Bun bundling through PDFKit standard-font imports.
Pinned compatible 4.0.4 and embedded Inter data resolved this; standalone bundle
runs from /private/tmp. Original TTF and SIL OFL retained in packages/order-receipts.

Full dashboard Node TypeScript runs exceeded its heap. Bun ran the same TypeScript
compiler for the targeted dashboard scope successfully. This does not claim a full
repository gate. Refund/paid/part-paid/legacy and offline guard coverage is unit/source
coverage, without live money mutations or browser offline emulation. Group UI has
two real Orders; larger limits are unit/source checks. No mobile native, production
publish, logo, multiple template or durable asynchronous export acceptance claimed.

## Batch action bar placement correction

Compared with local Midday invoice bottom-bar.tsx, portal.tsx and data-table.tsx.
Orders now reuses the existing shared body Portal/BottomBar and conditionally
mounts it in AnimatePresence. The previous local fixed footer was trapped by
ScrollableContent's transform: at 853px viewport height it occupied 353–415px,
over the table ending at 438px. Corrected footer occupies 781–829px (48px high,
24px viewport bottom inset), below the table ending at 454px; its parent is body.

Live in-app browser: single selected row count/mixed header, Deselect all removes
the footer/resets checkboxes, select-all shows two selected, Generate receipts
opens a ready two-page preview, and Close preserves selection/returns to footer.
The preview covers the footer correctly. The 20-Order bound is preserved in source;
this focused UI check used the existing two synthetic Orders. Scoped two-file
Biome passes. Evidence: batch-bar-before.png, batch-bar-fixed.png,
batch-bar-preview.png. No API/schema changes or native/mobile QA in this correction.
Scoped dashboard receipt/Orders TypeScript passes using
`bun --bun node_modules/typescript/bin/tsc --noEmit --project artifacts/order-receipts-dashboard/tsconfig.json`.
