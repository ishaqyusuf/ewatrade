# 05 — Add The Mobile Customer Shell And Universal Store Links

**What to build:** Extend the existing EwaTrade app with an isolated Customer
shell that opens Store Entry Links without business login, supports the first
guest text conversation, lists prior Store Conversations, resumes the last
customer context, and securely transfers an active web guest into the app.

**Blocked by:** 02 — Deliver The First Anonymous Store Conversation Text Loop

**Status:** complete

- [x] The shared Store Entry URL is configured as an iOS Universal Link and
      Android App Link; installed apps open the exact Store in Customer while
      uninstalled devices retain the full web experience.
- [x] Incoming Store links bypass business onboarding/login and never open a
      merchant route merely because the device has a business session.
- [x] Mobile creates/resumes a device-scoped Guest Identity using operating-
      system secure storage; general-purpose local storage contains no bearer
      credential or private conversation content.
- [x] Customer shell supports Store Conversation detail, text send/reload,
      conversation list, Back to Conversations, last-conversation resume, and
      safe empty/error/retry states.
- [x] Customer and Business shells have explicit navigation/security contexts;
      a dual-role user switches through visible Personal/Business control and
      neither credential grants authority to the other shell.
- [x] `Open in EwaTrade app` creates a one-time ten-minute Conversation Transfer
      with digest-only persistence and no customer/content identifiers in the
      link; redemption atomically authorizes the app guest and consumes it.
- [x] Expired, replayed, revoked, wrong-Store, wrong-device, and interrupted
      transfer attempts fail safely while the original web conversation remains
      usable.
- [x] Fresh install, reinstall, no-app fallback, app already open, cold start,
      background resume, and malformed links have deterministic outcomes.
- [x] Private cache is minimized, invalidated on credential revocation, and does
      not leak into business state, logs, crash reports, or screenshots beyond
      platform-controlled behavior.
- [x] Native tests and device/simulator acceptance prove deep links, secure guest
      resume, transfer/replay, conversation list, text loop, shell switching,
      keyboard-safe composition, accessibility, and offline recovery.
- [x] Web compatibility and existing authenticated mobile business flows remain
      green.
- [x] Brain mobile architecture, feature, security, API, and task records clearly
      distinguish the two shells and state that this is one app binary.

## Evidence

- The additive Prisma migration was generated and applied through the root
  migration command; local development migration and schema-push checks are in
  sync. Verified-Neon acceptance passes 1 test / 21 assertions with exact
  cleanup and covers mobile text/list behavior, transfer convergence, response-
  loss replay, invalid device/scope/status cases, and continuing web access.
- Thirty-one focused shared, DB, API, mobile, and Storefront tests pass with 73
  assertions. DB, Service Commerce, API, and Storefront typechecks pass; the
  mobile program contains no Ticket 05 type error, while its full monorepo
  program remains blocked by separately in-progress Commerce Quote/action/job
  type failures outside this ticket.
- Expo configuration and native prebuild expose only `https://chat.ewatrade.com/r/*`
  as the Universal/App Link surface. An Android debug build installed on a
  Pixel API 34 emulator; the exact HTTPS Store Entry intent opened the isolated
  Personal route in a warm app, bypassed Business onboarding/app lock, exposed
  Back to Conversations plus the Business switch, and rendered the safe retry
  state for an intentionally invalid Store token. A repeated warm intent was
  accepted by the same activity. The HTTPS URL remains the no-app web fallback.
- Six established Business-mobile guards remain green. No provider or
  production migration/traffic action was performed.
