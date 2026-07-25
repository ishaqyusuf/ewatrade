import { normalizeDomainName } from "./domain-name"
import { Go54DomainProvider } from "./go54"
import { OpenproviderDomainProvider } from "./openprovider"
import type { DomainProvider, DomainProviderName } from "./types"

export function providerNameForDomain(domain: string): DomainProviderName {
  return normalizeDomainName(domain).tld === "com.ng" ? "GO54" : "OPENPROVIDER"
}

export function createDomainProvider(
  providerName: DomainProviderName,
  env: Record<string, string | undefined> = process.env,
): DomainProvider {
  if (providerName === "GO54") {
    const username = env.GO54_API_USERNAME?.trim()
    const apiKey = env.GO54_API_KEY?.trim()

    if (!username || !apiKey) {
      throw new Error("GO54_API_USERNAME and GO54_API_KEY are required.")
    }

    return new Go54DomainProvider({
      apiKey,
      baseUrl: env.GO54_API_BASE_URL,
      username,
    })
  }

  const username = env.OPENPROVIDER_API_USERNAME?.trim()
  const password = env.OPENPROVIDER_API_PASSWORD?.trim()

  if (!username || !password) {
    throw new Error(
      "OPENPROVIDER_API_USERNAME and OPENPROVIDER_API_PASSWORD are required.",
    )
  }

  return new OpenproviderDomainProvider({
    baseUrl: env.OPENPROVIDER_API_BASE_URL,
    password,
    username,
  })
}
