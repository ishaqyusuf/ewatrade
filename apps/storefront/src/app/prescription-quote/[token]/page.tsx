import { createHash } from "node:crypto"

import { prisma } from "@ewatrade/db"
import {
  CommerceQuoteError,
  PrescriptionRequestError,
  acceptPrescriptionDeliveryQuote,
  acceptPrescriptionPickupQuote,
  attachPrescriptionHostedCheckout,
  getPublicPrescriptionQuote,
  preparePrescriptionHostedCheckout,
  selectPrescriptionQuoteOption,
} from "@ewatrade/db/queries"
import { getConfiguredHostedPaymentProvider } from "@ewatrade/payments"
import { formatMinorMoney } from "@ewatrade/utils"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

function commandId(prefix: string, token: string) {
  return `${prefix}:${createHash("sha256").update(token).digest("hex")}`
}

async function load(token: string) {
  try {
    return await getPublicPrescriptionQuote(prisma, { acceptanceToken: token })
  } catch (error) {
    if (
      error instanceof PrescriptionRequestError ||
      error instanceof CommerceQuoteError
    )
      notFound()
    throw error
  }
}

async function acceptPickup(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await acceptPrescriptionPickupQuote(prisma, {
      acceptanceToken: token,
      clientAcceptanceId: commandId("prescription-pickup", token),
      partialAcknowledged: data.get("partialAcknowledged") === "yes",
    })
  } catch (error) {
    if (
      error instanceof PrescriptionRequestError ||
      error instanceof CommerceQuoteError
    ) {
      redirect(`/prescription-quote/${token}?error=acceptance`)
    }
    throw error
  }
  redirect(`/prescription-quote/${token}?accepted=1`)
}

async function selectOption(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await selectPrescriptionQuoteOption(prisma, {
      acceptanceToken: token,
      clientSelectionId: commandId("prescription-option", token),
      optionId: String(data.get("optionId") ?? ""),
    })
  } catch (error) {
    if (
      error instanceof PrescriptionRequestError ||
      error instanceof CommerceQuoteError
    ) {
      redirect(`/prescription-quote/${token}?error=selection`)
    }
    throw error
  }
  redirect(`/prescription-quote/${token}?selected=1`)
}

async function acceptDelivery(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  try {
    await acceptPrescriptionDeliveryQuote(prisma, {
      acceptanceToken: token,
      clientAcceptanceId: commandId("prescription-delivery", token),
      partialAcknowledged: data.get("partialAcknowledged") === "yes",
    })
  } catch (error) {
    if (
      error instanceof PrescriptionRequestError ||
      error instanceof CommerceQuoteError
    ) {
      redirect(`/prescription-quote/${token}?error=acceptance`)
    }
    throw error
  }
  redirect(`/prescription-quote/${token}?accepted=1`)
}

async function payNow(data: FormData) {
  "use server"
  const token = String(data.get("token") ?? "")
  const statusToken = createHash("sha256")
    .update(`prescription-payment-status:${token}`)
    .digest("base64url")
  let checkoutUrl: string
  try {
    const provider = getConfiguredHostedPaymentProvider()
    const prepared = await preparePrescriptionHostedCheckout(prisma, {
      acceptanceToken: token,
      clientPaymentId: commandId("prescription-payment", token),
      provider: provider.key,
      statusToken,
    })
    const storefrontUrl =
      process.env.STOREFRONT_URL?.replace(/\/$/, "") ??
      "http://ewatrade-storefront.localhost"
    const checkout = await provider.createCheckout({
      amountMinor: prepared.amountMinor,
      callbackUrl: `${storefrontUrl}/prescription-payment/${statusToken}`,
      currencyCode: prepared.currencyCode,
      customerEmail: prepared.customerEmail,
      metadata: { paymentIntentId: prepared.intentId },
      reference: prepared.providerReference,
    })
    await attachPrescriptionHostedCheckout(prisma, {
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: checkout.expiresAt,
      intentId: prepared.intentId,
      providerReference: prepared.providerReference,
    })
    checkoutUrl = checkout.checkoutUrl
  } catch (error) {
    redirect(`/prescription-quote/${token}?error=payment`)
  }
  redirect(checkoutUrl)
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    accepted?: string
    delivery?: string
    error?: string
  }>
}) {
  const { token } = await params
  const query = await searchParams
  const quote = await load(token)
  const partial = quote.availabilityOutcome === "partial"
  const isDelivery = quote.fulfilmentType === "delivery"
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-3xl gap-6 px-5 py-12 md:px-8">
        <div>
          <p className="text-sm text-muted-foreground">
            {quote.storeName} · Quote version {quote.version}
          </p>
          <h1 className="mt-2 text-4xl font-semibold">Prescription quote</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review the pharmacy-approved outcome. This page is the secure system
            of action.
          </p>
        </div>
        {query.accepted || quote.accepted ? (
          <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {isDelivery ? "Delivery" : "Pickup"} selected and order created
            once.
          </p>
        ) : null}
        {query.error ? (
          <p
            role="alert"
            className="border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
          >
            This Quote changed or could not be accepted. Refresh and review the
            current outcome.
          </p>
        ) : null}
        {query.delivery === "manual" ? (
          <p className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            The pharmacy is confirming the delivery fee. This pickup Quote
            remains available and no delivery charge has been added.
          </p>
        ) : null}
        {quote.requiresSelection ? (
          <section aria-labelledby="offer-options" className="grid gap-3">
            <div>
              <h2 id="offer-options" className="text-xl font-semibold">
                Choose one pharmacy option
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only the option you choose can be accepted, reserved or paid.
              </p>
            </div>
            {quote.options.map((option) => (
              <form
                action={selectOption}
                className="grid gap-3 border border-border p-5"
                key={option.id}
              >
                <input name="token" type="hidden" value={token} />
                <input name="optionId" type="hidden" value={option.id} />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{option.label}</h3>
                    {option.fulfilmentPromise ? (
                      <p className="text-sm text-muted-foreground">
                        {option.fulfilmentPromise}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold">
                    {formatMinorMoney(option.totalMinor, quote.currencyCode)}
                  </p>
                </div>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {option.lines.map((line, index) => (
                    <li key={`${line.offeringName}:${index}`}>
                      {line.offeringName}
                      {line.quantity ? ` · ${line.quantity}` : ""}
                    </li>
                  ))}
                </ul>
                <button
                  className="h-11 bg-primary px-5 text-sm font-medium text-primary-foreground"
                  type="submit"
                >
                  Choose {option.label}
                </button>
              </form>
            ))}
          </section>
        ) : (
          <div className="grid gap-3 border border-border p-5">
            {quote.lines.map((line, index) => (
              <div
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0"
                key={`${line.catalogItemName}:${index}`}
              >
                <div>
                  <p className="font-medium">{line.offeringName}</p>
                  <p className="text-sm capitalize text-muted-foreground">
                    {line.outcome.replaceAll("_", " ")}
                    {line.quantity ? ` · ${line.quantity}` : ""}
                  </p>
                  {line.customerNote ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {line.customerNote}
                    </p>
                  ) : null}
                </div>
                <p className="font-medium">
                  {formatMinorMoney(line.totalMinor, quote.currencyCode)}
                </p>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
              <span>Total</span>
              <span>
                {formatMinorMoney(quote.totalMinor, quote.currencyCode)}
              </span>
            </div>
          </div>
        )}
        {quote.payable ? (
          <div className="grid gap-2 sm:grid-cols-3" aria-label="Quick options">
            {!quote.accepted ? (
              <form action={isDelivery ? acceptDelivery : acceptPickup}>
                <input name="token" type="hidden" value={token} />
                {partial ? (
                  <label className="mb-3 flex items-start gap-2 text-sm sm:col-span-3">
                    <input
                      type="checkbox"
                      name="partialAcknowledged"
                      value="yes"
                      required
                    />
                    I understand that this Quote contains only the available or
                    approved lines shown above.
                  </label>
                ) : null}
                <button
                  className="h-12 w-full bg-primary px-5 text-sm font-medium text-primary-foreground"
                  type="submit"
                >
                  {isDelivery ? "Confirm delivery" : "Pick up"}
                </button>
              </form>
            ) : (
              <button
                className="h-12 border border-border px-5 text-sm font-medium"
                type="button"
                disabled
              >
                {isDelivery ? "Delivery selected" : "Pickup selected"}
              </button>
            )}
            {!quote.accepted && !isDelivery ? (
              <a
                className="flex h-12 items-center justify-center border border-border px-5 text-sm font-medium"
                href={`/prescription-delivery/${token}`}
                title="Confirm an eligible address and exact fee before payment."
              >
                Delivery
              </a>
            ) : (
              <button
                className="h-12 border border-border px-5 text-sm font-medium text-muted-foreground"
                type="button"
                disabled
              >
                {isDelivery ? "Delivery selected" : "Delivery"}
              </button>
            )}
            {quote.storeSupportPhone || quote.storeSupportEmail ? (
              <a
                className="flex h-12 items-center justify-center border border-border px-5 text-sm font-medium"
                href={
                  quote.storeSupportPhone
                    ? `tel:${quote.storeSupportPhone}`
                    : `mailto:${quote.storeSupportEmail}`
                }
              >
                Ask pharmacy
              </a>
            ) : (
              <button
                className="h-12 border border-border px-5 text-sm font-medium text-muted-foreground"
                type="button"
                disabled
              >
                Ask pharmacy
              </button>
            )}
          </div>
        ) : null}
        {quote.accepted ? (
          <form action={payNow}>
            <input name="token" type="hidden" value={token} />
            <button
              className="h-12 w-full bg-primary px-5 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Review &amp; pay
            </button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Review &amp; pay appears only after fulfilment is selected and the
            exact payable total is fixed.
          </p>
        )}
      </section>
    </main>
  )
}
