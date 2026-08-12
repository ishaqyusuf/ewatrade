import type {
  ServiceCommercePublicEntryAction,
  ServiceCommercePublicEntryRequestKind,
} from "@ewatrade/service-commerce"

export function shouldUseStoreConversationTextTracer(input: {
  actions: ServiceCommercePublicEntryAction[]
  requestKinds: ServiceCommercePublicEntryRequestKind[]
}) {
  return (
    input.actions.length === 1 &&
    input.actions[0] === "request_online" &&
    input.requestKinds.length > 0
  )
}
