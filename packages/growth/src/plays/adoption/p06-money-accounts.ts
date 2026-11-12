import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, isPaidPlan } from "./shared"

export const MONEY_ACCOUNTS_MIN_ORDERS = 10

/** P06: 10+ orders and at most one money account. Finance is a paid feature. */
export const moneyAccountsPlay: LifecyclePlay = {
  id: "P06_money_accounts",
  family: "adoption",
  consent: "productTips",
  channels: ["in_app", "email"],
  realtime: false,
  eligible: ({ snapshot }) => {
    if (!isPaidPlan(snapshot) || snapshot.stage === "dormant") return null
    if (snapshot.ordersTotal < MONEY_ACCOUNTS_MIN_ORDERS) return null
    if (snapshot.moneyAccounts > 1) return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-money-accounts",
      inAppKey: "money_accounts",
      data: {
        ordersTotal: snapshot.ordersTotal,
        moneyAccounts: snapshot.moneyAccounts,
      },
      ctaPath: ADOPTION_CTA.moneyAccounts,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.moneyAccounts >= 2,
  },
}
