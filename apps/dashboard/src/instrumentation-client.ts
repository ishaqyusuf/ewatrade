import * as Sentry from "@sentry/nextjs"
import { initDashboardObservability } from "./observability/sentry"

initDashboardObservability(true)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
