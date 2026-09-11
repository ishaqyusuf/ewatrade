export type StoreConversationAttachmentRequestKind =
  | "commerce_inquiry"
  | "prescription_request"
  | "service_request"

export type StoreConversationAttachmentTarget =
  | {
      kind: "existing_request"
      request: {
        id: string
        kind: StoreConversationAttachmentRequestKind
        revision: number
      }
    }
  | { kind: "new_commerce_inquiry" }
  | { kind: "new_prescription_request" }

export function storeConversationAttachmentTargetKey(
  target: StoreConversationAttachmentTarget,
) {
  return JSON.stringify(target)
}

export function storeConversationAttachmentTargetRequiresConsent(
  target: StoreConversationAttachmentTarget | null,
) {
  return target?.kind === "new_prescription_request"
}

export function canSelectStoreConversationAttachment(input: {
  capabilityAvailable: boolean
  prescriptionConsentAccepted: boolean
  target: StoreConversationAttachmentTarget | null
}) {
  if (!input.target || !input.capabilityAvailable) return false
  return (
    !storeConversationAttachmentTargetRequiresConsent(input.target) ||
    input.prescriptionConsentAccepted
  )
}

export function resolveStoreConversationAttachmentTargets(input: {
  availableRequestKinds: readonly (
    | "prescription"
    | "product_inquiry"
    | "service"
  )[]
  requests: Array<{
    id: string
    kind: StoreConversationAttachmentRequestKind
    label: string
    lifecycle: "active" | "terminal"
    revision: number
  }>
}) {
  const targets: Array<{
    key: string
    label: string
    target: StoreConversationAttachmentTarget
  }> = input.requests
    .filter((request) => request.lifecycle === "active")
    .map((request) => {
      const target: StoreConversationAttachmentTarget = {
        kind: "existing_request",
        request: {
          id: request.id,
          kind: request.kind,
          revision: request.revision,
        },
      }
      return {
        key: storeConversationAttachmentTargetKey(target),
        label: request.label,
        target,
      }
    })
  if (input.availableRequestKinds.includes("product_inquiry")) {
    const target: StoreConversationAttachmentTarget = {
      kind: "new_commerce_inquiry",
    }
    targets.push({
      key: storeConversationAttachmentTargetKey(target),
      label: "New product Request",
      target,
    })
  }
  if (input.availableRequestKinds.includes("prescription")) {
    const target: StoreConversationAttachmentTarget = {
      kind: "new_prescription_request",
    }
    targets.push({
      key: storeConversationAttachmentTargetKey(target),
      label: "New prescription Request",
      target,
    })
  }
  return targets
}
