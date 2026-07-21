import { createHash, randomBytes, randomInt } from "node:crypto"
import {
  type BusinessOperatingModel,
  type OperatingCurrencyCode,
  normalizeOperatingCurrencyCode,
} from "@ewatrade/utils"
import { Prisma } from "../../generated/prisma/client"
import { createTenantStore } from "./stores"
import type { DbClient } from "./types"

export type MobileAuthMode = "login" | "sign_up"

export type MobileAuthTenantSummary = {
  currencyCode: string
  id: string
  name: string
  role: string
  slug: string
  status: string
  storeId: string | null
  storeName: string | null
}

export type MobileAuthSessionResult = {
  expiresAt: Date
  profile: {
    businessId: string | null
    businessName: string | null
    currencyCode: string
    email: string
    id: string
    name: string
    role: string
    status: string
  }
  tenant: MobileAuthTenantSummary | null
  token: string
}

export type MobileOwnerOtpResult = {
  code: string
  email: string
  expiresAt: Date
}

export type MobileGoogleIdentityInput = {
  addressLine1?: string | null
  businessProfileKey?: string | null
  businessProfileVersion?: 1 | null
  businessName?: string | null
  city?: string | null
  currencyCode?: OperatingCurrencyCode | null
  email: string
  idToken?: string | null
  image?: string | null
  mode: MobileAuthMode
  name?: string | null
  operatingModel?: BusinessOperatingModel | null
  orderChannels?: string[] | null
  otherBusinessDescription?: string | null
  phone?: string | null
  providerAccountId: string
  teamSize?: string | null
}

const OTP_TTL_MINUTES = 10
const SESSION_TTL_DAYS = 90

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim()
  return text ? text : null
}

function getEmailDisplayName(email: string) {
  return email.split("@")[0] || email
}

function buildOtpIdentifier(input: { email: string; mode: MobileAuthMode }) {
  return `mobile-owner-auth:${input.mode}:${normalizeEmail(input.email)}`
}

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

function createOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

function createSessionToken() {
  return randomBytes(32).toString("hex")
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date)
  next.setMinutes(next.getMinutes() + minutes)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

async function createUniqueTenant(
  db: DbClient,
  input: {
    businessName: string
    currencyCode: OperatingCurrencyCode
  },
) {
  const baseSlug = toSlug(input.businessName) || "business"

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const existing = await db.tenant.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (existing) continue

    try {
      return await db.tenant.create({
        data: {
          currencyCode: input.currencyCode,
          enabledModes: ["STORE", "MERCHANT"],
          name: input.businessName,
          slug,
          type: "MERCHANT",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          currencyCode: true,
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue
      }

      throw error
    }
  }

  throw new Error("Unable to generate a unique business slug.")
}

async function getFirstActiveTenantForUser(
  db: DbClient,
  input: { userId: string },
): Promise<MobileAuthTenantSummary | null> {
  const membership = await db.membership.findFirst({
    where: {
      OR: [
        { status: "ACTIVE" },
        {
          role: {
            in: ["CASHIER", "MANAGER", "OPERATOR"],
          },
          status: "INVITED",
        },
      ],
      userId: input.userId,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      role: true,
      status: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          currencyCode: true,
          stores: {
            where: { status: { not: "ARCHIVED" } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              currencyCode: true,
            },
          },
        },
      },
    },
  })

  if (!membership) return null

  const activeStore =
    membership.tenant.stores.find((store) => store.status === "ACTIVE") ??
    membership.tenant.stores[0] ??
    null

  return {
    currencyCode:
      activeStore?.currencyCode ??
      normalizeOperatingCurrencyCode(membership.tenant.currencyCode),
    id: membership.tenant.id,
    name: membership.tenant.name,
    role: membership.role,
    slug: membership.tenant.slug,
    status: membership.status,
    storeId: activeStore?.id ?? null,
    storeName: activeStore?.name ?? null,
  }
}

async function ensureOwnerTenant(
  db: DbClient,
  input: {
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName: string
    city?: string | null
    currencyCode: OperatingCurrencyCode
    operatingModel?: BusinessOperatingModel | null
    orderChannels?: string[] | null
    otherBusinessDescription?: string | null
    userId: string
    phone?: string | null
    teamSize?: string | null
  },
): Promise<MobileAuthTenantSummary> {
  const existing = await getFirstActiveTenantForUser(db, {
    userId: input.userId,
  })

  if (existing) return existing

  const tenant = await createUniqueTenant(db, {
    businessName: input.businessName,
    currencyCode: input.currencyCode,
  })

  await db.membership.create({
    data: {
      acceptedAt: new Date(),
      role: "OWNER",
      status: "ACTIVE",
      tenantId: tenant.id,
      userId: input.userId,
    },
  })

  const store = await createTenantStore(db, {
    addressLine1: input.addressLine1,
    city: input.city,
    createdByUserId: input.userId,
    currencyCode: tenant.currencyCode,
    name: input.businessName,
    onboarding: {
      businessProfileKey: input.businessProfileKey,
      businessProfileVersion: input.businessProfileVersion,
      operatingModel: input.operatingModel,
      orderChannels: input.orderChannels,
      otherBusinessDescription: input.otherBusinessDescription,
      source: "mobile_owner_signup",
      teamSize: input.teamSize,
    },
    tenantId: tenant.id,
    supportPhone: input.phone,
  })

  return {
    currencyCode: store.currencyCode,
    id: tenant.id,
    name: tenant.name,
    role: "OWNER",
    slug: tenant.slug,
    status: "ACTIVE",
    storeId: store.id,
    storeName: store.name,
  }
}

async function createMobileSession(
  db: DbClient,
  input: { tenant: MobileAuthTenantSummary | null; userId: string },
): Promise<Pick<MobileAuthSessionResult, "expiresAt" | "token">> {
  const now = new Date()
  const expiresAt = addDays(now, SESSION_TTL_DAYS)
  const session = await db.session.create({
    data: {
      expiresAt,
      token: createSessionToken(),
      userId: input.userId,
    },
    select: {
      expiresAt: true,
      token: true,
    },
  })

  return session
}

export async function createMobileOwnerOtp(
  db: DbClient,
  input: {
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    city?: string | null
    currencyCode?: OperatingCurrencyCode | null
    email: string
    mode: MobileAuthMode
    name?: string | null
    operatingModel?: BusinessOperatingModel | null
    orderChannels?: string[] | null
    otherBusinessDescription?: string | null
    phone?: string | null
    teamSize?: string | null
  },
): Promise<MobileOwnerOtpResult> {
  const email = normalizeEmail(input.email)
  if (input.mode === "login") {
    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (!existingUser) {
      throw new Error("No owner account exists for this email yet.")
    }

    const tenant = await getFirstActiveTenantForUser(db, {
      userId: existingUser.id,
    })

    if (!tenant) {
      throw new Error("No active business is available for this account.")
    }
  }

  const code = createOtpCode()
  const now = new Date()
  const expiresAt = addMinutes(now, OTP_TTL_MINUTES)
  const identifier = buildOtpIdentifier({ email, mode: input.mode })

  await db.verification.deleteMany({
    where: { identifier },
  })

  await db.verification.create({
    data: {
      expiresAt,
      identifier,
      value: JSON.stringify({
        addressLine1: cleanText(input.addressLine1),
        businessProfileKey: cleanText(input.businessProfileKey),
        businessProfileVersion: input.businessProfileVersion === 1 ? 1 : null,
        businessName: cleanText(input.businessName),
        city: cleanText(input.city),
        codeHash: hashOtp(code),
        currencyCode:
          input.mode === "sign_up"
            ? normalizeOperatingCurrencyCode(input.currencyCode)
            : null,
        mode: input.mode,
        name: cleanText(input.name),
        operatingModel: cleanText(input.operatingModel),
        orderChannels: input.orderChannels ?? [],
        otherBusinessDescription: cleanText(input.otherBusinessDescription),
        phone: cleanText(input.phone),
        teamSize: cleanText(input.teamSize),
      }),
    },
  })

  return {
    code,
    email,
    expiresAt,
  }
}

export async function verifyMobileOwnerOtp(
  db: DbClient,
  input: {
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    city?: string | null
    code: string
    currencyCode?: OperatingCurrencyCode | null
    email: string
    mode: MobileAuthMode
    name?: string | null
    operatingModel?: BusinessOperatingModel | null
    orderChannels?: string[] | null
    otherBusinessDescription?: string | null
    phone?: string | null
    teamSize?: string | null
  },
): Promise<MobileAuthSessionResult> {
  const email = normalizeEmail(input.email)
  const identifier = buildOtpIdentifier({ email, mode: input.mode })
  const verification = await db.verification.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      identifier,
    },
    orderBy: { createdAt: "desc" },
  })

  if (!verification) {
    throw new Error("The verification code has expired. Request a new code.")
  }

  let payload: {
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    city?: string | null
    codeHash?: string
    currencyCode?: OperatingCurrencyCode | null
    name?: string | null
    operatingModel?: BusinessOperatingModel | null
    orderChannels?: string[] | null
    otherBusinessDescription?: string | null
    phone?: string | null
    teamSize?: string | null
  }

  try {
    payload = JSON.parse(verification.value)
  } catch {
    throw new Error("The verification code could not be read.")
  }

  if (!payload.codeHash || payload.codeHash !== hashOtp(input.code)) {
    throw new Error("The verification code is incorrect.")
  }

  await db.verification.deleteMany({
    where: { identifier },
  })

  const displayName =
    cleanText(input.name) ??
    cleanText(payload.name) ??
    getEmailDisplayName(email)
  const businessName =
    cleanText(input.businessName) ??
    cleanText(payload.businessName) ??
    "My Business"
  const addressLine1 = cleanText(input.addressLine1) ?? cleanText(payload.addressLine1)
  const businessProfileKey =
    cleanText(input.businessProfileKey) ?? cleanText(payload.businessProfileKey)
  const businessProfileVersion =
    input.businessProfileVersion === 1 || payload.businessProfileVersion === 1
      ? 1
      : null
  const city = cleanText(input.city) ?? cleanText(payload.city)
  const operatingModel =
    input.operatingModel ?? payload.operatingModel ?? null
  const orderChannels = input.orderChannels ?? payload.orderChannels ?? []
  const otherBusinessDescription =
    cleanText(input.otherBusinessDescription) ??
    cleanText(payload.otherBusinessDescription)
  const phone = cleanText(input.phone) ?? cleanText(payload.phone)
  const teamSize = cleanText(input.teamSize) ?? cleanText(payload.teamSize)
  const currencyCode = normalizeOperatingCurrencyCode(
    input.currencyCode ?? payload.currencyCode,
  )

  const existingUser = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
    },
  })

  if (input.mode === "login" && !existingUser) {
    throw new Error("No owner account exists for this email yet.")
  }

  const user = await db.user.upsert({
    create: {
      displayName,
      email,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      name: displayName,
      phone,
    },
    update: {
      displayName,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      name: displayName,
      phone: phone ?? undefined,
    },
    where: { email },
    select: {
      email: true,
      id: true,
      name: true,
    },
  })

  const tenant =
    input.mode === "sign_up"
      ? await ensureOwnerTenant(db, {
          addressLine1,
          businessProfileKey,
          businessProfileVersion,
          businessName,
          city,
          currencyCode,
          operatingModel,
          orderChannels,
          otherBusinessDescription,
          userId: user.id,
          phone,
          teamSize,
        })
      : await getFirstActiveTenantForUser(db, { userId: user.id })

  if (!tenant) {
    throw new Error("No active business is available for this account.")
  }

  const session = await createMobileSession(db, {
    tenant,
    userId: user.id,
  })

  return {
    expiresAt: session.expiresAt,
    profile: {
      businessId: tenant.id,
      businessName: tenant.name,
      currencyCode: tenant.currencyCode,
      email: user.email,
      id: user.id,
      name: user.name || displayName,
      role: tenant.role,
      status: tenant.status,
    },
    tenant,
    token: session.token,
  }
}

export async function verifyMobileGoogleIdentity(
  db: DbClient,
  input: MobileGoogleIdentityInput,
): Promise<MobileAuthSessionResult> {
  const email = normalizeEmail(input.email)
  const providerId = "google"
  const providerAccountId = input.providerAccountId.trim()

  if (!providerAccountId) {
    throw new Error("Google did not return an account id.")
  }

  const linkedAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: providerId,
        providerAccountId,
      },
    },
    select: {
      userId: true,
    },
  })
  const existingUser = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
    },
  })

  if (input.mode === "login" && !linkedAccount && !existingUser) {
    throw new Error("No owner account exists for this Google account yet.")
  }

  const displayName =
    cleanText(input.name) ??
    cleanText(existingUser?.name) ??
    getEmailDisplayName(email)
  const businessName = cleanText(input.businessName) ?? "My Business"
  const now = new Date()
  const userId = linkedAccount?.userId ?? existingUser?.id

  const user = userId
    ? await db.user.update({
        data: {
          avatarUrl: cleanText(input.image) ?? undefined,
          displayName,
          emailVerified: true,
          emailVerifiedAt: now,
          image: cleanText(input.image) ?? undefined,
          name: displayName,
        },
        where: { id: userId },
        select: {
          email: true,
          id: true,
          name: true,
        },
      })
    : await db.user.create({
        data: {
          avatarUrl: cleanText(input.image),
          displayName,
          email,
          emailVerified: true,
          emailVerifiedAt: now,
          image: cleanText(input.image),
          name: displayName,
        },
        select: {
          email: true,
          id: true,
          name: true,
        },
      })

  await db.account.upsert({
    create: {
      accountId: providerAccountId,
      idToken: cleanText(input.idToken),
      provider: providerId,
      providerAccountId,
      providerId,
      userId: user.id,
    },
    update: {
      idToken: cleanText(input.idToken) ?? undefined,
      userId: user.id,
    },
    where: {
      provider_providerAccountId: {
        provider: providerId,
        providerAccountId,
      },
    },
  })

  const tenant =
    input.mode === "sign_up"
      ? await ensureOwnerTenant(db, {
          addressLine1: input.addressLine1,
          businessProfileKey: input.businessProfileKey,
          businessProfileVersion: input.businessProfileVersion,
          businessName,
          city: input.city,
          currencyCode: normalizeOperatingCurrencyCode(input.currencyCode),
          operatingModel: input.operatingModel,
          orderChannels: input.orderChannels,
          otherBusinessDescription: input.otherBusinessDescription,
          userId: user.id,
          phone: input.phone,
          teamSize: input.teamSize,
        })
      : await getFirstActiveTenantForUser(db, { userId: user.id })

  if (!tenant) {
    throw new Error("No active business is available for this account.")
  }

  const session = await createMobileSession(db, {
    tenant,
    userId: user.id,
  })

  return {
    expiresAt: session.expiresAt,
    profile: {
      businessId: tenant.id,
      businessName: tenant.name,
      currencyCode: tenant.currencyCode,
      email: user.email,
      id: user.id,
      name: user.name || displayName,
      role: tenant.role,
      status: tenant.status,
    },
    tenant,
    token: session.token,
  }
}
