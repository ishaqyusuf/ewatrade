#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { prisma } from "@ewatrade/db/client"
import {
  completeRetailOpsStaffOnboarding,
  convertDryCleaningServiceRequestToOrder,
  createDryCleaningPublicServiceRequest,
  createDryCleaningServiceItem,
  createDryCleaningServiceOrder,
  createDryCleaningServiceRequestLink,
  inviteRetailOpsStaff,
  updateDryCleaningStoreSettings,
} from "@ewatrade/db/queries"
import { notificationDispatchHandler } from "../src/handlers/notification-dispatch"

type JsonRecord = Record<string, unknown>

type SignupResponse = {
  dashboardUrl?: string
  emailDeliveryStatus?: string
  success?: boolean
  tenantSlug?: string
}

type StoreResponse = {
  store?: {
    id?: string
    name?: string
    slug?: string
  }
  success?: boolean
}

type LocalHttpResponse = {
  headers: Headers
  json: () => Promise<unknown>
  ok: boolean
  setCookies: string[]
  status: number
  text: () => Promise<string>
}

type NodeHttpPayload = {
  body: string
  headers: [string, string][]
  setCookies: string[]
  status: number
}

const CONFIRMATION_ENV = "CONFIRM_MARKETING_ONBOARDING_E2E"
const REQUIRED_TEST_INBOX = "founders@ewatrade.com"
const EARLY_ACCESS_COUNT = 3
const WAITLIST_COUNT = 2

function assertConfirmed() {
  if (process.env[CONFIRMATION_ENV] !== "1") {
    throw new Error(
      `${CONFIRMATION_ENV}=1 must be set because this check creates test.com leads, sends/renders notification emails, signs up a tenant, creates a dry-cleaning store, and invites staff.`,
    )
  }
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/$/, "")
}

function assertTestInboxConfigured() {
  const recipients = [
    ...(process.env.TEST_EMAILS ?? "").split(","),
    process.env.TEST_EMAIL ?? "",
  ]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  if (!recipients.includes(REQUIRED_TEST_INBOX)) {
    throw new Error(
      `TEST_EMAILS or TEST_EMAIL must include ${REQUIRED_TEST_INBOX} for @test.com E2E routing.`,
    )
  }
}

function getObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function getLastNotificationDispatch(metadata: unknown) {
  return getObject(getObject(metadata).lastNotificationDispatch)
}

function getCookieHeader(response: LocalHttpResponse) {
  const setCookies =
    response.setCookies.length > 0
      ? response.setCookies
      : (response.headers.get("set-cookie")?.split(/,(?=\s*[^;,\s]+=)/) ?? [])

  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ")
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pass(name: string, evidence?: unknown) {
  return {
    evidence,
    name,
    status: "pass" as const,
  }
}

async function postJson<TResponse>(
  url: string,
  body: unknown,
  init?: RequestInit,
) {
  const response = await fetchWithRetry(url, {
    ...init,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    method: "POST",
  })
  const payload = (await response.json().catch(() => null)) as TResponse | null

  if (!response.ok) {
    throw new Error(
      `POST ${url} failed with ${response.status}: ${JSON.stringify(payload)}`,
    )
  }

  return {
    cookieHeader: getCookieHeader(response),
    payload,
    response,
  }
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: { attempts?: number; delayMs?: number } = {},
) {
  const attempts = options.attempts ?? 6
  const delayMs = options.delayMs ?? 500
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await localHttpRequest(url, init)
    } catch (error) {
      lastError = error

      if (attempt < attempts) {
        await sleep(delayMs)
      }
    }
  }

  throw lastError
}

async function localHttpRequest(
  url: string,
  init?: RequestInit,
): Promise<LocalHttpResponse> {
  const payload = await nodeFetch(url, init)
  const headers = new Headers(payload.headers)

  return {
    headers,
    async json() {
      return JSON.parse(payload.body)
    },
    ok: payload.status >= 200 && payload.status < 300,
    setCookies: payload.setCookies,
    status: payload.status,
    async text() {
      return payload.body
    },
  }
}

function getNodeFetchRuntime() {
  return (
    process.env.MARKETING_E2E_NODE_BIN?.trim() ||
    "/opt/homebrew/opt/node@22/bin/node"
  )
}

function toPlainHeaders(headers: RequestInit["headers"]) {
  if (!headers) return undefined

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return headers
}

function nodeFetch(url: string, init?: RequestInit): Promise<NodeHttpPayload> {
  const nodeBin = getNodeFetchRuntime()
  const request = {
    body: typeof init?.body === "string" ? init.body : undefined,
    headers: toPlainHeaders(init?.headers),
    method: init?.method ?? "GET",
    url,
  }
  const code = `
    import { readFileSync } from "node:fs";

    const request = JSON.parse(readFileSync(0, "utf8"));
    const response = await fetch(request.url, {
      body: request.body,
      headers: request.headers,
      method: request.method,
      redirect: "manual",
    });
    const getSetCookie = response.headers.getSetCookie;
    const setCookies = typeof getSetCookie === "function"
      ? getSetCookie.call(response.headers)
      : [];

    process.stdout.write(JSON.stringify({
      body: await response.text(),
      headers: Array.from(response.headers.entries()),
      setCookies,
      status: response.status,
    }));
  `
  const result = spawnSync(nodeBin, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    input: JSON.stringify(request),
  })

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `Node fetch failed with status ${result.status ?? "unknown"}.`,
    )
  }

  return Promise.resolve(JSON.parse(result.stdout) as NodeHttpPayload)
}

async function waitForLeadNotificationReceipts(input: {
  emails: string[]
  startedAt: Date
  timeoutMs?: number
}) {
  const timeoutAt = Date.now() + (input.timeoutMs ?? 20_000)
  let lastLeads: Awaited<ReturnType<typeof findLeads>> = []

  while (Date.now() < timeoutAt) {
    const leads = await findLeads(input.emails, input.startedAt)
    lastLeads = leads

    if (
      leads.length === input.emails.length &&
      leads.every((lead) => {
        const dispatch = getLastNotificationDispatch(lead.metadata)

        return dispatch.status === "sent" && Number(dispatch.sent ?? 0) > 0
      })
    ) {
      return leads
    }

    await sleep(500)
  }

  throw new Error(
    `Timed out waiting for marketing notification receipts. Last leads: ${JSON.stringify(
      lastLeads.map((lead) => ({
        email: lead.email,
        id: lead.id,
        lastNotificationDispatch: getLastNotificationDispatch(lead.metadata),
      })),
    )}`,
  )
}

async function findLeads(emails: string[], startedAt: Date) {
  return prisma.leadCapture.findMany({
    orderBy: {
      createdAt: "asc",
    },
    select: {
      createdAt: true,
      email: true,
      fullName: true,
      id: true,
      metadata: true,
      type: true,
    },
    where: {
      createdAt: {
        gte: startedAt,
      },
      email: {
        in: emails,
      },
    },
  })
}

async function findEarlyAccessSession(leadId: string, startedAt: Date) {
  const sessions = await prisma.onboardingSession.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      completed: true,
      createdAt: true,
      expiresAt: true,
      formData: true,
      tenantId: true,
      token: true,
      userId: true,
    },
    where: {
      createdAt: {
        gte: startedAt,
      },
    },
  })

  return (
    sessions.find((session) => getObject(session.formData).leadId === leadId) ??
    null
  )
}

async function readCapturedEmails(captureFile: string) {
  const contents = await readFile(captureFile, "utf8").catch(() => "")

  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          subject: string
          text: string
          to: string
        },
    )
}

async function main() {
  assertConfirmed()
  assertTestInboxConfigured()

  const marketingBaseUrl = normalizeBaseUrl(
    process.env.MARKETING_E2E_BASE_URL,
    "http://ewatrade.localhost",
  )
  const dashboardBaseUrl = normalizeBaseUrl(
    process.env.DASHBOARD_E2E_BASE_URL,
    "http://ewatrade-dashboard.localhost",
  )
  const publicBaseUrl = normalizeBaseUrl(
    process.env.PUBLIC_E2E_BASE_URL,
    "http://ewatrade.localhost",
  )
  const startedAt = new Date()
  const runId = randomUUID().replaceAll("-", "").slice(0, 10)
  const emailPrefix = `goal-${runId}`
  const earlyAccessEmails = Array.from(
    { length: EARLY_ACCESS_COUNT },
    (_, index) => `${emailPrefix}-early-${index + 1}@test.com`,
  )
  const waitlistEmails = Array.from(
    { length: WAITLIST_COUNT },
    (_, index) => `${emailPrefix}-wait-${index + 1}@test.com`,
  )
  const checks: Array<ReturnType<typeof pass>> = []

  for (const [index, email] of earlyAccessEmails.entries()) {
    await postJson(`${marketingBaseUrl}/api/early-access`, {
      companyName: `Goal E2E Laundry ${index + 1}`,
      email,
      fullName: `Goal Early ${index + 1}`,
      message: "Goal E2E early-access validation.",
      phone: "+234 800 000 0000",
      roleTitle: "Owner",
    })
  }

  for (const [index, email] of waitlistEmails.entries()) {
    await postJson(`${marketingBaseUrl}/api/waitlist`, {
      email,
      fullName: `Goal Waitlist ${index + 1}`,
    })
  }

  const leadEmails = [...earlyAccessEmails, ...waitlistEmails]
  const leads = await waitForLeadNotificationReceipts({
    emails: leadEmails,
    startedAt,
  })

  checks.push(
    pass("early-access and waitlist lead emails", {
      leadCount: leads.length,
      sentDispatches: leads.map((lead) => ({
        emailDomain: lead.email.split("@")[1],
        sent: getLastNotificationDispatch(lead.metadata).sent,
        status: getLastNotificationDispatch(lead.metadata).status,
        type: lead.type,
      })),
    }),
  )

  const signupLead = leads.find((lead) => lead.email === earlyAccessEmails[0])
  if (!signupLead) {
    throw new Error("Expected first early-access lead to exist.")
  }

  const earlySession = await findEarlyAccessSession(signupLead.id, startedAt)
  if (!earlySession) {
    throw new Error("Expected early-access onboarding session to be created.")
  }

  const sessionResponse = await fetchWithRetry(
    `${marketingBaseUrl}/api/early-access/session?token=${encodeURIComponent(
      earlySession.token,
    )}`,
  )
  const sessionPayload = (await sessionResponse.json().catch(() => null)) as {
    lead?: {
      email?: string
    }
  } | null

  if (!sessionResponse.ok || sessionPayload?.lead?.email !== signupLead.email) {
    throw new Error(
      `Early-access session verification failed: ${JSON.stringify(
        sessionPayload,
      )}`,
    )
  }

  checks.push(
    pass("early-access one-time session", {
      completed: earlySession.completed,
      expiresInDays: Math.ceil(
        (earlySession.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      ),
      tokenPrefix: earlySession.token.slice(0, 3),
    }),
  )

  const tenantSlug = `goal-dry-${runId.slice(0, 8)}`
  const signupResult = await postJson<SignupResponse>(
    `${marketingBaseUrl}/api/auth/signup`,
    {
      accessToken: earlySession.token,
      businessName: `Goal E2E Laundry ${runId}`,
      businessSize: "2_10",
      countryCode: "NG",
      customDomain: "",
      email: signupLead.email,
      firstName: "Goal",
      industry: "retail",
      lastName: "Owner",
      modes: ["MERCHANT", "STORE"],
      password: `Goal-${runId}-Pass1`,
      phone: "+234 801 000 0000",
      subdomain: tenantSlug,
    },
  )

  if (
    !signupResult.payload?.success ||
    signupResult.payload.emailDeliveryStatus !== "sent" ||
    !signupResult.payload.tenantSlug
  ) {
    throw new Error(
      `Signup did not complete with a sent welcome email: ${JSON.stringify(
        signupResult.payload,
      )}`,
    )
  }

  if (!signupResult.cookieHeader) {
    throw new Error("Signup did not return a session cookie.")
  }

  const consumedSession = await prisma.onboardingSession.findUnique({
    select: {
      completed: true,
      tenantId: true,
      userId: true,
    },
    where: {
      token: earlySession.token,
    },
  })

  if (!consumedSession?.completed) {
    throw new Error("Early-access token was not consumed by signup.")
  }

  checks.push(
    pass("early-access signup and token consumption", {
      emailDeliveryStatus: signupResult.payload.emailDeliveryStatus,
      tenantSlug: signupResult.payload.tenantSlug,
      tokenConsumed: consumedSession.completed,
    }),
  )

  const storeResult = await postJson<StoreResponse>(
    `${dashboardBaseUrl}/api/stores`,
    {
      currencyCode: "NGN",
      name: `Goal Laundry Front ${runId}`,
      onboarding: {
        businessTemplateKey: "dry_cleaning_laundry",
        countryCode: "NG",
        operatingModel: "In-store and pickup",
        salesMethod: "Counter service",
        serviceCategory: "Dry cleaning and laundry",
        teamSize: "2-10 people",
      },
      supportEmail: signupLead.email,
      supportPhone: "+234 802 000 0000",
    },
    {
      headers: {
        Cookie: signupResult.cookieHeader,
      },
    },
  )

  const storeId = storeResult.payload?.store?.id
  if (!storeResult.payload?.success || !storeId || !consumedSession.tenantId) {
    throw new Error(
      `Dry-cleaning store creation failed: ${JSON.stringify(
        storeResult.payload,
      )}`,
    )
  }

  const ownerUserId = consumedSession.userId
  if (!ownerUserId) {
    throw new Error("Consumed early-access session is missing owner user id.")
  }

  await updateDryCleaningStoreSettings(prisma, {
    expressSurchargePercent: 25,
    storeId,
    tenantId: consumedSession.tenantId,
  })

  const serviceDefinitions = [
    ["Shirt and trouser", 500_00, 400_00],
    ["Agbada", 700_00, 560_00],
    ["Jalabia", 400_00, 320_00],
    ["Iro and Buba", 600_00, 480_00],
  ] as const
  const services = []

  for (const [name, lgPrice, smPrice] of serviceDefinitions) {
    services.push(
      await createDryCleaningServiceItem(prisma, {
        category: "Laundry",
        estimatedTurnaroundHours: 48,
        name,
        priceMinor: lgPrice,
        storeId,
        tenantId: consumedSession.tenantId,
        variants: [
          { name: "SM", priceMinor: smPrice },
          { name: "LG", priceMinor: lgPrice },
        ],
      }),
    )
  }

  const [shirt, agbada, jalabia, iro] = services
  if (!shirt || !agbada || !jalabia || !iro) {
    throw new Error("Expected all dry-cleaning service definitions to exist.")
  }

  const orderInputs = [
    {
      customer: "Amina Yusuf",
      dueInDays: 0,
      line: shirt,
      paid: "paid" as const,
      quantity: 2,
    },
    {
      customer: "Bola Ahmed",
      dueInDays: 1,
      line: agbada,
      paid: "pay_on_collection" as const,
      quantity: 1,
    },
    {
      customer: "Chika Okafor",
      dueInDays: 2,
      line: jalabia,
      paid: "partial" as const,
      quantity: 3,
    },
    {
      customer: "Dayo Musa",
      dueInDays: 3,
      express: true,
      line: iro,
      paid: "pay_on_delivery" as const,
      quantity: 1,
    },
    {
      customer: "Esther Bello",
      dueInDays: 4,
      line: agbada,
      paid: "unpaid" as const,
      quantity: 2,
    },
    {
      customer: "Femi Lawal",
      dueInDays: 5,
      express: true,
      line: shirt,
      paid: "paid" as const,
      quantity: 4,
    },
  ]
  const orders = []

  for (const [index, orderInput] of orderInputs.entries()) {
    const unitPriceMinor = orderInput.express
      ? Math.round(orderInput.line.priceMinor * 1.25)
      : orderInput.line.priceMinor

    orders.push(
      await createDryCleaningServiceOrder(prisma, {
        actorUserId: ownerUserId,
        customer: {
          email: `${emailPrefix}-customer-${index + 1}@test.com`,
          name: orderInput.customer,
          phone: `+234 803 000 00${index + 1}`,
        },
        dueAt: addDays(orderInput.dueInDays),
        evidence: [
          {
            label: "Intake photo",
            url: `https://ewatrade.com/evidence/${runId}-${index + 1}.jpg`,
          },
        ],
        lines: [
          {
            note: orderInput.express ? "Express order" : "Standard order",
            quantity: orderInput.quantity,
            serviceItemId: orderInput.line.id,
            unitPriceMinor,
            variantId: orderInput.line.variants[1]?.id,
          },
        ],
        notes: orderInput.express
          ? "Customer requested express service."
          : "Standard intake.",
        paymentStatus: orderInput.paid,
        storeId,
        tenantId: consumedSession.tenantId,
      }),
    )
  }

  const requestLink = await createDryCleaningServiceRequestLink(prisma, {
    createdByUserId: ownerUserId,
    label: "Goal E2E public laundry request",
    storeId,
    tenantId: consumedSession.tenantId,
  })
  const publicRequest = await createDryCleaningPublicServiceRequest(prisma, {
    customer: {
      email: `${emailPrefix}-public-customer@test.com`,
      name: "Public Request Customer",
      phone: "+234 804 000 0000",
    },
    lines: [
      {
        quantity: 2,
        serviceItemId: shirt.id,
        variantId: shirt.variants[0]?.id,
      },
    ],
    notes: "Public request from E2E link.",
    token: requestLink.token,
  })
  const convertedRequest = await convertDryCleaningServiceRequestToOrder(
    prisma,
    {
      actorUserId: ownerUserId,
      paymentStatus: "pay_on_collection",
      requestId: publicRequest.id,
      storeId,
      tenantId: consumedSession.tenantId,
    },
  )
  const publicRequestUrl = `${publicBaseUrl}/service-request/${requestLink.token}`
  const publicRequestResponse = await fetchWithRetry(publicRequestUrl)
  const publicRequestHtml = await publicRequestResponse.text()

  if (
    !publicRequestResponse.ok ||
    !publicRequestHtml.includes("og:title") ||
    !publicRequestHtml.includes("Shirt and trouser")
  ) {
    throw new Error(
      `Public dry-cleaning request page failed metadata/content validation at ${publicRequestUrl}.`,
    )
  }

  checks.push(
    pass("dry-cleaning store, services, orders, and public request", {
      convertedOrderId: convertedRequest.order.id,
      orderCount: orders.length + 1,
      publicRequestStatus: publicRequestResponse.status,
      serviceCount: services.length,
      storeId,
    }),
  )

  const captureDirectory = await mkdtemp(
    join(tmpdir(), "ewatrade-goal-email-capture-"),
  )
  const captureFile = join(captureDirectory, "staff-invite.jsonl")
  const previousCaptureFile = process.env.EMAIL_CAPTURE_FILE

  try {
    process.env.EMAIL_CAPTURE_FILE = captureFile
    const invitedStaff = await inviteRetailOpsStaff(prisma, {
      actorUserId: ownerUserId,
      email: `${emailPrefix}-staff@test.com`,
      externalId: `goal-e2e-staff-${runId}`,
      name: "Goal Staff",
      role: "cashier",
      storeId,
      tenantId: consumedSession.tenantId,
    })

    if (!invitedStaff.invite.acceptanceToken) {
      throw new Error("Staff invite did not return an acceptance token.")
    }

    await notificationDispatchHandler(
      {
        payload: {
          appUrl: dashboardBaseUrl,
          businessName: `Goal E2E Laundry ${runId}`,
          inviteUrl: `${dashboardBaseUrl}/staff-onboarding?inviteToken=${invitedStaff.invite.acceptanceToken}`,
          invitedByName: "Goal Owner",
          inviteeEmail: invitedStaff.staff.email,
          inviteeName: invitedStaff.staff.displayName,
          membershipId: invitedStaff.invite.id,
          role: invitedStaff.invite.role,
        },
        type: "retail_ops_staff_invited",
      },
      1,
    )

    const resolvedInvite = await prisma.retailOpsStaffInviteToken.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        status: true,
      },
      where: {
        membershipId: invitedStaff.invite.id,
      },
    })
    const completedStaff = await completeRetailOpsStaffOnboarding(prisma, {
      displayName: "Goal Staff",
      tenantSlug: signupResult.payload.tenantSlug,
      userId: invitedStaff.staff.id,
    })
    const capturedStaffEmails = await readCapturedEmails(captureFile)

    if (
      !capturedStaffEmails.some(
        (message) =>
          message.to.toLowerCase() === REQUIRED_TEST_INBOX &&
          message.text.includes("Original recipient:") &&
          message.text.includes("Get started"),
      )
    ) {
      throw new Error("Staff invite email was not captured with test routing.")
    }

    checks.push(
      pass("staff invite email and onboarding", {
        capturedStaffInviteEmails: capturedStaffEmails.length,
        inviteStatusBeforeOnboarding: resolvedInvite?.status,
        staffMembershipStatus: completedStaff.status,
      }),
    )
  } finally {
    if (previousCaptureFile === undefined) {
      Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    } else {
      process.env.EMAIL_CAPTURE_FILE = previousCaptureFile
    }

    await rm(captureDirectory, { force: true, recursive: true })
  }

  const dashboardResponse = await fetchWithRetry(
    `${dashboardBaseUrl}/services`,
    {
      headers: {
        Cookie: signupResult.cookieHeader,
      },
    },
  )
  const dashboardHtml = await dashboardResponse.text()

  if (
    !dashboardResponse.ok ||
    !dashboardHtml.includes("Service orders") ||
    !dashboardHtml.includes(`Goal Laundry Front ${runId}`)
  ) {
    throw new Error("Dashboard dry-cleaning services page failed validation.")
  }

  checks.push(
    pass("dashboard dry-cleaning services page", {
      dashboardStatus: dashboardResponse.status,
      hasServiceOrders: dashboardHtml.includes("Service orders"),
    }),
  )

  console.log(
    JSON.stringify(
      {
        checks,
        generatedAt: new Date().toISOString(),
        runId,
        summary: {
          earlyAccessCount: EARLY_ACCESS_COUNT,
          ordersCreated: orders.length + 1,
          tenantSlug: signupResult.payload.tenantSlug,
          waitlistCount: WAITLIST_COUNT,
        },
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null)
  })
