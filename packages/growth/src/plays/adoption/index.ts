import type { LifecyclePlay } from "../../contract"
import { firstSalePlay } from "./p02-first-sale"
import { assistantChannelPlay } from "./p03-assistant-channel"
import { siteSetupPlay } from "./p04-site-setup"
import { customDomainPlay } from "./p05-custom-domain"
import { moneyAccountsPlay } from "./p06-money-accounts"
import { staffPlay } from "./p07-staff"
import { monthlyReportPlay } from "./p13-monthly-report"
import { atRiskPlay } from "./p14-at-risk"
import { winBackPlay } from "./p15-win-back"

/**
 * Owned by workstream W2: P02–P07 and P13–P15.
 * P01 (welcome) stays the signup flow's transactional `09-workspace-welcome`
 * email: it doubles as the verify-your-workspace mail and needs hostnames the
 * snapshot does not carry, so it is not a sweep play.
 */
export const ADOPTION_PLAYS: readonly LifecyclePlay[] = [
  firstSalePlay,
  assistantChannelPlay,
  siteSetupPlay,
  customDomainPlay,
  moneyAccountsPlay,
  staffPlay,
  monthlyReportPlay,
  atRiskPlay,
  winBackPlay,
]
