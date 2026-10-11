# Dashboard chat loading diagnosis — 11 October 2026

Manual web diagnostic on the web-labeled bakery QA account; no model request sent.
After the prior corrected fixture was removed, /assistant initially loaded the normal
empty state. Start a chat created an empty chat and the DOM showed the welcome heading,
business name, enabled composer and example prompts. Browser console had no captured
warnings/errors at that observation.

However, the later screenshot showed the global Something went wrong boundary. Thus
this is NOT a stable chat pass and does NOT isolate the earlier error to correction
proposals. Root cause remains unproven. Screenshot:
artifacts/assistant-operations-web/e04-fresh-chat-diagnostic.jpg (despite the filename,
it shows the failure). The temporary browser tab was closed. The newly created empty
QA chat remains; no financial fixture was created in this pass.

Source observations: generic conversation query errors display a current-Store message;
receipt access-changed text can originate from client read-generation guards, not only
server permission denial. Neither observation proves causation. Shared API PID78644
was listening and was not restarted. Concurrent contracts.ts edits were present and
left untouched. No access guard weakened, no speculative fix, no mobile work.

Next: capture the failing response or error-boundary cause before changing code; then
repeat the exact saved-chat and receipt-read flows. E04/full web acceptance incomplete.

## Follow-up: composer failure captured and reload recovered

Browser console captured TypeError: Cannot read properties of undefined (reading
length), originating in GeneralComposer at 2026-10-11T15:35:02.132Z. Current source
reads vm.readyAttachments.length; concurrent attachment work added that field to
useGeneralAssistant. Both files were being edited by another session. No competing
source edit or commit was made here.

A reload against the current files completed: existing empty chat loaded, welcome
heading/composer rendered, and screenshot e04-composer-recovered.jpg confirmed the
same successful state. This supports a transient mismatch during concurrent development;
it does not prove the earlier saved correction-chat or receipt-generation error fixed.
No model call, financial mutation, additional chat creation or server restart in this
follow-up. Temporary tab closed. Next acceptance should re-exercise correction history
and expense receipt reads using a stable runtime.

## Follow-up: saved correction chat query isolated

Recreated owned web QA correction fixture. Browser diagnostic reports
INTERNAL_SERVER_ERROR with sanitized validation text, not NOT_FOUND/FORBIDDEN.
Direct current-source reads against that same fixture passed: conversation present,
zero messages, two proposals, active-run read and both generalProposalWithReview calls.
Thus those direct reads do not reproduce the serving request failure.

Temporary route entry/error-class diagnostics wrote no entry during retries. Verified
Next rewrite goes to ewatrade-api.localhost and Portless maps it to3095, PID78644 in
this repo/apps/api running bun --hot src/local.ts. Touching the existing entrypoint
mtime did not resolve the failure or produce a route diagnostic. An older serving
route or failure before the handler remains possible; neither is proven. No process
was stopped/replaced. Both frontend/server diagnostics removed, verified no source diff.

Fixture cleanup completed, exact owned books0/chats0. Temporary tab closed. Logs
/private/tmp/e04-chat-diagnostic-{fixture,cleanup}.log; direct-read diagnostic retained
locally in artifacts/assistant-operations-web/correction-chat-read-diagnostic.ts.
Next isolate request validation/middleware or use an independently controlled API
runtime before repeating correction web acceptance. No mobile or deployment.
