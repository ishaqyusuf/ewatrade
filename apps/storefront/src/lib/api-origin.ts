const DEFAULT_API_ORIGIN = "http://localhost:3095"

export function resolveStorefrontApiOrigin(input: {
  apiUrl?: string
  publicApiUrl?: string
}) {
  return (
    input.apiUrl?.trim() ||
    input.publicApiUrl?.trim() ||
    DEFAULT_API_ORIGIN
  ).replace(/\/$/, "")
}
