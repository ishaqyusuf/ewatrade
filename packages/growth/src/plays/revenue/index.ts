import type { LifecyclePlay } from "../../contract"
import { featureIntentPlay } from "./feature-intent"
import { limitPressurePlay } from "./limit-pressure"
import { secondBusinessPlay } from "./second-business"
import { successMilestonePlay } from "./success-milestones"
import { whatsappExhaustedPlay, whatsappWarningPlay } from "./whatsapp-cap"

/** Owned by workstream W3: P08–P12 and P16 (feature intent). */
export const REVENUE_PLAYS: readonly LifecyclePlay[] = [
  limitPressurePlay,
  successMilestonePlay,
  whatsappWarningPlay,
  whatsappExhaustedPlay,
  secondBusinessPlay,
  featureIntentPlay,
]
