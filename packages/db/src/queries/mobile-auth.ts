import { createHash, randomBytes, randomInt } from "node:crypto"
import { Prisma } from "../../generated/prisma/client"
import { createTenantStore } from "./stores"
import type { DbClient } from "./types"

export type MobileAuthMode = "login" | "sign_up"

export type MobileAuthTenantSummary = {
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
  businessName?: string | null
  email: string
  idToken?: string | null
  image?: string | null
  mode: MobileAuthMode
  name?: string | null
  providerAccountId: string
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

function resolveOtpCode(code: string | null | undefined) {
  const cleanedCode = cleanText(code)

  if (!cleanedCode) return createOtpCode()

  if (!/^\d{6}$/.test(cleanedCode)) {
    throw new Error("Development OTP codes must contain exactly 6 digits.")
  }

  return cleanedCode
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
  input: { businessName: string },
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
          currencyCode: "NGN",
          enabledModes: ["STORE", "MERCHANT"],
          name: input.businessName,
          slug,
          type: "MERCHANT",
        },
        select: {
          id: true,
          name: true,
          slug: true,
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
          stores: {
            where: { status: { not: "ARCHIVED" } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
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
    businessName: string
    userId: string
  },
): Promise<MobileAuthTenantSummary> {
  const existing = await getFirstActiveTenantForUser(db, {
    userId: input.userId,
  })

  if (existing) return existing

  const tenant = await createUniqueTenant(db, {
    businessName: input.businessName,
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
    createdByUserId: input.userId,
    name: input.businessName,
    onboarding: {
      source: "mobile_owner_signup",
    },
    tenantId: tenant.id,
  })

  return {
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
    businessName?: string | null
    code?: string | null
    email: string
    mode: MobileAuthMode
    name?: string | null
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

  const code = resolveOtpCode(input.code)
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
        businessName: cleanText(input.businessName),
        codeHash: hashOtp(code),
        mode: input.mode,
        name: cleanText(input.name),
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
    businessName?: string | null
    code: string
    email: string
    mode: MobileAuthMode
    name?: string | null
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
    businessName?: string | null
    codeHash?: string
    name?: string | null
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
    },
    update: {
      displayName,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      name: displayName,
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
          businessName,
          userId: user.id,
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
          businessName,
          userId: user.id,
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
