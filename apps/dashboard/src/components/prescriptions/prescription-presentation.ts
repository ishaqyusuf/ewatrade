export function formatPrescriptionStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}
