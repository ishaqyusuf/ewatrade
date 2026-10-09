# Support contact update — 9 October 2026

The owner approved changing the public contact to support@ewatrade.com while
retaining founders@ewatrade.com as a forwarding alias. Cloudflare shows both
routes active to the owner-confirmed, verified Gmail destination. Two approved
test messages, one per alias, were received in that Gmail inbox on 9 October.

Public support and contact components use the support address. The immutable
legal publication changes only the two support contactEmail fields; all policy
paragraphs remain unchanged. The new version is 2026-10-09-support-contact-1,
effective 2026-10-09, with approval recorded at 2026-10-09T10:56:01.000Z and
reference owner-approval-2026-10-09-support-email-routing. The owner explicitly
approved new version/digest/approval metadata after being told that these contacts
belong to the shared checked legal snapshot.

Full publication digest:
875d66d563b3b0d4c344aa895895dbec1e12dc90553e82fdfdfc3ba4779c649a

Prior version and receipt hashes are not rewritten. The founders address used
for Play reviewer identity is unchanged. Shared publication consumers must deploy
together so signup clients and servers agree on the current version. No database
schema change is required, and no acceptance evidence is backfilled.

Validation: current publication integrity and signup-gate tests; four real React
server renders (approved support, fallback support, marketing support and contact)
all contain the support mailto link and no founders address. Four-file Biome and
git diff whitespace checks pass. Hosted rollout remains pending.

The existing Request upgrade action was separately exercised on Production. It
returns provider-not-configured, leaves Starter active and does not notify support.
That behavior is not changed by the contact-address update.
