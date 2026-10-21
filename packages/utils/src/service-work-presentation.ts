// Presentation only: these names never authorize work, payment or completion.
export function isCleaningServiceName(name: string) {
  return ["home cleaning", "event cleaning"].includes(
    name.trim().toLowerCase().replace(/\s+/g, " "),
  )
}

export function usesCustomerSignOff(serviceNames: readonly string[]) {
  return serviceNames.length > 0 && serviceNames.every(isCleaningServiceName)
}

export function serviceWorkStatusLabel(
  status: string,
  serviceNames: readonly string[],
) {
  if (
    status.toLowerCase() === "ready_for_handoff" &&
    usesCustomerSignOff(serviceNames)
  ) {
    return "Customer sign-off"
  }
  return status.toLowerCase().replaceAll("_", " ")
}
