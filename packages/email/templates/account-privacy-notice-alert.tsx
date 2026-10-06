import { BrandEmail, EmailDetails, EmailStatus } from "../components"
import { renderEmailMarkup } from "../src/render"

export type AccountPrivacyNoticeAlertInput = {
  failed: number
  failedAfterCompletion: number
  uncertain: number
  staleSending: number
  deliveryUnconfirmed: number
}

function details(input: AccountPrivacyNoticeAlertInput) {
  return [
    { label: "Failed notices", value: String(input.failed) },
    {
      label: "Failures after a completed request",
      value: String(input.failedAfterCompletion),
    },
    { label: "Uncertain sends", value: String(input.uncertain) },
    {
      label: "Sends in progress over 10 minutes",
      value: String(input.staleSending),
    },
    {
      label: "Accepted sends without delivery over 1 hour",
      value: String(input.deliveryUnconfirmed),
    },
  ]
}

const intro =
  "Inspect the platform-admin account-deletion review queue and provider event history."
const warning =
  "Do not resend an uncertain attempt without reconciling the original provider outcome."
const privacy =
  "This alert contains no person, request, message or recipient identifier."

export function AccountPrivacyNoticeAlertEmail({
  input,
}: { input: AccountPrivacyNoticeAlertInput }) {
  return (
    <BrandEmail
      eyebrow="Privacy operations"
      intro={intro}
      note={`${warning} ${privacy}`}
      preview="Account-deletion notice delivery needs review"
      title="Notice delivery needs review."
    >
      <EmailStatus label="Operator review" tone="attention" />
      <EmailDetails details={details(input)} />
    </BrandEmail>
  )
}

export function renderAccountPrivacyNoticeAlertTemplate(
  input: AccountPrivacyNoticeAlertInput,
) {
  return {
    html: renderEmailMarkup(<AccountPrivacyNoticeAlertEmail input={input} />),
    text: [
      ...details(input).map(({ label, value }) => `${label}: ${value}`),
      intro,
      warning,
      privacy,
    ].join("\n"),
  }
}

export default AccountPrivacyNoticeAlertEmail
