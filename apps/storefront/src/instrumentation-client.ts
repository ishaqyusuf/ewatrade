import * as Sentry from "@sentry/nextjs"
import { initStorefrontObservability } from "./observability/sentry"

initStorefrontObservability(true)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
