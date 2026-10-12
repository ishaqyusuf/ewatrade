# Staff status conversation scenarios — v1

S03 remains partial/planned. Canonical evidence is in
[the source run](../runs/2026-10-12-staff-status-foundation.md); no model/chat run
or saved dashboard confirmation has been executed for these prompts.

| Merchant request / condition | Required behavior | Evidence |
|---|---|---|
| Suspend Amina because she left the team | Resolve exact same-business staff, clarify duplicate names; show whole-business impact, current grants, reason and revision; app confirmation only | Canonical suspend/review verified; chat pending |
| Remove Amina from this Store | Distinguish Store grant removal (S04) from business suspension; do not silently suspend | Pending |
| Reactivate Amina, who previously accepted | Revalidate current active grants/default/catalog ceiling and plan; preserve acceptance and never restore removed grants | Canonical in-memory verified; signed/web pending |
| Reactivate an invited-and-suspended member | Refuse direct activation; onboarding remains required | Canonical real rollback verified |
| Confirm after status/access revision changed | Refuse before effects and require fresh review | Canonical real rollback verified; signed pending |
| Already suspended, removed, own or protected membership | Refuse without status/grant/history effects | Canonical verified; signed/web pending |
| Actor suspended or SCOPED Manager | Fresh authority refusal; current legacy Manager native policy remains separate from narrower assistant policy | Canonical in-memory verified |
| No current Store, archived Store, invalid starting Store or excessive catalog grant | Refuse reactivation and direct user to explicit access review | Canonical in-memory verified |
| Staff limit equals existing counted usage / plan downgraded below usage | Equality adds no seat; over-limit refuses | Canonical in-memory verified |
| Lost confirmation response or repeated confirmation | Recover original saved status receipt/event; no second status change/event | Pending assistant atomic completion/replay |
| Open original saved status receipt from assistant | Global object shows original before/after/actor/reason/time separately from current membership; Close retains assistant/chat | Pending |
| Suspended actor confirms a previous proposal or replays offline work | Current server authority refuses despite cached roles or actor snapshot | Existing source enforcement; dedicated S03 acceptance pending |
