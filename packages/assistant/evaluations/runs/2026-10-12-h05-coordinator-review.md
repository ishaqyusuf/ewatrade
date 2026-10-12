# H05 rollback readiness source review — acceptance open

Reviewed the authority/rollout split, proposal decision order, paused projection
and the new two-case rollback test. The implementation agent reports six passing
cases across the new file and existing rollout/refund checks; these were reused.
No connected suite, manifest toggle, provider action or release occurred.

The inspected source retains fresh transactional session/Tenant/Store/actor and
membership checks. Completed-confirm replay and cancelled-cancel replay use
authority without rollout; pending confirmation still requires rollout before
approval and execution. Pending cancellation keeps compare-and-set semantics.
Pending rolled-back projection removes approval and avoids adapter review.
Client confirmation guards require a token; disabled UI is not a new grant.

The new tests exercise the assertion split and paused pending DTO, not the actual
`decideGeneralProposal` replay/cancel branches. A connected or suitably isolated
production-path check must still prove completed receipt replay, pending
cancellation, no duplicate effect, and fresh revoked role/Store/session refusal
after rollback. The unchanged integration suite has not been run for this packet.
Saved original objects and mobile/dashboard return journeys remain UI gates.

The owner previously removed runtime switches/allowlists. This source does not
reintroduce them; the proposed Preview-as-canary approach remains a proposal.
The H05 parent requires phase acceptance, approved canary/rollback, observed
errors, deployed version/inventory and actual expansion evidence. Documentation
and source helpers alone do not complete those requirements.

Shared-file ownership needs care: current `general-proposals.ts` also contains
another packet's review-presentation changes. Freeze and identify exact reviewed
H05 hunks before serialized main integration; do not include unrelated live edits
merely because they share the file. No runtime rollout is certified.

H05 stays partial without an accepted bookmark; 13/45 web acceptance unchanged.
