# Purchase invoice/ownership chat flow — 11 October 2026

Evidence kind: manual-web, actual local dashboard/API/database. No model or provider
request. Exact non-production database ewatrade_qa_v1, tenant classified QA,
Sweet Crumbs Bakery (Demo QA), Owner. Fixture IDs and logs stay in ignored artifacts.

Prepared a disposable two-line agreement through canonical purchase registration:
Flour 2.125 bag /1000 minor plus Sugar1 bag /100 minor, total1100 NGN minor.
The fixture prepared proposals only. Invoice and ownership execution happened
through the real assistant dashboard Confirm buttons, separately.

Verified actual chat sequence:
- Initial invoice review showed original supplier/Store/goods, exact agreed total,
  payable increase1100 and Dr1340/Cr2000. Before Confirm, events/journals were0.
- Edit required a new acknowledgment. Changed source reference to QA-INVOICE-WEB,
  Save and review returned the updated canonical review; Confirm produced the
  Purchase invoice recognized receipt. Independent readback verified revision2,
  exact .123Z fact timestamp, edited reference, one event and one journal.
- Open displayed the original global Purchase agreement sheet over /assistant,
  with original two goods and the invoice event. Close preserved the chat/receipt.
- Prepared a separate ownership proposal after the invoice. Review showed the
  prior INVOICE, payable increase0, Dr1310/Cr1340 and original agreed costs.
- Ownership editor contained date/reference/acknowledgment only. Changed reference
  to QA-OWNERSHIP-WEB, acknowledged, saved for fresh review and confirmed. The
  dashboard displayed separate successful invoice and ownership receipts.

Final PASS: ownership receipt Open displayed both exact saved dates/references and
original goods over /assistant. Close preserved both completed receipts and chat.
Read-only database readback verified two completed proposals, revisions[2,2],
one supplier payable1100, due2026-10-04T12:00:00.456Z and exactly two journals:
Dr1340/Cr2000 1100; Dr1310/Cr1340 1100. Owned balance sources retain revision0,
on-hand0 and reserved0; physical receipt lines and owned stock operations are0.

Initial final readback incorrectly checked every stock operation in the shared QA
tenant and found two unrelated operations. Corrected the verifier to the exact
owned agreement balance sources; retained failed diagnostics and passing result.
This is a verification scope correction; no product source change was needed.

Automatic approval review rejected permanent fixture cleanup because web testing
alone did not explicitly authorize database deletion. No deletion ran. Exact QA
fixtures remain, pending the user's cleanup choice; retained artifact IDs support
future guarded cleanup. Nonfatal pg concurrent-query deprecation warning retained.

Screenshots inspected: e05-recognition-invoice-open-web.jpg and
 e05-recognition-ownership-open-web.jpg in artifacts/assistant-operations-web.
Additional retained captures: invoice review/edit/re-review, ownership edit/review,
completed chat and e05-recognition-close-preserves-chat-web.jpg.

Capability finance.purchase.recognize v1 is source-available for dashboard
Owner/Admin Finance scope under existing GENERAL/plan gates. The contract excludes
physical receipt, replacement costs, split deliveries, settlement and payments.
Focused purchase-recognition schema/manifest tests pass. Broad typechecks/tests,
mobile and provider calls were not run. No schema, timeout increase, push or deploy.
The existing committed coverage snapshot is updated only for this capability's
availability; concurrent uncommitted Order procedure reconciliation remains open.

E05 is still partial. Roadmap acceptance stays13/45 (28.9%);32/45 pending including
A04 deferred. This evidence does not establish natural-language/model acceptance.
