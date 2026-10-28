import type { EmailMessage } from "@ewatrade/email"
import {
  isValidEmailSender,
  renderStorefrontTemplateUpdateTemplate,
} from "@ewatrade/email"
import type { TemplateUpdate } from "@ewatrade/storefront-templates"
import { templateUpdatePath } from "@ewatrade/storefront-templates"

export function templateUpdateEmailConfigured(
  config: Partial<NodeJS.ProcessEnv>,
) {
  return (
    config.STOREFRONT_TEMPLATE_UPDATE_EMAILS_ENABLED === "true" &&
    config.APP_ENV === "production" &&
    config.NODE_ENV === "production" &&
    (!config.DEV_PROFILE || config.DEV_PROFILE === "production") &&
    config.VERCEL_ENV !== "preview" &&
    config.EMAIL_DELIVERY_MODE?.trim().toLowerCase() === "live" &&
    Boolean(config.RESEND_API_KEY?.trim()) &&
    !config.EMAIL_CAPTURE_FILE?.trim() &&
    isValidEmailSender(config.EMAIL_FROM)
  )
}

export function templateUpdateEmailUrl(
  config: Partial<NodeJS.ProcessEnv>,
  tenantId: string,
  update: Pick<TemplateUpdate, "key" | "version">,
) {
  const base = new URL(
    config.NEXT_PUBLIC_DASHBOARD_URL ??
      `https://dash.${config.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"}`,
  )
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw Error("A trusted HTTPS Dashboard origin is required.")
  return new URL(templateUpdatePath(tenantId, update.key, update.version), base)
    .href
}

export type TemplateEmailOutcome = "accepted" | "skipped" | "retry" | "unknown"
export type TemplateEmailRecipient = { businessName: string; recipient: string }
export type TemplateEmailDependencies = {
  claim(): Promise<boolean>
  recipient(): Promise<TemplateEmailRecipient | null>
  assertProviderAllowed(recipient: string): Promise<void>
  start(recipient: string): Promise<boolean>
  finish(outcome: TemplateEmailOutcome): Promise<unknown>
  send(
    message: EmailMessage,
  ): Promise<{ provider?: string; providerMessageId?: string } | undefined>
  config: Partial<NodeJS.ProcessEnv>
}

/** Provider-bound attempts are never retried automatically after an ambiguous outcome. */
export async function dispatchTemplateUpdateEmail(
  input: { id: string; tenantId: string; update: TemplateUpdate },
  deps: TemplateEmailDependencies,
) {
  if (!templateUpdateEmailConfigured(deps.config) || !(await deps.claim()))
    return null
  let started = false
  try {
    const recipient = await deps.recipient()
    if (!recipient) {
      await deps.finish("skipped")
      return "skipped"
    }
    const rendered = renderStorefrontTemplateUpdateTemplate({
      ...recipient,
      ...input.update,
      upgradeUrl: templateUpdateEmailUrl(
        deps.config,
        input.tenantId,
        input.update,
      ),
    })
    await deps.assertProviderAllowed(recipient.recipient)
    if (!(await deps.start(recipient.recipient))) {
      await deps.finish("skipped")
      return "skipped"
    }
    started = true
    const receipt = await deps.send({
      ...rendered,
      from: deps.config.EMAIL_FROM ?? "",
      to: recipient.recipient,
      subject: `${recipient.businessName}: new storefront features are ready`,
      idempotencyKey: `storefront-template-update/${input.id}`,
      tags: [{ name: "category", value: "storefront_template_update" }],
    })
    if (receipt?.provider !== "resend" || !receipt.providerMessageId?.trim())
      throw Error("Email acceptance is unconfirmed.")
    await deps.finish("accepted")
    return "accepted"
  } catch {
    const outcome = started ? "unknown" : "retry"
    await deps.finish(outcome)
    return outcome
  }
}
