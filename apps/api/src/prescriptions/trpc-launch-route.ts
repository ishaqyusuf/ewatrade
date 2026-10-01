/** Identify pharmacy procedures before tRPC parses a request body. */
export function isPrescriptionTrpcRoute(path: string) {
  const prefix = "/api/trpc/"
  if (!path.startsWith(prefix)) return false

  let procedurePath: string
  try {
    procedurePath = decodeURIComponent(path.slice(prefix.length))
  } catch {
    return false
  }

  return procedurePath
    .split(",")
    .some(
      (procedure) =>
        procedure.startsWith("prescriptions.") ||
        procedure.startsWith("prescriptionAccess."),
    )
}
