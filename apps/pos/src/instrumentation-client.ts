import * as Sentry from "@sentry/nextjs"
import { initPosObservability } from "./observability/sentry"

initPosObservability(true)

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
