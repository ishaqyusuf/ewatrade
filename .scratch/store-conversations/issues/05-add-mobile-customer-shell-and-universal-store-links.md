# 05 — Add The Mobile Customer Shell And Universal Store Links

**What to build:** Extend the existing EwaTrade app with an isolated Customer
shell that opens Store Entry Links without business login, supports the first
guest text conversation, lists prior Store Conversations, resumes the last
customer context, and securely transfers an active web guest into the app.

**Blocked by:** 02 — Deliver The First Anonymous Store Conversation Text Loop

**Status:** ready-for-agent

- [ ] The shared Store Entry URL is configured as an iOS Universal Link and
      Android App Link; installed apps open the exact Store in Customer while
      uninstalled devices retain the full web experience.
- [ ] Incoming Store links bypass business onboarding/login and never open a
      merchant route merely because the device has a business session.
- [ ] Mobile creates/resumes a device-scoped Guest Identity using operating-
      system secure storage; general-purpose local storage contains no bearer
      credential or private conversation content.
- [ ] Customer shell supports Store Conversation detail, text send/reload,
      conversation list, Back to Conversations, last-conversation resume, and
      safe empty/error/retry states.
- [ ] Customer and Business shells have explicit navigation/security contexts;
      a dual-role user switches through visible Personal/Business control and
      neither credential grants authority to the other shell.
- [ ] `Open in EwaTrade app` creates a one-time ten-minute Conversation Transfer
      with digest-only persistence and no customer/content identifiers in the
      link; redemption atomically authorizes the app guest and consumes it.
- [ ] Expired, replayed, revoked, wrong-Store, wrong-device, and interrupted
      transfer attempts fail safely while the original web conversation remains
      usable.
- [ ] Fresh install, reinstall, no-app fallback, app already open, cold start,
      background resume, and malformed links have deterministic outcomes.
- [ ] Private cache is minimized, invalidated on credential revocation, and does
      not leak into business state, logs, crash reports, or screenshots beyond
      platform-controlled behavior.
- [ ] Native tests and device/simulator acceptance prove deep links, secure guest
      resume, transfer/replay, conversation list, text loop, shell switching,
      keyboard-safe composition, accessibility, and offline recovery.
- [ ] Web compatibility and existing authenticated mobile business flows remain
      green.
- [ ] Brain mobile architecture, feature, security, API, and task records clearly
      distinguish the two shells and state that this is one app binary.
