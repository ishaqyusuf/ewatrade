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
import { SharedProductOrderForm } from "./shared-product-order-form"
import {
  type SharedLinkCustomerErrorCode,
  type SharedProductPageParams,
  type SharedProductSearchParams,
  getCustomerAuthMode,
  getErrorMessage,
  getFormValue,
  getOrderQuantity,
  getSharedPath,
  getSharedProductPreviewImageUrl,
  getStorefrontBaseUrlFromHeaders,
} from "./shared-product-order-utils"

type SharedProductPageProps = {
  params: Promise<SharedProductPageParams>
  searchParams: Promise<SharedProductSearchParams>
}

export const dynamic = "force-dynamic"

function customerError(errorCode: SharedLinkCustomerErrorCode) {
  return { errorCode } as const
}

async function resolveSharedLinkCustomer(formData: FormData) {
  const authMode = getCustomerAuthMode(
    getFormValue(formData, "customerAuthMode"),
  )
  const customerEmail = getFormValue(formData, "customerEmail")
    .trim()
    .toLowerCase()
  const customerName = getFormValue(formData, "customerName").trim()
  const password = getFormValue(formData, "customerPassword")

  if (password.length < 8) {
    return customerError("CUSTOMER_PASSWORD_REQUIRED")
  }

  if (authMode === "register") {
    if (!customerName) {
      return customerError("CUSTOMER_NAME_REQUIRED")
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
      return customerError("CUSTOMER_ACCOUNT_EXISTS")
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
      return customerError("CUSTOMER_AUTH_UNAVAILABLE")
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
    return customerError("CUSTOMER_LOGIN_FAILED")
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
    const orderRequest = await createRetailOpsSharedProductOrderRequest(
      prisma,
      {
        customerAccount: customer.account,
        customerEmail: customer.email,
        customerName: customer.name,
        customerPhone:
          getFormValue(formData, "customerPhone").trim() || undefined,
        notes: getFormValue(formData, "notes").trim() || undefined,
        productSlug: pageParams.productSlug,
        productVariantId: getFormValue(formData, "productVariantId"),
        quantity: getOrderQuantity(getFormValue(formData, "quantity")),
        storeSlug: pageParams.storeSlug,
        tenantSlug: pageParams.tenantSlug,
        token,
      },
    )

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
  const baseUrl = getStorefrontBaseUrlFromHeaders(await headers())
  const pageUrl = `${baseUrl}${getSharedPath(
    resolvedParams,
    resolvedSearchParams.share ?? "",
  )}`
  const firstAvailableVariant =
    sharedProduct.product.variants.find(
      (variant) => variant.availableQuantity > 0,
    ) ?? sharedProduct.product.variants[0]
  const generatedPreviewImage = `${baseUrl}/api/og/shared-product?name=${encodeURIComponent(
    sharedProduct.product.name,
  )}&business=${encodeURIComponent(
    sharedProduct.store.name,
  )}&price=${encodeURIComponent(
    firstAvailableVariant
      ? formatMoney(
          firstAvailableVariant.priceMinor / 100,
          sharedProduct.product.currencyCode,
        )
      : "",
  )}`
  const previewImage = getSharedProductPreviewImageUrl({
    fallbackImageUrl: generatedPreviewImage,
    productImageUrl: sharedProduct.product.imageUrl,
  })
  const description =
    sharedProduct.product.description ??
    `Order ${sharedProduct.product.name} from ${sharedProduct.store.name}.`
  const previewImageAlt = `${sharedProduct.product.name} from ${sharedProduct.store.name}`

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
          alt: previewImageAlt,
        },
      ],
      siteName: sharedProduct.store.name,
      type: "website",
      url: pageUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: sharedProduct.product.name,
      description,
      images: [
        {
          url: previewImage,
          alt: previewImageAlt,
          width: 1200,
          height: 630,
        },
      ],
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

        <SharedProductOrderForm
          action={createOrderRequest}
          currencyCode={sharedProduct.product.currencyCode}
          errorMessage={errorMessage}
          productSlug={resolvedParams.productSlug}
          requested={resolvedSearchParams.requested}
          shareToken={resolvedSearchParams.share ?? ""}
          storeSlug={resolvedParams.storeSlug}
          tenantSlug={resolvedParams.tenantSlug}
          variants={sharedProduct.product.variants}
        />
      </section>
    </main>
  )
}
