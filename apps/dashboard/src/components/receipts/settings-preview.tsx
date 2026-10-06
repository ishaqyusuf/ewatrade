"use client"
import { type ReceiptSettings, receiptMoney } from "@ewatrade/order-receipts"

export function ReceiptSettingsPreview({
  settings,
  businessName,
  storeName,
  currencyCode,
}: {
  settings: ReceiptSettings
  businessName: string
  storeName: string
  currencyCode: string
}) {
  return (
    <section
      aria-label="Sample receipt preview"
      className="border border-border bg-[#edf1ee] p-4 sm:p-6"
    >
      <p className="mb-4 text-xs text-[#626d69]">
        Sample preview · one simple template
      </p>
      <div className="mx-auto max-w-[400px] border border-[#dce2df] bg-white p-6 text-[#182420] shadow-sm">
        <div className="border-t-4 border-[#17684f] pt-5">
          <p className="break-words text-xl">{businessName}</p>
          <p className="mt-1 text-xs text-[#626d69]">{storeName}</p>
        </div>
        <div className="my-5 grid gap-2 border-y border-[#dce2df] py-4 text-xs">
          <p className="flex justify-between">
            <span>Order receipt</span>
            <span>ORD-0041</span>
          </p>
          {settings.showCustomerName ? (
            <p className="flex justify-between">
              <span>Customer</span>
              <span>Amina Yusuf</span>
            </p>
          ) : null}
          <p className="flex justify-between">
            <span>Payment status</span>
            <span>Paid</span>
          </p>
        </div>
        <div className="space-y-3 text-xs">
          <p className="flex justify-between gap-3">
            <span>2 × Rice · 5 kg</span>
            <span>{receiptMoney(3000000, currencyCode)}</span>
          </p>
          <p className="flex justify-between gap-3">
            <span>1 × Cooking oil</span>
            <span>{receiptMoney(450000, currencyCode)}</span>
          </p>
        </div>
        <div className="mt-5 space-y-3 border-t border-[#dce2df] pt-4 text-xs">
          <p className="flex justify-between text-sm">
            <span>Order total</span>
            <span>{receiptMoney(3450000, currencyCode)}</span>
          </p>
          {settings.showPaymentBreakdown ? (
            <>
              <p className="flex justify-between">
                <span>Net payment received</span>
                <span>{receiptMoney(3450000, currencyCode)}</span>
              </p>
              <p className="flex justify-between">
                <span>Balance due</span>
                <span>{receiptMoney(0, currencyCode)}</span>
              </p>
              <p className="flex justify-between text-[#626d69]">
                <span>Payment · cash</span>
                <span>{receiptMoney(3450000, currencyCode)}</span>
              </p>
            </>
          ) : null}
        </div>
        {settings.thankYouNote ? (
          <p className="mt-6 whitespace-pre-wrap break-words border-t border-[#dce2df] pt-4 text-xs leading-5">
            {settings.thankYouNote}
          </p>
        ) : null}
      </div>
    </section>
  )
}
