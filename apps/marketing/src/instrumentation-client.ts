import * as Sentry from "@sentry/nextjs"
import { initMarketingObservability } from "./observability/sentry"

initMarketingObservability(true)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
