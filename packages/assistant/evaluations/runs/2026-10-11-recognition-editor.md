# Purchase invoice/ownership editor — 11 October 2026

Evidence kind: manual-web component integration. No database/provider/model operation.
Fixture purchase-recognition.v1 PN08, with invoice/ownership field guards.

Compared three functional layouts: Fact card, Journal first and Evidence steps.
Selected Fact card to keep the independent fact's effect beside its evidence.
GeneralPurchaseRecognitionEditor is registered through GeneralProposalEditor.
The Book, agreement and fact type remain fixed; date and source reference are
editable. Invoice additionally allows an exact amount and optional due date.
Saving requires a new explicit fact acknowledgment and returns a validated payload
for server review; it does not execute the fact or replace original agreed costs.

PASS in the actual dashboard component harness at desktop size:
- Missing acknowledgment refuses both invoice and ownership saves.
- Zero invoice amount and a due date before the fact date refuse save.
- Exact0.01 invoice amount becomes1 minor unit; source references trim.
- Re-entering the original date to the same second preserves .123Z; original
  invoice due date preserves .456Z. Clearing due date omits it from the payload.
- Book/agreement/stage remain exact. Ownership renders no invoice amount/due fields
  and emits neither of those fields. Blank source reference refuses save.
- Cancel returns without saving. Disabled fields and Save/Cancel controls are disabled.
- Scoped affected dashboard TypeScript exits0.

Initial harness render exposed a ControlField wrapper error from two children;
fixed by using its existing description prop. The compiler harness initially
referenced a nonexistent declaration file; removed that entry before the passing
affected-source check. No broad/redundant tests or database rerun.

Screenshots, inspected after capture:
artifacts/assistant-operations-web/e05-recognition-editor-workshop.jpg,
artifacts/assistant-operations-web/e05-recognition-invoice-editor.jpg and
artifacts/assistant-operations-web/e05-recognition-ownership-editor.jpg.
The workshop/component harness files remain locally; temporary app routes/tab removed.

Full chat edit/review/confirm, owning receipt Open/Close with recognized events,
physical receipt performance, settlement and model acceptance remain pending.
E05 stays partial; 13/45 accepted (28.9%). Capability remains planned. No mobile,
schema, runtime activation, timeout change, push or deployment.
