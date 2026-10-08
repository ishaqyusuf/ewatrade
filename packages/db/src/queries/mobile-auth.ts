import { createHash, createHmac, randomBytes, randomInt } from "node:crypto"
import {
  type BusinessOperatingModel,
  type OperatingCurrencyCode,
  normalizeOperatingCurrencyCode,
} from "@ewatrade/utils"
import {
  currentEffectiveLegalPublication,
  resolveLegalSignupChoice,
} from "@ewatrade/utils/legal-approval"
import { AccountAgeBand, MembershipRole } from "../../generated/prisma/enums"
import { recordLegalAcceptance } from "./account-privacy"
import { isAccountPrivacyAccessBlocked } from "./account-privacy-access"
import { isLegalSignupSessionBlocked } from "./legal-session-access"
import {
  type MobileAuthMode,
  buildMobileOtpIdentifier,
} from "./mobile-otp-identifier"
import {
  OnboardingContinuationError,
  consumeApprovedOnboarding,
  readApprovedOnboarding,
} from "./onboarding-continuation"
import {
  type OwnerBusinessSummary,
  createOwnerSignupBusiness,
} from "./owner-businesses"
import { getCustomerAccountAgeStatus } from "./store-conversation-age-authority"
import type { DbClient } from "./types"

export type { MobileAuthMode } from "./mobile-otp-identifier"

export class MobileAccountNotFoundError extends Error {
  constructor() {
    super("No account was found. Create an account first.")
    this.name = "MobileAccountNotFoundError"
  }
}

export type MobileAuthTenantSummary = OwnerBusinessSummary & {
  staffAccessMode?: "LEGACY" | "SCOPED"
  catalogEditor?: boolean
}

export type MobileAccessProfile = {
  hasBusinessAccess: boolean
  hasCustomerHistory: boolean
}

export type MobileAuthSessionResult = {
  accessProfile: MobileAccessProfile
  expiresAt: Date
  profile: {
    businessId: string | null
    businessName: string | null
    currencyCode: string
    email: string
    id: string
    name: string
    role: string
    staffAccessMode?: "LEGACY" | "SCOPED"
    catalogEditor?: boolean
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
  accessToken?: string
  ageBand?: AccountAgeBand
  acceptedTerms?: true
  acknowledgedPrivacyNotice?: true
  addressLine1?: string | null
  businessProfileKey?: string | null
  businessProfileVersion?: 1 | null
  businessName?: string | null
  city?: string | null
  countryCode?: string | null
  region?: string | null
  currencyCode?: OperatingCurrencyCode | null
  email: string
  idToken?: string | null
  image?: string | null
  legalVersion?: string
  mode: MobileAuthMode
  name?: string | null
  operatingModel?: BusinessOperatingModel | null
  orderChannels?: string[] | null
  otherBusinessDescription?: string | null
  phone?: string | null
  providerAccountId: string
  teamSize?: string | null
}

async function requireMobileApprovedSignup(
  db: DbClient,
  input: {
    mode: MobileAuthMode
    accessToken?: string
    email: string
    businessName?: string | null
  },
) {
  // Business sign-up is open; early-access approval is no longer required.
  // A setup-email token, when present, must still match its approval.
  if (input.mode !== "sign_up" || !input.accessToken) return
  const { data } = await readApprovedOnboarding(db, input.accessToken)
  if (
    data.email.toLowerCase() !== input.email.trim().toLowerCase() ||
    data.companyName?.trim().toLowerCase() !==
      input.businessName?.trim().toLowerCase()
  )
    throw new OnboardingContinuationError("IDENTITY")
  if (!data.emailVerifiedAt) throw new OnboardingContinuationError("UNVERIFIED")
  return data
}

/** An ISO 3166-1 alpha-2 code such as NG, or null. */
function normalizeCountryCode(value?: string | null) {
  const code = value?.trim().toUpperCase()
  return code && /^[A-Z]{2}$/.test(code) ? code : null
}

const OTP_TTL_MINUTES = 10
const SESSION_TTL_DAYS = 90

function requireMobileSignupAgeBand(
  mode: MobileAuthMode,
  band: AccountAgeBand | null | undefined,
) {
  if (mode !== "sign_up") return null
  if (
    band === AccountAgeBand.AGE_13_TO_15 ||
    band === AccountAgeBand.AGE_16_TO_17 ||
    band === AccountAgeBand.ADULT
  )
    return band
  throw new Error("Choose an eligible age range before creating an account.")
}

async function ensureMobileSignupAgeBand(
  db: DbClient,
  userId: string,
  band: AccountAgeBand | null,
) {
  if (!band) return
  await db.user.updateMany({
    data: { ageBand: band, ageDeclaredAt: new Date() },
    where: { id: userId, ageBand: AccountAgeBand.UNDECLARED },
  })
  const user = await db.user.findUnique({
    select: { ageBand: true },
    where: { id: userId },
  })
  if (user?.ageBand !== band)
    throw new Error("This account's age range is already set.")
}

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

function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex")
}

export function shouldUseFixedMobileOwnerOtp(env: {
  APP_ENV?: string
  NODE_ENV?: string
}) {
  return env.APP_ENV !== "production" && env.NODE_ENV !== "production"
}

function createOtpCode() {
  if (shouldUseFixedMobileOwnerOtp(process.env)) {
    return "123456"
  }

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

async function getFirstActiveTenantForUser(
  db: DbClient,
  input: { userId: string },
  options: { includeInvited?: boolean } = {},
): Promise<MobileAuthTenantSummary | null> {
  const membershipAccess =
    options.includeInvited === false
      ? { status: "ACTIVE" as const }
      : {
          OR: [
            { status: "ACTIVE" as const },
            {
              role: {
                in: [
                  MembershipRole.CASHIER,
                  MembershipRole.MANAGER,
                  MembershipRole.OPERATOR,
                ],
              },
              status: "INVITED" as const,
            },
          ],
        }

  const membership = await db.membership.findFirst({
    where: {
      ...membershipAccess,
      userId: input.userId,
      tenant: { isActive: true },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      role: true,
      status: true,
      staffAccessMode: true,
      catalogEditor: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: { status: "ACTIVE", store: { status: "ACTIVE" } },
        select: { storeId: true, role: true },
      },
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

  const stores = membership.tenant.stores.filter(
    (store) =>
      membership.staffAccessMode !== "SCOPED" ||
      ["OWNER", "ADMIN"].includes(membership.role) ||
      membership.staffStoreAssignments.some((row) => row.storeId === store.id),
  )
  const activeStore =
    stores.find(
      (store) =>
        store.id === membership.retailOpsStaffProfile?.defaultStoreId &&
        store.status === "ACTIVE",
    ) ??
    stores.find((store) => store.status === "ACTIVE") ??
    stores[0] ??
    null

  return {
    currencyCode:
      activeStore?.currencyCode ??
      normalizeOperatingCurrencyCode(membership.tenant.currencyCode),
    id: membership.tenant.id,
    name: membership.tenant.name,
    role:
      membership.staffAccessMode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(membership.role)
        ? (membership.staffStoreAssignments.find(
            (row) => row.storeId === activeStore?.id,
          )?.role ?? membership.role)
        : membership.role,
    staffAccessMode: membership.staffAccessMode,
    catalogEditor:
      membership.catalogEditor &&
      membership.staffStoreAssignments.some((row) => row.role === "MANAGER"),
    slug: membership.tenant.slug,
    status: membership.status,
    storeId: activeStore?.id ?? null,
    storeName: activeStore?.name ?? null,
  }
}

export async function getMobileAccessProfile(
  db: DbClient,
  input: { userId: string },
): Promise<MobileAccessProfile> {
  const [tenant, linkedConversation] = await Promise.all([
    getFirstActiveTenantForUser(db, input, { includeInvited: false }),
    db.storeConversationAccountAccess.findFirst({
      where: {
        accountUserId: input.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ])

  return {
    hasBusinessAccess: Boolean(
      tenant &&
        (tenant.staffAccessMode !== "SCOPED" ||
          ["OWNER", "ADMIN"].includes(tenant.role) ||
          tenant.storeId),
    ),
    hasCustomerHistory: Boolean(linkedConversation),
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
    countryCode?: string | null
    region?: string | null
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

  return createOwnerSignupBusiness(db, input)
}

async function createMobileSession(
  db: DbClient,
  input: { tenant: MobileAuthTenantSummary | null; userId: string },
): Promise<Pick<MobileAuthSessionResult, "expiresAt" | "token">> {
  if (await isAccountPrivacyAccessBlocked(db, input.userId))
    throw new Error("This account is being closed.")
  if (await isLegalSignupSessionBlocked(db, input.userId))
    throw new Error("Account setup is incomplete. Contact support.")
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

/** Issues the ordinary mobile session after an independent credential check. */
export async function createMobileSessionForVerifiedUser(
  db: DbClient,
  userId: string,
): Promise<MobileAuthSessionResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, name: true },
  })
  if (!user?.emailVerified) throw new Error("A verified account is required.")
  const age = await getCustomerAccountAgeStatus(db, user.id)
  const tenant = age.eligible
    ? await getFirstActiveTenantForUser(db, { userId: user.id })
    : null
  const accessProfile = age.eligible
    ? await getMobileAccessProfile(db, { userId: user.id })
    : { hasBusinessAccess: false, hasCustomerHistory: false }
  const session = await createMobileSession(db, { tenant, userId: user.id })
  return {
    accessProfile,
    expiresAt: session.expiresAt,
    profile: {
      businessId: tenant?.id ?? null,
      businessName: tenant?.name ?? null,
      currencyCode: tenant?.currencyCode ?? "NGN",
      email: user.email,
      id: user.id,
      name: user.name,
      role: tenant?.role ?? "NONE",
      staffAccessMode: tenant?.staffAccessMode,
      catalogEditor: tenant?.catalogEditor,
      status: tenant?.status ?? "NONE",
    },
    tenant,
    token: session.token,
  }
}

/** Durable per-address throttle for the server-side Better Auth password call. */
export async function consumeMobilePasswordAttempt(
  db: DbClient,
  email: string,
  now = new Date(),
): Promise<boolean> {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) throw new Error("Authentication secret is required")
  const bucketDigest = createHmac("sha256", secret)
    .update(`mobile-password:${email.trim().toLowerCase()}`)
    .digest("hex")
  const windowMs = 15 * 60_000
  const maximum = 8
  return db.$transaction(
    async (tx) => {
      const bucket = await tx.accountPrivacyRateBucket.findUnique({
        where: { bucketDigest },
      })
      const inWindow = Boolean(
        bucket && now.getTime() - bucket.windowStartedAt.getTime() < windowMs,
      )
      if (inWindow && bucket && bucket.sentCount >= maximum) return false
      await tx.accountPrivacyRateBucket.upsert({
        where: { bucketDigest },
        create: { bucketDigest, sentCount: 1, windowStartedAt: now },
        update: {
          sentCount: inWindow ? { increment: 1 } : 1,
          windowStartedAt: inWindow ? undefined : now,
        },
      })
      return true
    },
    { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
  )
}

export async function createMobileOwnerOtp(
  db: DbClient,
  input: {
    accessToken?: string
    ageBand?: AccountAgeBand
    acceptedTerms?: true
    acknowledgedPrivacyNotice?: true
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    city?: string | null
    countryCode?: string | null
    region?: string | null
    currencyCode?: OperatingCurrencyCode | null
    email: string
    legalVersion?: string
    mode: MobileAuthMode
    name?: string | null
    operatingModel?: BusinessOperatingModel | null
    orderChannels?: string[] | null
    otherBusinessDescription?: string | null
    phone?: string | null
    teamSize?: string | null
  },
): Promise<MobileOwnerOtpResult> {
  const ageBand = requireMobileSignupAgeBand(input.mode, input.ageBand)
  const legalPublication =
    input.mode === "sign_up"
      ? resolveLegalSignupChoice(input, currentEffectiveLegalPublication())
      : null
  await requireMobileApprovedSignup(db, input)
  const email = normalizeEmail(input.email)
  const code = createOtpCode()
  const now = new Date()
  const expiresAt = addMinutes(now, OTP_TTL_MINUTES)
  const identifier = buildMobileOtpIdentifier({ email, mode: input.mode })

  await db.verification.deleteMany({
    where: { identifier },
  })

  await db.verification.create({
    data: {
      expiresAt,
      identifier,
      value: JSON.stringify({
        accessToken: input.accessToken,
        ageBand,
        addressLine1: cleanText(input.addressLine1),
        businessProfileKey: cleanText(input.businessProfileKey),
        businessProfileVersion: input.businessProfileVersion === 1 ? 1 : null,
        businessName: cleanText(input.businessName),
        city: cleanText(input.city),
        codeHash: hashOtp(code),
        countryCode: normalizeCountryCode(input.countryCode),
        region: cleanText(input.region),
        legalVersion: legalPublication?.version ?? null,
        legalDocumentHash: legalPublication?.documentHash ?? null,
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
    accessToken?: string
    ageBand?: AccountAgeBand
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    city?: string | null
    code: string
    countryCode?: string | null
    region?: string | null
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
  const identifier = buildMobileOtpIdentifier({ email, mode: input.mode })
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
    accessToken?: string
    ageBand?: AccountAgeBand | null
    addressLine1?: string | null
    businessProfileKey?: string | null
    businessProfileVersion?: 1 | null
    businessName?: string | null
    legalVersion?: string | null
    legalDocumentHash?: string | null
    city?: string | null
    codeHash?: string
    countryCode?: string | null
    region?: string | null
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

  if (input.accessToken !== payload.accessToken)
    throw new OnboardingContinuationError("CONFLICT")
  const approvedOnboarding = await requireMobileApprovedSignup(db, {
    ...input,
    businessName: payload.businessName,
  })
  const signupAgeBand = requireMobileSignupAgeBand(input.mode, payload.ageBand)
  if (signupAgeBand && input.ageBand !== signupAgeBand)
    throw new Error("The age choice changed. Restart account creation.")

  const legalPublication =
    input.mode === "sign_up"
      ? resolveLegalSignupChoice(
          payload.legalVersion
            ? {
                legalVersion: payload.legalVersion,
                acceptedTerms: true,
                acknowledgedPrivacyNotice: true,
              }
            : {},
          currentEffectiveLegalPublication(),
        )
      : null
  if (
    (legalPublication?.documentHash ?? null) !==
    (payload.legalDocumentHash ?? null)
  )
    throw new Error(
      "The legal documents changed. Restart signup and review them.",
    )

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
  const addressLine1 =
    cleanText(input.addressLine1) ?? cleanText(payload.addressLine1)
  const businessProfileKey =
    cleanText(input.businessProfileKey) ?? cleanText(payload.businessProfileKey)
  const businessProfileVersion =
    input.businessProfileVersion === 1 || payload.businessProfileVersion === 1
      ? 1
      : null
  const city = cleanText(input.city) ?? cleanText(payload.city)
  const operatingModel = input.operatingModel ?? payload.operatingModel ?? null
  const orderChannels = input.orderChannels ?? payload.orderChannels ?? []
  const otherBusinessDescription =
    cleanText(input.otherBusinessDescription) ??
    cleanText(payload.otherBusinessDescription)
  const phone = cleanText(input.phone) ?? cleanText(payload.phone)
  const teamSize = cleanText(input.teamSize) ?? cleanText(payload.teamSize)
  const currencyCode = normalizeOperatingCurrencyCode(
    input.currencyCode ?? payload.currencyCode,
  )
  const countryCode =
    normalizeCountryCode(input.countryCode) ??
    normalizeCountryCode(payload.countryCode)
  const region = cleanText(input.region) ?? cleanText(payload.region)

  const existingUser = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      ageBand: true,
    },
  })

  if (
    signupAgeBand &&
    existingUser?.ageBand !== AccountAgeBand.UNDECLARED &&
    existingUser?.ageBand !== undefined &&
    existingUser.ageBand !== signupAgeBand
  )
    throw new Error("This account's age range is already set.")

  if (input.mode === "login" && !existingUser) {
    throw new MobileAccountNotFoundError()
  }

  const user =
    input.mode === "login" && existingUser
      ? await db.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerified: true,
            emailVerifiedAt: new Date(),
          },
          select: { email: true, id: true, name: true },
        })
      : await db.user.upsert({
          create: {
            ageBand: signupAgeBand ?? undefined,
            ageDeclaredAt: signupAgeBand ? new Date() : undefined,
            displayName,
            email,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            name: displayName,
          },
          update: {
            ageBand:
              existingUser?.ageBand === AccountAgeBand.UNDECLARED
                ? (signupAgeBand ?? undefined)
                : undefined,
            ageDeclaredAt:
              signupAgeBand &&
              existingUser?.ageBand === AccountAgeBand.UNDECLARED
                ? new Date()
                : undefined,
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

  await ensureMobileSignupAgeBand(db, user.id, signupAgeBand)

  const age = await getCustomerAccountAgeStatus(db, user.id)

  const tenant = !age.eligible
    ? null
    : input.mode === "sign_up"
      ? await ensureOwnerTenant(db, {
          addressLine1,
          businessProfileKey,
          businessProfileVersion,
          businessName,
          city,
          countryCode: countryCode ?? approvedOnboarding?.draft?.countryCode,
          region: region ?? approvedOnboarding?.draft?.region,
          currencyCode,
          operatingModel,
          orderChannels,
          otherBusinessDescription,
          userId: user.id,
          phone,
          teamSize,
        })
      : await getFirstActiveTenantForUser(db, { userId: user.id })

  if (legalPublication) {
    const acceptance = await recordLegalAcceptance(db, {
      userId: user.id,
      version: legalPublication.version,
      surface: "mobile",
    })
    if (acceptance.documentHash !== legalPublication.documentHash)
      throw new Error("The legal documents changed. Restart signup.")
  }

  const accessProfile = age.eligible
    ? await getMobileAccessProfile(db, { userId: user.id })
    : { hasBusinessAccess: false, hasCustomerHistory: false }

  if (input.mode === "sign_up" && input.accessToken) {
    if (!tenant)
      throw new Error("Your account is not eligible for workspace setup.")
    await consumeApprovedOnboarding(db, {
      token: input.accessToken,
      email,
      businessName: tenant.name,
    })
  }

  const session = await createMobileSession(db, {
    tenant,
    userId: user.id,
  })

  return {
    accessProfile,
    expiresAt: session.expiresAt,
    profile: {
      businessId: tenant?.id ?? null,
      businessName: tenant?.name ?? null,
      currencyCode: tenant?.currencyCode ?? "NGN",
      email: user.email,
      id: user.id,
      name: user.name || displayName,
      role: tenant?.role ?? "NONE",
      staffAccessMode: tenant?.staffAccessMode,
      catalogEditor: tenant?.catalogEditor,
      status: tenant?.status ?? "NONE",
    },
    tenant,
    token: session.token,
  }
}

export async function verifyMobileGoogleIdentity(
  db: DbClient,
  input: MobileGoogleIdentityInput,
) {
  return verifyMobileSocialIdentity(db, { ...input, provider: "google" })
}

export async function verifyMobileSocialIdentity(
  db: DbClient,
  input: MobileGoogleIdentityInput & { provider: "google" | "apple" },
): Promise<MobileAuthSessionResult> {
  const signupAgeBand = requireMobileSignupAgeBand(input.mode, input.ageBand)
  const legalPublication =
    input.mode === "sign_up"
      ? resolveLegalSignupChoice(input, currentEffectiveLegalPublication())
      : null
  const approvedOnboarding = await requireMobileApprovedSignup(db, input)
  const email = normalizeEmail(input.email)
  const providerId = input.provider
  const providerAccountId = input.providerAccountId.trim()

  if (!providerAccountId) {
    throw new Error("The sign-in provider did not return an account id.")
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
    where: linkedAccount ? { id: linkedAccount.userId } : { email },
    select: {
      ageBand: true,
      id: true,
      name: true,
      email: true,
    },
  })

  const displayName =
    (linkedAccount
      ? (cleanText(existingUser?.name) ?? cleanText(input.name))
      : (cleanText(input.name) ?? cleanText(existingUser?.name))) ??
    getEmailDisplayName(existingUser?.email ?? email)
  const businessName = cleanText(input.businessName) ?? "My Business"
  const now = new Date()
  const userId = linkedAccount?.userId ?? existingUser?.id
  if (
    signupAgeBand &&
    existingUser?.ageBand !== AccountAgeBand.UNDECLARED &&
    existingUser?.ageBand !== undefined &&
    existingUser.ageBand !== signupAgeBand
  )
    throw new Error("This account's age range is already set.")
  if (input.mode === "login" && !userId) throw new MobileAccountNotFoundError()
  if (userId && (await isAccountPrivacyAccessBlocked(db, userId)))
    throw new Error("This account is being closed.")

  const user = userId
    ? await db.user.update({
        data: {
          ageBand:
            signupAgeBand && existingUser?.ageBand === AccountAgeBand.UNDECLARED
              ? signupAgeBand
              : undefined,
          ageDeclaredAt:
            signupAgeBand && existingUser?.ageBand === AccountAgeBand.UNDECLARED
              ? now
              : undefined,
          avatarUrl: cleanText(input.image) ?? undefined,
          displayName,
          emailVerified: linkedAccount ? undefined : true,
          emailVerifiedAt: linkedAccount ? undefined : now,
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
          ageBand: signupAgeBand ?? undefined,
          ageDeclaredAt: signupAgeBand ? now : undefined,
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

  await ensureMobileSignupAgeBand(db, user.id, signupAgeBand)

  const age = await getCustomerAccountAgeStatus(db, user.id)

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

  const tenant = !age.eligible
    ? null
    : input.mode === "sign_up"
      ? await ensureOwnerTenant(db, {
          addressLine1: input.addressLine1,
          businessProfileKey: input.businessProfileKey,
          businessProfileVersion: input.businessProfileVersion,
          businessName,
          city: input.city,
          countryCode:
            normalizeCountryCode(input.countryCode) ??
            approvedOnboarding?.draft?.countryCode,
          region: cleanText(input.region) ?? approvedOnboarding?.draft?.region,
          currencyCode: normalizeOperatingCurrencyCode(input.currencyCode),
          operatingModel: input.operatingModel,
          orderChannels: input.orderChannels,
          otherBusinessDescription: input.otherBusinessDescription,
          userId: user.id,
          phone: input.phone,
          teamSize: input.teamSize,
        })
      : await getFirstActiveTenantForUser(db, { userId: user.id })

  if (legalPublication) {
    const acceptance = await recordLegalAcceptance(db, {
      userId: user.id,
      version: legalPublication.version,
      surface: "mobile",
    })
    if (acceptance.documentHash !== legalPublication.documentHash)
      throw new Error("The legal documents changed. Restart signup.")
  }

  const accessProfile = age.eligible
    ? await getMobileAccessProfile(db, { userId: user.id })
    : { hasBusinessAccess: false, hasCustomerHistory: false }

  if (input.mode === "sign_up" && input.accessToken) {
    if (!tenant)
      throw new Error("Your account is not eligible for workspace setup.")
    await consumeApprovedOnboarding(db, {
      token: input.accessToken,
      email,
      businessName: tenant.name,
    })
  }

  const session = await createMobileSession(db, {
    tenant,
    userId: user.id,
  })

  return {
    accessProfile,
    expiresAt: session.expiresAt,
    profile: {
      businessId: tenant?.id ?? null,
      businessName: tenant?.name ?? null,
      currencyCode: tenant?.currencyCode ?? "NGN",
      email: user.email,
      id: user.id,
      name: user.name || displayName,
      role: tenant?.role ?? "NONE",
      staffAccessMode: tenant?.staffAccessMode,
      catalogEditor: tenant?.catalogEditor,
      status: tenant?.status ?? "NONE",
    },
    tenant,
    token: session.token,
  }
}
