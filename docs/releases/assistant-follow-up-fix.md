# Assistant follow-up correction — 9 October 2026

QA assistant chats previously selected a provider-free comma-separated-line
script, even in Production. Follow-up price lines without a repeated product
name were ignored, and the assistant replied with its generic product example.

The owner explicitly approved sending QA assistant messages and product draft
details to DeepSeek. Setup and focused product chats now use DeepSeek for QA
businesses, retaining saved conversation history, current draft tools and the
ordinary business allowance. Missing credentials or disabled/invalid runtime
configuration report unavailability; they do not silently select the script.
The QA exception is limited to DeepSeek assistant text. Other QA provider
restrictions remain. Explicit non-production `ASSISTANT_REHEARSAL_MODE=true`
still provides the provider-free development adapter.

Setup prompt v10 explicitly treats short replies and multiple price lines as
answers about the existing draft. It asks for ambiguous size/pack details rather
than discarding supplied prices or guessing conversions. Existing conversations
use the corrected routing on their next message; no draft migration is needed.

The owner requested direct Production release and no additional testing. Test
runs and browser acceptance are skipped for this correction. The existing model
resolution test is aligned with the new contract for future runs. Production
builds and deployment readiness remain necessary release operations; they are
not evidence that the reported conversational flow has been retested.
