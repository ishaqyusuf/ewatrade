export function buildDomainCheckoutCallbackUrl(params: {
  baseUrl: string
  domainOrderId: string
  surface: "dashboard" | "mobile"
}) {
  const url = new URL(params.baseUrl)
  url.searchParams.set("domainOrderId", params.domainOrderId)

  if (params.surface === "dashboard") {
    url.searchParams.set("domainMode", "progress")
  }

  return url.toString()
}
