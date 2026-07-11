import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsShareLinkError,
  createRetailOpsSharedProductOrderRequest,
  getRetailOpsSharedProduct,
  recordRetailOpsSharedLinkNotificationDispatch,
} from "@ewatrade/db/queries"
import { enqueueRetailOpsSharedLinkOrderNotification } from "@ewatrade/jobs"
import { formatMoney } from "@ewatrade/utils"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

type SharedProductPageParams = {
  productSlug: string
  storeSlug: string
  tenantSlug: string
}

type SharedProductSearchParams = {
  error?: string
  requested?: string
  share?: string
}

type SharedProductPageProps = {
  params: Promise<SharedProductPageParams>
  searchParams: Promise<SharedProductSearchParams>
}

export const dynamic = "force-dynamic"

function getStorefrontBaseUrl() {
  return (
    process.env.EWATRADE_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com"
  ).replace(/\/+$/, "")
}

function getErrorMessage(error?: string) {
  if (error === "INSUFFICIENT_STOCK") {
    return "That quantity is no longer available. Please choose a smaller quantity."
  }

  if (error === "PRODUCT_VARIANT_NOT_FOUND") {
    return "Please choose an available product unit."
  }

  if (error === "CUSTOMER_NAME_REQUIRED") {
    return "Enter your name to create your customer account."
  }

  if (error === "CUSTOMER_PASSWORD_REQUIRED") {
    return "Enter a password with at least 8 characters."
  }

  if (error === "CUSTOMER_ACCOUNT_EXISTS") {
    return "An account already exists for this email. Choose returning customer and log in."
  }

  if (error === "CUSTOMER_LOGIN_FAILED") {
    return "We could not log you in with that email and password."
  }

  if (error === "CUSTOMER_AUTH_UNAVAILABLE") {
    return "We could not prepare your customer account. Please try again."
  }

  if (error) {
    return "We could not submit the request. Please review the form and try again."
  }

  return null
}

function getSharedPath(input: SharedProductPageParams, token: string) {
  return `/p/${encodeURIComponent(input.tenantSlug)}/${encodeURIComponent(
    input.storeSlug,
  )}/${encodeURIComponent(input.productSlug)}?share=${encodeURIComponent(
    token,
  )}`
}

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value : ""
}

function getCustomerAuthMode(value: string) {
  return value === "login" ? "login" : "register"
}

async function resolveSharedLinkCustomer(formData: FormData) {
  const authMode = getCustomerAuthMode(getFormValue(formData, "customerAuthMode"))
  const customerEmail = getFormValue(formData, "customerEmail")
    .trim()
    .toLowerCase()
  const customerName = getFormValue(formData, "customerName").trim()
  const password = getFormValue(formData, "customerPassword")

  if (password.length < 8) {
    return {
      errorCode: "CUSTOMER_PASSWORD_REQUIRED",
    } as const
  }

  if (authMode === "register") {
    if (!customerName) {
      return {
        errorCode: "CUSTOMER_NAME_REQUIRED",
      } as const
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: customerEmail,
      },
      select: {
        id: true,
      },
    })

    if (existingUser) {
      return {
        errorCode: "CUSTOMER_ACCOUNT_EXISTS",
      } as const
    }

    const signUpResult = await auth.api
      .signUpEmail({
        body: {
          email: customerEmail,
          name: customerName,
          password,
        },
        headers: await headers(),
      })
      .catch(() => null)

    if (!signUpResult?.user?.id) {
      return {
        errorCode: "CUSTOMER_AUTH_UNAVAILABLE",
      } as const
    }

    return {
      account: {
        id: signUpResult.user.id,
        mode: authMode,
      },
      email: customerEmail,
      name: signUpResult.user.name?.trim() || customerName,
    } as const
  }

  const signInResult = await auth.api
    .signInEmail({
      body: {
        email: customerEmail,
        password,
      },
      headers: await headers(),
    })
    .catch(() => null)

  if (!signInResult?.user?.id) {
    return {
      errorCode: "CUSTOMER_LOGIN_FAILED",
    } as const
  }

  return {
    account: {
      id: signInResult.user.id,
      mode: authMode,
    },
    email: customerEmail,
    name: customerName || signInResult.user.name?.trim() || customerEmail,
  } as const
}

async function enqueueSharedLinkOrderNotification(
  orderRequest: Awaited<
    ReturnType<typeof createRetailOpsSharedProductOrderRequest>
  >,
) {
  try {
    await enqueueRetailOpsSharedLinkOrderNotification(orderRequest.notification)
    await recordRetailOpsSharedLinkNotificationDispatch(prisma, {
      notification: orderRequest.notification,
      orderId: orderRequest.order.id,
      status: "queued",
    }).catch(() => undefined)
  } catch (error) {
    await recordRetailOpsSharedLinkNotificationDispatch(prisma, {
      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown notification dispatch failure.",
      notification: orderRequest.notification,
      orderId: orderRequest.order.id,
      status: "failed",
    }).catch(() => undefined)
  }
}

async function createOrderRequest(formData: FormData) {
  "use server"

  const pageParams = {
    productSlug: getFormValue(formData, "productSlug"),
    storeSlug: getFormValue(formData, "storeSlug"),
    tenantSlug: getFormValue(formData, "tenantSlug"),
  }
  const token = getFormValue(formData, "token")
  let nextUrl = getSharedPath(pageParams, token)
  const customer = await resolveSharedLinkCustomer(formData)

  if ("errorCode" in customer) {
    redirect(`${nextUrl}&error=${encodeURIComponent(customer.errorCode)}`)
  }

  try {
    const orderRequest = await createRetailOpsSharedProductOrderRequest(prisma, {
      customerAccount: customer.account,
      customerEmail: customer.email,
      customerName: customer.name,
      customerPhone: getFormValue(formData, "customerPhone") || undefined,
      notes: getFormValue(formData, "notes") || undefined,
      productSlug: pageParams.productSlug,
      productVariantId: getFormValue(formData, "productVariantId"),
      quantity: Number(getFormValue(formData, "quantity")),
      storeSlug: pageParams.storeSlug,
      tenantSlug: pageParams.tenantSlug,
      token,
    })

    await enqueueSharedLinkOrderNotification(orderRequest)

    nextUrl = `${nextUrl}&requested=${encodeURIComponent(
      orderRequest.order.orderNumber,
    )}`
  } catch (error) {
    const errorCode =
      error instanceof RetailOpsShareLinkError ? error.code : "UNKNOWN"

    nextUrl = `${nextUrl}&error=${encodeURIComponent(errorCode)}`
  }

  redirect(nextUrl)
}

async function resolveSharedProduct(
  params: SharedProductPageParams,
  searchParams: SharedProductSearchParams,
  recordView: boolean,
) {
  if (!searchParams.share) {
    notFound()
  }

  try {
    return await getRetailOpsSharedProduct(prisma, {
      productSlug: params.productSlug,
      recordView,
      storeSlug: params.storeSlug,
      tenantSlug: params.tenantSlug,
      token: searchParams.share,
    })
  } catch (error) {
    if (error instanceof RetailOpsShareLinkError) {
      notFound()
    }

    throw error
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: SharedProductPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const sharedProduct = await resolveSharedProduct(
    resolvedParams,
    resolvedSearchParams,
    false,
  )
  const baseUrl = getStorefrontBaseUrl()
  const pageUrl = `${baseUrl}${getSharedPath(
    resolvedParams,
    resolvedSearchParams.share ?? "",
  )}`
  const firstAvailableVariant =
    sharedProduct.product.variants.find(
      (variant) => variant.availableQuantity > 0,
    ) ?? sharedProduct.product.variants[0]
  const previewImage = `${baseUrl}/api/og/shared-product?name=${encodeURIComponent(
    sharedProduct.product.name,
  )}&business=${encodeURIComponent(
    sharedProduct.store.name,
  )}&price=${encodeURIComponent(
    firstAvailableVariant
      ? formatMoney(firstAvailableVariant.priceMinor / 100, sharedProduct.product.currencyCode)
      : "",
  )}`
  const description =
    sharedProduct.product.description ??
    `Order ${sharedProduct.product.name} from ${sharedProduct.store.name}.`

  return {
    title: `${sharedProduct.product.name} | ${sharedProduct.store.name}`,
    description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title: sharedProduct.product.name,
      description,
      images: [
        {
          url: previewImage,
          width: 1200,
          height: 630,
          alt: `${sharedProduct.product.name} from ${sharedProduct.store.name}`,
        },
      ],
      type: "website",
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: sharedProduct.product.name,
      description,
      images: [previewImage],
    },
  }
}

export default async function SharedProductPage({
  params,
  searchParams,
}: SharedProductPageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const sharedProduct = await resolveSharedProduct(
    resolvedParams,
    resolvedSearchParams,
    true,
  )
  const availableVariants = sharedProduct.product.variants.filter(
    (variant) => variant.availableQuantity > 0,
  )
  const defaultVariant =
    availableVariants.find((variant) => variant.isDefault) ??
    availableVariants[0] ??
    sharedProduct.product.variants[0]
  const errorMessage = getErrorMessage(resolvedSearchParams.error)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-border border-b bg-surface">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[1fr_0.82fr] md:px-8 md:py-14">
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              {sharedProduct.tenant.name} / {sharedProduct.store.name}
            </p>
            <div className="space-y-3">
              <h1 className="max-w-3xl font-semibold text-4xl leading-tight md:text-5xl">
                {sharedProduct.product.name}
              </h1>
              {sharedProduct.product.description ? (
                <p className="max-w-2xl text-base text-muted-foreground leading-7">
                  {sharedProduct.product.description}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="border border-border bg-background px-3 py-2">
                {sharedProduct.product.variants.length} unit
                {sharedProduct.product.variants.length === 1 ? "" : "s"}
              </span>
              <span className="border border-border bg-background px-3 py-2">
                {availableVariants.length > 0 ? "Available now" : "Ask seller"}
              </span>
            </div>
          </div>

          <div className="border border-border bg-background p-5">
            <p className="font-medium text-sm">Available units</p>
            <div className="mt-4 divide-y divide-border border border-border">
              {sharedProduct.product.variants.map((variant) => (
                <div
                  className="flex items-center justify-between gap-4 p-4 text-sm"
                  key={variant.id}
                >
                  <div>
                    <p className="font-medium">{variant.name}</p>
                    <p className="text-muted-foreground">
                      {variant.availableQuantity} available
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(
                      variant.priceMinor / 100,
                      sharedProduct.product.currencyCode,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-[0.85fr_1fr] md:px-8">
        <div className="space-y-3 text-sm text-muted-foreground leading-6">
          <p className="font-medium text-foreground">Request this product</p>
          <p>
            Create or use your customer account, then submit the unit and
            quantity you want. The business will follow up to confirm pickup,
            payment, and availability.
          </p>
        </div>

        <form action={createOrderRequest} className="space-y-5">
          <input name="tenantSlug" type="hidden" value={resolvedParams.tenantSlug} />
          <input name="storeSlug" type="hidden" value={resolvedParams.storeSlug} />
          <input name="productSlug" type="hidden" value={resolvedParams.productSlug} />
          <input name="token" type="hidden" value={resolvedSearchParams.share} />

          {resolvedSearchParams.requested ? (
            <div className="border border-green-700/30 bg-green-500/10 p-4 text-green-900 text-sm">
              Request received. Reference: {resolvedSearchParams.requested}.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="border border-red-700/30 bg-red-500/10 p-4 text-red-900 text-sm">
              {errorMessage}
            </div>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="font-medium text-sm">Choose unit</legend>
            <div className="grid gap-3">
              {sharedProduct.product.variants.map((variant) => (
                <label
                  className="flex cursor-pointer items-center justify-between gap-4 border border-border p-4 text-sm"
                  key={variant.id}
                >
                  <span>
                    <span className="block font-medium">{variant.name}</span>
                    <span className="text-muted-foreground">
                      {formatMoney(
                        variant.priceMinor / 100,
                        sharedProduct.product.currencyCode,
                      )}
                    </span>
                  </span>
                  <input
                    defaultChecked={variant.id === defaultVariant?.id}
                    disabled={variant.availableQuantity <= 0}
                    name="productVariantId"
                    required
                    type="radio"
                    value={variant.id}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Quantity</span>
              <input
                className="border border-border bg-background px-3 py-3"
                defaultValue="1"
                min="1"
                name="quantity"
                required
                type="number"
              />
            </label>
          </div>

          <fieldset className="space-y-3">
            <legend className="font-medium text-sm">Customer account</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 border border-border p-4 text-sm">
                <input
                  className="mt-1"
                  defaultChecked
                  name="customerAuthMode"
                  type="radio"
                  value="register"
                />
                <span>
                  <span className="block font-medium">I am new</span>
                  <span className="text-muted-foreground">
                    Create my customer account for faster future orders.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border border-border p-4 text-sm">
                <input
                  className="mt-1"
                  name="customerAuthMode"
                  type="radio"
                  value="login"
                />
                <span>
                  <span className="block font-medium">
                    I already registered
                  </span>
                  <span className="text-muted-foreground">
                    Use my email and password for this order request.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Name</span>
              <input
                autoComplete="name"
                className="border border-border bg-background px-3 py-3"
                name="customerName"
                type="text"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Email</span>
              <input
                autoComplete="email"
                className="border border-border bg-background px-3 py-3"
                name="customerEmail"
                required
                type="email"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Password</span>
              <input
                autoComplete="current-password"
                className="border border-border bg-background px-3 py-3"
                minLength={8}
                name="customerPassword"
                required
                type="password"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Phone</span>
              <input
                autoComplete="tel"
                className="border border-border bg-background px-3 py-3"
                name="customerPhone"
                type="tel"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Note</span>
            <textarea
              className="min-h-24 border border-border bg-background px-3 py-3"
              name="notes"
            />
          </label>

          <button
            className="w-full bg-foreground px-5 py-3 font-medium text-background"
            type="submit"
          >
            Submit order request
          </button>
        </form>
      </section>
    </main>
  )
}
