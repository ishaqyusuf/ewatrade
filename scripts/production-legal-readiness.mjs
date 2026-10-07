const PAGES = new Map([
  ["terms", "Terms of Service"],
  ["privacy", "Privacy Notice"],
  ["support", "Support and contact"],
  ["delete-account", "Delete your EwaTrade account"],
  ["billing-policy", "Software billing policy"],
])

function barePublicOrigin(value, label, failures) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${label} is missing.`)
    return null
  }
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname.includes(".") ||
      /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
      url.hostname.includes(":") ||
      /\.(?:invalid|localhost|local|internal|test)$/.test(url.hostname)
    ) {
      failures.push(`${label} must be a bare public HTTPS origin.`)
      return null
    }
    return url.origin
  } catch {
    failures.push(`${label} must be a bare public HTTPS origin.`)
    return null
  }
}

export function validateProductionLegalConfiguration(rootEnv, mobileEnv) {
  const failures = []
  const marketingOrigin = barePublicOrigin(
    rootEnv.NEXT_PUBLIC_MARKETING_URL,
    "root NEXT_PUBLIC_MARKETING_URL",
    failures,
  )
  const mobileOrigin = barePublicOrigin(
    mobileEnv.EXPO_PUBLIC_LEGAL_ORIGIN,
    "mobile EXPO_PUBLIC_LEGAL_ORIGIN",
    failures,
  )
  if (marketingOrigin && mobileOrigin) {
    const marketingHost = new URL(marketingOrigin).hostname
    const relatedHost = marketingHost.startsWith("www.")
      ? marketingHost.slice(4)
      : `www.${marketingHost}`
    const allowed = [marketingOrigin, `https://${relatedHost}`]
    if (!allowed.includes(mobileOrigin))
      failures.push(
        "mobile EXPO_PUBLIC_LEGAL_ORIGIN must match the Marketing origin or its www host.",
      )
  }
  return { origin: failures.length ? null : mobileOrigin, failures }
}

function isExpectedDestination(response, origin, path) {
  try {
    const initial = new URL(origin)
    const final = new URL(response.url)
    const relatedHosts = initial.hostname.startsWith("www.")
      ? [initial.hostname, initial.hostname.slice(4)]
      : [initial.hostname, `www.${initial.hostname}`]
    return (
      final.protocol === "https:" &&
      relatedHosts.includes(final.hostname) &&
      !final.port &&
      !final.username &&
      !final.password &&
      final.pathname === path &&
      !final.search &&
      !final.hash
    )
  } catch {
    return false
  }
}

export async function probeProductionLegal(
  origin,
  expectedPublication,
  fetchImpl = fetch,
  now = new Date(),
) {
  const failures = []
  const request = async (path) => {
    try {
      return await fetchImpl(`${origin}${path}`, {
        redirect: "follow",
        cache: "no-store",
        headers: {
          accept: path.startsWith("/api/") ? "application/json" : "text/html",
        },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      failures.push(`${path} could not be reached.`)
      return null
    }
  }

  const status = await request("/api/legal-publication")
  if (!status) return failures
  if (
    status.status !== 200 ||
    !status.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json") ||
    !isExpectedDestination(status, origin, "/api/legal-publication")
  ) {
    failures.push(
      "/api/legal-publication must return JSON 200 from the EwaTrade public host.",
    )
    return failures
  }

  let publication
  try {
    publication = await status.json()
  } catch {
    failures.push("/api/legal-publication returned invalid JSON.")
    return failures
  }
  const effective = publication?.effectiveDate
  const effectiveTime =
    typeof effective === "string" && /^\d{4}-\d{2}-\d{2}$/.test(effective)
      ? Date.parse(`${effective}T00:00:00Z`)
      : Number.NaN
  if (
    publication?.approved !== true ||
    publication?.signupAvailable !== true ||
    typeof publication.version !== "string" ||
    !publication.version ||
    publication.version.includes("draft") ||
    typeof publication.documentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(publication.documentHash) ||
    !Number.isFinite(effectiveTime) ||
    effectiveTime > now.getTime()
  ) {
    failures.push(
      "Legal publication is not approved and effective on the public host.",
    )
    return failures
  }
  if (
    publication.version !== expectedPublication.version ||
    publication.effectiveDate !== expectedPublication.effectiveDate ||
    publication.documentHash !== expectedPublication.documentHash
  ) {
    failures.push(
      "The public legal publication differs from the approved source snapshot.",
    )
    return failures
  }

  for (const [slug, title] of PAGES) {
    const path = `/${slug}`
    const response = await request(path)
    if (!response) continue
    if (
      response.status !== 200 ||
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("text/html") ||
      !isExpectedDestination(response, origin, path)
    ) {
      failures.push(
        `${path} must return HTML 200 from the EwaTrade public host.`,
      )
      continue
    }
    // React separates adjacent text with comments; comments are not visible content.
    const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, "")
    const heading = /<h1\b[^>]*>([^<]*)<\/h1>/i.exec(html)?.[1]?.trim()
    const deletionIntakeMissing =
      slug === "delete-account" &&
      !/<form\b[\s\S]*?<input\b[^>]*\bid=["']deletion-email["']/i.test(html)
    const headerNoindex = /\bnoindex\b/i.test(
      response.headers.get("x-robots-tag") ?? "",
    )
    if (
      heading !== title ||
      !html.includes(`Version ${publication.version}`) ||
      !html.includes(`Effective ${effective}`) ||
      headerNoindex ||
      /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots["'])/i.test(
        html,
      ) ||
      html.includes("This document is not yet effective.")
    ) {
      failures.push(
        `${path} does not render the approved, indexable legal version.`,
      )
    }
    if (deletionIntakeMissing)
      failures.push(
        "/delete-account does not expose the verified external request form.",
      )
  }
  const intakePath = "/api/trpc/accountPrivacy.externalIntakeAvailability"
  const intake = await request(intakePath)
  if (
    !intake ||
    intake.status !== 200 ||
    !intake.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json") ||
    !isExpectedDestination(intake, origin, intakePath)
  ) {
    failures.push("The public account-deletion intake API is unavailable.")
  } else {
    try {
      const result = await intake.json()
      if (result?.result?.data?.json?.available !== true)
        failures.push("The public account-deletion intake API is not ready.")
    } catch {
      failures.push(
        "The public account-deletion intake API returned invalid JSON.",
      )
    }
  }
  return failures
}
