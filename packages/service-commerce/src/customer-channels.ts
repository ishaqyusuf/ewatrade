import type {
  ServiceCommerceEntryPoint,
  ServiceCommerceEntryPointAction,
  ServiceCommerceEntryPointChannel,
  ServiceCommerceEntryPointProjection,
  ServiceCommerceEntryPointPublishBlocker,
  ServiceCommerceStoreAttendantAssignmentStatus,
} from "./schemas"

export function getServiceCommerceEntryPointPublishBlockers(input: {
  attendants: ServiceCommerceStoreAttendantAssignmentStatus[]
  channels: ServiceCommerceEntryPointChannel[]
}): ServiceCommerceEntryPointPublishBlocker[] {
  const blockers: ServiceCommerceEntryPointPublishBlocker[] = []

  if (!input.attendants.some((attendant) => attendant.status === "active")) {
    blockers.push("active_attendant_missing")
  }
  if (!input.channels.some((channel) => channel.readiness === "available")) {
    blockers.push("allowed_channel_missing")
  }

  return blockers
}

export function projectServiceCommerceEntryPoint(input: {
  attendants: ServiceCommerceStoreAttendantAssignmentStatus[]
  channels: ServiceCommerceEntryPointChannel[]
  entryPoint: ServiceCommerceEntryPoint
}): ServiceCommerceEntryPointProjection {
  const publishBlockers = getServiceCommerceEntryPointPublishBlockers(input)
  const actions: ServiceCommerceEntryPointAction[] =
    input.entryPoint.status === "published" && publishBlockers.length === 0
      ? ["copy_link", "download_qr"]
      : []

  return { ...input.entryPoint, actions, publishBlockers }
}
