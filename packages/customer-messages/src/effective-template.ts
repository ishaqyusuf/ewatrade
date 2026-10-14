import type { CustomerMessageEventKey } from "./customer-message-catalog"
import type { MessageTemplate } from "./template"

export type EffectiveMessageTemplateState = "composed" | "missing" | "disabled"
export type EffectiveMessageTemplateScope = "business" | "store"

export interface EffectiveMessageTemplate {
  state: EffectiveMessageTemplateState
  template: MessageTemplate | null
  scope: EffectiveMessageTemplateScope | null
}

function newestTemplate(
  templates: readonly MessageTemplate[],
  scopeKey: string,
  eventKey: CustomerMessageEventKey,
): MessageTemplate | null {
  return (
    templates
      .filter(
        (template) =>
          template.scopeKey === scopeKey && template.eventKey === eventKey,
      )
      .sort((left, right) => right.revision - left.revision)[0] ?? null
  )
}

function resultFor(
  template: MessageTemplate,
  scope: EffectiveMessageTemplateScope,
): EffectiveMessageTemplate {
  return {
    state: template.enabled ? "composed" : "disabled",
    template,
    scope,
  }
}

export function resolveEffectiveMessageTemplate(
  templates: readonly MessageTemplate[],
  storeId: string,
  eventKey: CustomerMessageEventKey,
): EffectiveMessageTemplate {
  const storeTemplate = newestTemplate(templates, `store:${storeId}`, eventKey)
  if (storeTemplate) return resultFor(storeTemplate, "store")

  const businessTemplate = newestTemplate(templates, "business", eventKey)
  if (businessTemplate) return resultFor(businessTemplate, "business")

  return { state: "missing", template: null, scope: null }
}
