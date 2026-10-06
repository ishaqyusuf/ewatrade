import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"

export type PlayRefundReviewAlertInput = {
  total: number
  overdue: number
  earliestDue: string
}

function details(input: PlayRefundReviewAlertInput) {
  return [
    { label: "Unresolved cases", value: String(input.total) },
    { label: "Overdue cases", value: String(input.overdue) },
    { label: "Earliest response deadline (UTC)", value: input.earliestDue },
  ]
}

const intro =
  "Inspect the platform-admin refund-review queue and follow the reviewed operator procedure."
const warning =
  "A CLAIMED or UNCERTAIN response must be reconciled with Google manually; do not submit it again."
const privacy =
  "This email contains no purchase token, order ID or customer information."

export function PlayRefundReviewAlertEmail({
  input,
}: { input: PlayRefundReviewAlertInput }) {
  return (
    <BrandEmail
      eyebrow="Billing operations"
      intro={intro}
      note={`${warning} ${privacy}`}
      preview="Unresolved Play refund review cases need attention"
      title="Refund reviews need attention."
    >
      <EmailStatus label="Operator review" tone="attention" />
      <EmailDetails details={details(input)} />
    </BrandEmail>
  )
}

export function renderPlayRefundReviewAlertTemplate(
  input: PlayRefundReviewAlertInput,
) {
  return {
    html: renderEmailMarkup(<PlayRefundReviewAlertEmail input={input} />),
    text: [
      ...details(input).map(({ label, value }) => `${label}: ${value}`),
      intro,
      warning,
      privacy,
    ].join("\n"),
  }
}

export default PlayRefundReviewAlertEmail
