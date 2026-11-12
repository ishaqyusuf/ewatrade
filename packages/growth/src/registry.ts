import {
  type LifecyclePlay,
  PLAY_IDS,
  PLAY_PRIORITY,
  type PlayId,
} from "./contract"
import { ADOPTION_PLAYS } from "./plays/adoption"
import { REVENUE_PLAYS } from "./plays/revenue"

/** Every registered play. Workstreams add plays to their own folder, not here. */
export const LIFECYCLE_PLAYS: readonly LifecyclePlay[] = [
  ...ADOPTION_PLAYS,
  ...REVENUE_PLAYS,
]

/** Lower rank = higher priority when several plays are eligible. */
export function playRank(id: PlayId) {
  const priority = PLAY_PRIORITY.indexOf(id)
  return priority >= 0 ? priority : PLAY_PRIORITY.length + PLAY_IDS.indexOf(id)
}

export function findPlay(id: PlayId) {
  return LIFECYCLE_PLAYS.find((play) => play.id === id)
}
