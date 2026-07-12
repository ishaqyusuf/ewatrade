# 04 — Staff Invite And Attendant Onboarding

**What to build:** an owner or manager can invite attendants by email, the attendant receives clear get-started instructions, accepts the invitation securely, completes a short setup, and reaches a focused attendant dashboard. This should preserve tenant role boundaries and avoid sharing owner credentials.

**Blocked by:** 01 — Owner Signup, OTP, And Business Entry.

**Status:** implementation-complete

- [x] Owner/admin/manager users can invite attendants by email from the mobile management surface.
- [x] Invitation email explains that the attendant was added and how to download or open the app.
- [x] Invite acceptance uses a secure token or equivalent production acceptance path.
- [x] Attendant onboarding asks only for the minimal profile/session details needed to start.
- [x] Accepted attendants land in a role-appropriate dashboard with admin-only tools hidden.
- [x] Offline invite fallback, if used, queues the invite and reconciles production ids after sync.

## Implementation Notes

- The existing mobile Staff invite sheet reads `retailOps.staff`, sends production invites through `retailOps.inviteStaff`, and uses the local queued `staff_invited` path while offline.
- The invite sheet now explains that invited attendants sign in with their own email OTP and confirm a sales profile.
- `verifyMobileOwnerOtp` now resolves invited cashier/operator/manager memberships as a valid mobile session state, returning membership role and status so the app can route them safely.
- Added `apps/mobile/src/app/staff-onboarding.tsx`, which calls `retailOps.completeStaffOnboarding` with only name/display name, activates the invited staff membership, refreshes the local SecureStore session profile, and lands the attendant on the focused dashboard.
- The dashboard redirects invited staff to staff onboarding, then hides owner-only management surfaces for cashier/operator roles after activation.
- Existing offline sync maps applied `staff_invited` results back to local staff `remoteId` membership ids.
- Added the secure invite-link bridge that was missing from the earlier static pass. Production staff invites now generate a random durable acceptance token, store only its hash, revoke prior active tokens for the membership, and send an invite-specific URL in the staff invite notification. The public `retailOps.resolveStaffInviteToken` query returns bounded business/email/role context for `/staff-onboarding?inviteToken=...` without authenticating the user, while actual activation still requires the invited staff member to sign in with their own email OTP and complete the authenticated staff onboarding mutation. Direct invite and offline-sync invite responses sanitize the secret token after notification enqueue.
- Added focused DB query coverage for invite/onboarding. `packages/db/src/queries/retail-ops-staff.test.ts` proves invite creation normalizes email/name, exercises the staff entitlement guard, stores only a hashed one-time acceptance token while returning the raw token once for email delivery, revokes prior active tokens, writes staff profile and lifecycle audit records, resolves a public invite token to bounded business/email/role context without exposing the token, and completes invited staff onboarding by activating membership, accepting active invite tokens, updating profile/user state, and writing the onboarding lifecycle audit.
- Cleaned up stale API permissions/contracts wording so Brain now reflects the implemented one-time invite-token, public invite resolution, OTP onboarding, notification dispatch, and durable profile/audit bridge; only live email-provider configuration, durable stock-wallet tables, ledger-backed custody movements, approval workflow, and broader reconciliation remain future hardening.
- Added focused DB query coverage for staff stock wallets used by attendant-held stock. `packages/db/src/queries/retail-ops-stock-wallets.test.ts` proves wallet listing merges durable rows with store-metadata fallback balances, stock assignment validates active staff and product units, protects reserved store stock, updates wallet metadata, upserts the durable wallet, and writes a durable `STAFF_ASSIGNMENT` movement, while staff returns increment store stock, remove empty fallback balances, upsert the wallet to zero, and write a durable `STAFF_RETURN` movement.
- Added API schema coverage for staff invite contact email normalization. Staff invite payloads now trim and lowercase email input before validation while still rejecting invalid email formats.
- API architecture QA now covers the focused Staff router split. Staff invite, staff listing/status updates, staff stock wallets, stock assignment/return, public invite-token resolution, and authenticated staff onboarding procedures live in `apps/api/src/trpc/routers/retail-ops-staff.ts` and are merged into the existing `retailOps.*` namespace, while the core router keeps queued `staff_invited` sync replay orchestration so offline invites still resolve event idempotency and notification enqueue outcomes. `bun run --cwd apps/mobile qa:staff-flow`, `bun run --cwd apps/mobile qa:retail-ops-api-boundary`, `bun --filter @ewatrade/api typecheck`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
- Scoped static checks passed. Live email delivery, real OTP inbox validation, Expo simulator interaction QA, and deep-link invite-token acceptance were not run in this slice.
