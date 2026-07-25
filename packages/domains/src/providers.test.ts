import { describe, expect, test } from "bun:test"

import { Go54DomainProvider } from "./go54"
import { OpenproviderDomainProvider } from "./openprovider"
import { PaystackClient } from "./paystack"
import { DomainProviderError } from "./types"
import { VercelDomainClient } from "./vercel"

const registrant = {
  addressLine1: "1 Marina Road",
  city: "Lagos",
  countryCode: "NG",
  email: "owner@example.com",
  firstName: "Ada",
  lastName: "Okafor",
  phoneCountryCode: "+234",
  phoneNumber: "08012345678",
  postalCode: "100001",
  region: "Lagos",
}

describe("registrar adapters", () => {
  test("normalizes a GO54 availability response", async () => {
    const requests: Array<{ body: string; url: string }> = []
    const provider = new Go54DomainProvider({
      apiKey: "secret",
      baseUrl: "https://go54.test",
      fetch: (async (input, init) => {
        requests.push({
          body: String(init?.body ?? ""),
          url: String(input),
        })
        return Response.json({
          data: {
            "acme.com.ng": {
              available: true,
              price: { currency: "NGN", price: 6500 },
              renewal: { currency: "NGN", price: 7000 },
              status: "available",
            },
          },
        })
      }) as typeof fetch,
      username: "owner@example.com",
    })

    const result = await provider.checkAvailability("Acme.com.ng")

    expect(result).toMatchObject({
      available: true,
      domain: "acme.com.ng",
      provider: "GO54",
      registrationPrice: { amountMinor: 650_000, currencyCode: "NGN" },
    })
    expect(requests[0]?.url).toBe("https://go54.test/domains/lookup")
    expect(requests[0]?.body).toContain("tldsToInclude%5B%5D=.com.ng")
  })

  test("authenticates and normalizes Openprovider pricing", async () => {
    const requests: string[] = []
    const provider = new OpenproviderDomainProvider({
      baseUrl: "https://openprovider.test/v1beta",
      fetch: (async (input) => {
        const url = String(input)
        requests.push(url)
        if (url.endsWith("/auth/login")) {
          return Response.json({ code: 0, data: { token: "token" } })
        }
        return Response.json({
          code: 0,
          data: {
            results: [
              {
                domain: "acme.com",
                is_premium: false,
                price: {
                  product: { currency: "USD", price: 12.5 },
                  reseller: { currency: "EUR", price: 11.75 },
                },
                status: "free",
              },
            ],
          },
        })
      }) as typeof fetch,
      password: "password",
      username: "username",
    })

    const result = await provider.checkAvailability("acme.com")

    expect(result).toMatchObject({
      available: true,
      provider: "OPENPROVIDER",
      registrationPrice: { amountMinor: 1175, currencyCode: "EUR" },
    })
    expect(requests).toEqual([
      "https://openprovider.test/v1beta/auth/login",
      "https://openprovider.test/v1beta/domains/check",
    ])
  })

  test("uses Openprovider's accepted premium create price", async () => {
    const provider = new OpenproviderDomainProvider({
      baseUrl: "https://openprovider.test/v1beta",
      fetch: (async (input) => {
        if (String(input).endsWith("/auth/login")) {
          return Response.json({ code: 0, data: { token: "token" } })
        }
        return Response.json({
          code: 0,
          data: {
            results: [
              {
                domain: "valuable.com",
                is_premium: true,
                premium: {
                  currency: "USD",
                  price: { create: 1_250 },
                },
                status: "free",
              },
            ],
          },
        })
      }) as typeof fetch,
      password: "password",
      username: "username",
    })

    await expect(
      provider.checkAvailability("valuable.com"),
    ).resolves.toMatchObject({
      isPremium: true,
      registrationPrice: {
        amountMinor: 125_000,
        currencyCode: "USD",
      },
    })
  })

  test("sends GO54's documented nested registration payload", async () => {
    let requestBody = ""
    const provider = new Go54DomainProvider({
      apiKey: "secret",
      baseUrl: "https://go54.test",
      fetch: (async (_input, init) => {
        requestBody = String(init?.body)
        return Response.json({
          data: {
            domainId: "domain_1",
            expiryDate: "2027-07-24T00:00:00.000Z",
            status: "success",
          },
        })
      }) as typeof fetch,
      username: "owner@example.com",
    })

    const result = await provider.registerDomain({
      acceptedProviderCost: { amountMinor: 650_000, currencyCode: "NGN" },
      domain: "acme.com.ng",
      idempotencyKey: "domain-register:order_1",
      isPremium: false,
      nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"],
      periodYears: 1,
      registrant,
    })
    const body = new URLSearchParams(requestBody)

    expect(body.get("nameservers[ns1]")).toBe("ns1.vercel-dns.com")
    expect(body.get("nameservers[ns2]")).toBe("ns2.vercel-dns.com")
    expect(body.get("contacts[registrant][fullname]")).toBe("Ada Okafor")
    expect(body.get("contacts[registrant][zipcode]")).toBe("100001")
    expect(body.get("contacts[registrant][phonenumber]")).toBe(
      "+234.8012345678",
    )
    expect(result).toMatchObject({
      providerDomainId: "domain_1",
      status: "registered",
    })
  })

  test("uses GO54's sync endpoint for authoritative domain state", async () => {
    const requests: Array<{ body: string; method: string; url: string }> = []
    const provider = new Go54DomainProvider({
      apiKey: "secret",
      baseUrl: "https://go54.test",
      fetch: (async (input, init) => {
        requests.push({
          body: String(init?.body ?? ""),
          method: String(init?.method ?? "GET"),
          url: String(input),
        })
        return Response.json({
          data: {
            domainId: "domain_1",
            expiryDate: "2027-07-24T00:00:00.000Z",
            status: "active",
          },
        })
      }) as typeof fetch,
      username: "owner@example.com",
    })

    await expect(provider.getDomain("acme.com.ng")).resolves.toMatchObject({
      providerDomainId: "domain_1",
      status: "active",
    })
    expect(requests).toEqual([
      {
        body: "domain=acme.com.ng",
        method: "POST",
        url: "https://go54.test/domains/acme.com.ng/sync",
      },
    ])
  })

  test("rejects GO54 application errors returned with HTTP 200", async () => {
    const provider = new Go54DomainProvider({
      apiKey: "secret",
      baseUrl: "https://go54.test",
      fetch: (async (_input) =>
        Response.json({
          message: "Insufficient reseller balance",
          status: "error",
        })) as typeof fetch,
      username: "owner@example.com",
    })

    const error = await provider
      .renewDomain({
        domain: "acme.com.ng",
        idempotencyKey: "domain-renew:domain_1",
        periodYears: 1,
      })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(DomainProviderError)
    expect(error).toMatchObject({
      code: "GO54_RENEWAL_FAILED",
      isUncertain: false,
    })
  })

  test("preserves Openprovider requested registrations for reconciliation", async () => {
    const requestBodies: Record<string, unknown> = {}
    const provider = new OpenproviderDomainProvider({
      baseUrl: "https://openprovider.test/v1beta",
      fetch: (async (input, init) => {
        const url = String(input)
        if (url.endsWith("/auth/login")) {
          return Response.json({ code: 0, data: { token: "token" } })
        }
        requestBodies[url] = JSON.parse(String(init?.body))
        if (url.endsWith("/customers")) {
          return Response.json({
            code: 0,
            data: { handle: "EW123-NG" },
          })
        }
        return Response.json({
          code: 0,
          data: {
            expiration_date: "2027-07-24T00:00:00.000Z",
            id: 123,
            status: "REQ",
          },
        })
      }) as typeof fetch,
      password: "password",
      username: "username",
    })

    await expect(
      provider.registerDomain({
        acceptedProviderCost: { amountMinor: 1_250, currencyCode: "USD" },
        domain: "acme.com",
        idempotencyKey: "domain-register:order_1",
        isPremium: true,
        nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"],
        periodYears: 1,
        registrant,
      }),
    ).resolves.toMatchObject({
      providerCustomerHandle: "EW123-NG",
      providerDomainId: "123",
      registeredAt: null,
      status: "pending",
    })
    expect(
      requestBodies["https://openprovider.test/v1beta/customers"],
    ).toMatchObject({
      phone: {
        country_code: "+234",
        subscriber_number: "8012345678",
      },
    })
    expect(
      requestBodies["https://openprovider.test/v1beta/domains"],
    ).toMatchObject({
      domain: { extension: "com", name: "acme" },
      name_servers: [
        { name: "ns1.vercel-dns.com" },
        { name: "ns2.vercel-dns.com" },
      ],
      accept_premium_fee: 12.5,
      owner_handle: "EW123-NG",
    })
  })

  test("searches Openprovider domains by documented full_name", async () => {
    const requests: string[] = []
    const provider = new OpenproviderDomainProvider({
      baseUrl: "https://openprovider.test/v1beta",
      fetch: (async (input) => {
        const url = String(input)
        requests.push(url)
        if (url.endsWith("/auth/login")) {
          return Response.json({ code: 0, data: { token: "token" } })
        }
        return Response.json({
          code: 0,
          data: {
            results: [
              {
                id: 123,
                registry_expiration_date: "2027-07-24T00:00:00.000Z",
                status: "ACT",
              },
            ],
          },
        })
      }) as typeof fetch,
      password: "password",
      username: "username",
    })

    await expect(provider.getDomain("acme.com")).resolves.toMatchObject({
      providerDomainId: "123",
      status: "active",
    })
    expect(requests[1]).toBe(
      "https://openprovider.test/v1beta/domains?full_name=acme.com&limit=1",
    )
  })

  test("classifies Openprovider customer creation failures as pre-registration", async () => {
    const provider = new OpenproviderDomainProvider({
      baseUrl: "https://openprovider.test/v1beta",
      fetch: (async (input) => {
        if (String(input).endsWith("/auth/login")) {
          return Response.json({ code: 0, data: { token: "token" } })
        }
        throw new Error("connection reset")
      }) as typeof fetch,
      password: "password",
      username: "username",
    })

    const error = await provider
      .registerDomain({
        acceptedProviderCost: { amountMinor: 1_250, currencyCode: "USD" },
        domain: "acme.com",
        idempotencyKey: "domain-register:order_1",
        isPremium: false,
        nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"],
        periodYears: 1,
        registrant,
      })
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(DomainProviderError)
    expect(error).toMatchObject({
      code: "OPENPROVIDER_NETWORK_ERROR",
      isUncertain: false,
    })
  })
})

describe("payment and hosting adapters", () => {
  test("initializes Paystack with minor units and reference", async () => {
    let requestBody = ""
    const paystack = new PaystackClient({
      fetch: (async (_input, init) => {
        requestBody = String(init?.body)
        return Response.json({
          data: {
            access_code: "access",
            authorization_url: "https://checkout.test/pay",
            reference: "domain_ref",
          },
          status: true,
        })
      }) as typeof fetch,
      secretKey: "secret",
    })

    await expect(
      paystack.initializeTransaction({
        amountMinor: 250_000,
        callbackUrl: "ewatrade://domain-management-modal",
        currencyCode: "NGN",
        email: "owner@example.com",
        metadata: { domainOrderId: "order_1" },
        reference: "domain_ref",
      }),
    ).resolves.toEqual({
      accessCode: "access",
      authorizationUrl: "https://checkout.test/pay",
      reference: "domain_ref",
    })
    expect(JSON.parse(requestBody)).toMatchObject({
      amount: 250_000,
      reference: "domain_ref",
    })
  })

  test("requests a Paystack refund against the original reference", async () => {
    let requestBody = ""
    const paystack = new PaystackClient({
      fetch: (async (_input, init) => {
        requestBody = String(init?.body)
        return Response.json({
          data: { id: 42, status: "pending" },
          status: true,
        })
      }) as typeof fetch,
      secretKey: "secret",
    })

    await expect(
      paystack.refundTransaction({
        amountMinor: 250_000,
        currencyCode: "NGN",
        reference: "domain_ref",
      }),
    ).resolves.toEqual({
      providerRefundId: "42",
      status: "pending",
    })
    expect(JSON.parse(requestBody)).toEqual({
      amount: 250_000,
      currency: "NGN",
      transaction: "domain_ref",
    })
  })

  test("treats an already attached Vercel domain as idempotent", async () => {
    const vercel = new VercelDomainClient({
      fetch: (async (_input) =>
        Response.json(
          { error: { message: "Domain already exists" } },
          { status: 409 },
        )) as typeof fetch,
      token: "token",
    })

    await expect(
      vercel.addDomain("storefront-project", "acme.com"),
    ).resolves.toBeUndefined()
  })

  test("returns Vercel's ownership record when further verification is required", async () => {
    const vercel = new VercelDomainClient({
      fetch: (async (_input) =>
        Response.json({
          name: "acme.com",
          verification: [
            {
              domain: "_vercel.acme.com",
              reason: "pending_domain_verification",
              type: "TXT",
              value: "vc-domain-verify=acme.com,token",
            },
          ],
          verified: false,
        })) as typeof fetch,
      token: "token",
    })

    await expect(
      vercel.inspectDomain("storefront-project", "acme.com"),
    ).resolves.toMatchObject({
      verificationRecord: {
        name: "_vercel.acme.com",
        type: "TXT",
        value: "vc-domain-verify=acme.com,token",
      },
      verified: false,
    })
  })
})
