import type { IconKeys } from "@/components/ui/icon"
import type { GreenTillTint } from "@/lib/green-till-theme"

export type OrderChangeMode = "OFF" | "OPEN" | "APPROVAL_REQUIRED"
export type OrderChangePolicy = {
  returnsMode: OrderChangeMode
  refundsMode: OrderChangeMode
}

type Choice = {
  mode: OrderChangeMode
  title: string
  sub: string
  icon: IconKeys
  tint: GreenTillTint
}

export const RETURN_MODE_CHOICES: Choice[] = [
  {
    mode: "OPEN",
    title: "Open",
    sub: "Staff record returns; money back needs a manager",
    icon: "CheckCircle2",
    tint: "mint",
  },
  {
    mode: "APPROVAL_REQUIRED",
    title: "Needs approval",
    sub: "Staff and managers ask; an owner or admin approves",
    icon: "ShieldCheck",
    tint: "amber",
  },
  {
    mode: "OFF",
    title: "Off",
    sub: "No returns at this store",
    icon: "Ban",
    tint: "rose",
  },
]

export const REFUND_MODE_CHOICES: Choice[] = [
  {
    mode: "OPEN",
    title: "Open",
    sub: "Owners, admins and managers give money back",
    icon: "CheckCircle2",
    tint: "mint",
  },
  {
    mode: "APPROVAL_REQUIRED",
    title: "Needs approval",
    sub: "Managers and staff ask; an owner or admin approves",
    icon: "ShieldCheck",
    tint: "amber",
  },
  {
    mode: "OFF",
    title: "Off",
    sub: "No money goes back, from refunds or returns",
    icon: "Ban",
    tint: "rose",
  },
]

const MODE_WORDS: Record<OrderChangeMode, string> = {
  OPEN: "open",
  APPROVAL_REQUIRED: "need approval",
  OFF: "off",
}

/** "Returns need approval · Refunds open". */
export function orderChangePolicySummary(policy: OrderChangePolicy) {
  return `Returns ${MODE_WORDS[policy.returnsMode]} · Refunds ${MODE_WORDS[policy.refundsMode]}`
}

export function samePolicy(a: OrderChangePolicy, b: OrderChangePolicy) {
  return a.returnsMode === b.returnsMode && a.refundsMode === b.refundsMode
}
