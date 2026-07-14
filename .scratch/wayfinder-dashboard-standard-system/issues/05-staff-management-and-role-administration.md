# 05 - Staff Management And Role Administration

**What to build:** owners and permitted managers can invite staff, review staff memberships, suspend or reactivate workers, and verify role-specific dashboard access without using another user's account.

**Blocked by:** 02 - HalalVest-Aligned Auth, Dashboard Shell, And Workspace Switching; 03 - Products Proof Slice With Table, Sheet, And Form Foundations.

**Status:** implementation-complete

- [x] Staff list shows active, invited, and suspended memberships with role and status context.
- [x] Staff invite flow uses the shared dashboard sheet/form pattern and existing role constraints.
- [x] Staff status changes require appropriate permissions and show clear success or error state.
- [x] Invited-staff onboarding expectations are documented or linked if they are not completed in this ticket.
- [x] Role visibility is verified for owner/admin, manager, and attendant dashboard users.
- [x] Browser/HTTP QA covers staff list, invite, suspend/reactivate where supported, role-gated navigation, and unauthorized action handling.
- [x] Brain docs are updated if staff role behavior, invitation behavior, or dashboard permissions change.

## Implementation Notes

- Added `/staff` as a shell route with a dashboard table, role/status/search filters, summary cards, invite sheet, and suspend/reactivate row actions.
- Added `GET /api/staff` and `POST /api/staff` dashboard bridge routes. The routes resolve the authenticated dashboard session, active tenant, and selected or active store before listing staff, inviting staff, or updating staff status through the existing Retail Ops staff helpers.
- Staff invite from the dashboard enqueues the existing Retail Ops staff invitation notification and hides the acceptance token from the dashboard response.
- Invited staff onboarding remains the existing OTP-backed staff onboarding flow reached from the staff invite link.
- QA evidence:
  - Authenticated `/staff` returned `200`.
  - Logged-out `/staff` redirected to marketing login with `next=/staff`.
  - `GET /api/staff` returned the QA store staff list.
  - `POST /api/staff` rejected invalid email with `400`.
  - `POST /api/staff` invited a cashier, hid the acceptance token, and used the jobs fallback notification path in local dev.
  - `POST /api/staff` suspended the invited cashier and reactivated the same cashier.
