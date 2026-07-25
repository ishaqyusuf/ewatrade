type Fetch = typeof fetch

type VercelDomainConfig = {
  apexName: string
  configuredBy: "A" | "CNAME" | "none"
  expectedValue: string | null
  verificationRecord: {
    name: string
    type: string
    value: string
  } | null
  verified: boolean
}

export class VercelDomainClient {
  readonly #fetch: Fetch
  readonly #teamId: string | null
  readonly #token: string

  constructor(params: {
    fetch?: Fetch
    teamId?: string | null
    token: string
  }) {
    this.#fetch = params.fetch ?? fetch
    this.#teamId = params.teamId?.trim() || null
    this.#token = params.token
  }

  #url(path: string) {
    const url = new URL(`https://api.vercel.com${path}`)
    if (this.#teamId) {
      url.searchParams.set("teamId", this.#teamId)
    }
    return url
  }

  async #request(path: string, init?: RequestInit) {
    const response = await this.#fetch(this.#url(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    if (!response.ok) {
      const error = payload.error as { message?: string } | undefined
      throw new Error(
        error?.message ?? `Vercel domain request failed (${response.status}).`,
      )
    }

    return payload
  }

  async addDomain(projectId: string, domain: string) {
    try {
      await this.#request(`/v10/projects/${projectId}/domains`, {
        body: JSON.stringify({ name: domain }),
        method: "POST",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (!/already|exists|assigned/i.test(message)) throw error
    }
  }

  async inspectDomain(
    projectId: string,
    domain: string,
  ): Promise<VercelDomainConfig> {
    const payload = await this.#request(
      `/v9/projects/${projectId}/domains/${domain}`,
    )
    const verification = Array.isArray(payload.verification)
      ? (payload.verification[0] as
          | { domain?: string; reason?: string; type?: string; value?: string }
          | undefined)
      : undefined
    const configuredBy =
      verification?.type === "A"
        ? "A"
        : verification?.type === "CNAME"
          ? "CNAME"
          : "none"

    return {
      apexName: String(payload.name ?? domain),
      configuredBy,
      expectedValue: verification?.value ?? null,
      verificationRecord:
        verification?.domain && verification.type && verification.value
          ? {
              name: verification.domain,
              type: verification.type,
              value: verification.value,
            }
          : null,
      verified: payload.verified === true,
    }
  }
}
