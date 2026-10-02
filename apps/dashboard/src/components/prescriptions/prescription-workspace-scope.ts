export function prescriptionWorkspaceScopeKey(
  storeId: string,
  requestId: string,
) {
  return JSON.stringify([storeId, requestId])
}
