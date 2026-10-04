# Preview jobs and generated Dashboard URLs

The separate free Trigger Preview project registers tasks without automatic cron
schedules when APP_ENV=preview. Production/local cron patterns stay unchanged.
Hosted Trigger configuration uses the fixed application-to-project mapping; the
local deploy wrapper still validates the selected profile, database and runtime key.

Dashboard permits its exact VERCEL_URL only when VERCEL_ENV=preview, retaining the
normal session checks. Arbitrary vercel.app hosts receive the existing treatment.

Validated with a hosted Preview worker (45 tasks, zero schedules), a disabled
photo-review recovery smoke job, and focused schedule/profile/hostname tests.
Provider deployment success is not signed, single-revision release acceptance.
