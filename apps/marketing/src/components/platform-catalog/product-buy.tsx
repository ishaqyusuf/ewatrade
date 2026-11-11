"use client"

import {
  type PlatformCatalogItem,
  formatPlatformPrice,
  platformAvailability,
  platformItemPrice,
  platformWhatsAppUrl,
} from "@/lib/platform-catalog"
import { type ReactNode, useState } from "react"
import { PlatformIcon } from "./icons"
import { PlatformGallery } from "./product-gallery"

/**
 * Option choice, quantity and customer-initiated WhatsApp drafts. Nothing is
 * sent from here: the customer's own WhatsApp opens with an editable draft.
 */
export function PlatformProductBuy({
  item,
  business,
  pageUrl,
  artwork,
  heading,
  children,
}: {
  item: PlatformCatalogItem
  business: { name: string; whatsAppPhone: string | null }
  pageUrl: string
  artwork: ReactNode
  heading: ReactNode
  children?: ReactNode
}) {
  const single = item.options.length === 1 ? item.options[0] : null
  const [selectedId, setSelectedId] = useState<string | null>(
    single?.id ?? null,
  )
  const [quantity, setQuantity] = useState(1)
  const [needOption, setNeedOption] = useState(false)
  const selected =
    item.options.find((option) => option.id === selectedId) ?? null
  const availability = platformAvailability(
    selected ? selected.availability : item.availability,
  )
  const price = selected
    ? selected.priceMinor === null
      ? "Ask for price"
      : formatPlatformPrice(selected.priceMinor, selected.currencyCode)
    : platformItemPrice(item)
  const optionLabel = single ? null : (selected?.name ?? null)
  const out = availability.kind === "out"
  const draft = (intent: "order" | "ask") =>
    platformWhatsAppUrl({
      phone: business.whatsAppPhone,
      intent,
      businessName: business.name,
      pageUrl,
      item: { name: item.name, option: optionLabel, quantity },
    })
  const orderUrl = draft(out ? "ask" : "order")
  const askUrl = draft("ask")

  return (
    <div className="pd-grid">
      <PlatformGallery
        item={item}
        artwork={artwork}
        optionPhotoUrl={selected?.photoUrl}
      />
      <div className="pd-info">
        {heading}
        <div className="pd-price price">{price}</div>
        <div className="pd-status">
          {selected || single || item.options.length === 0 ? (
            <span className="avail" data-a={availability.kind}>
              <i />
              {availability.label}
            </span>
          ) : (
            <span className="avail avail-wait">
              Choose an option to see availability
            </span>
          )}
        </div>
        {item.options.length > 1 ? (
          <fieldset className="opt" data-need={needOption && !selected}>
            <legend>
              Options{selected ? <span>{selected.name}</span> : null}
            </legend>
            <div className="dev-list">
              {item.options.map((option) => {
                const optionOut = option.availability === "OUT_OF_STOCK"
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={`dev-row${optionOut ? " is-out" : ""}`}
                    aria-pressed={option.id === selectedId}
                    onClick={() => {
                      setSelectedId(option.id)
                      setNeedOption(false)
                    }}
                  >
                    <span className="dev-radio" aria-hidden="true" />
                    <span className="dev-name">{option.name}</span>
                    <span className="dev-meta">
                      {optionOut
                        ? "Sold out"
                        : option.priceMinor === null
                          ? "Ask"
                          : formatPlatformPrice(
                              option.priceMinor,
                              option.currencyCode,
                            )}
                    </span>
                  </button>
                )
              })}
            </div>
            {needOption && !selected ? (
              <p className="need-msg">Choose an option first</p>
            ) : null}
          </fieldset>
        ) : null}
        <div className="pd-buy">
          {out ? null : (
            <>
              <div className="opt-h">Quantity</div>
              <div className="qty">
                <button
                  type="button"
                  aria-label="Fewer"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  <PlatformIcon name="minus" />
                </button>
                <output aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  aria-label="More"
                  disabled={quantity >= 20}
                  onClick={() =>
                    setQuantity((value) => Math.min(20, value + 1))
                  }
                >
                  <PlatformIcon name="plus" />
                </button>
              </div>
            </>
          )}
          {orderUrl && askUrl ? (
            <>
              <div className="pd-actions">
                <a
                  className="btn btn-solid wa-btn"
                  href={orderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (item.options.length > 1 && !selected) {
                      event.preventDefault()
                      setNeedOption(true)
                    }
                  }}
                >
                  <PlatformIcon name="wa" />
                  <span>
                    {out ? "Ask when it’s back" : "Order on WhatsApp"}
                  </span>
                </a>
                <a
                  className="btn btn-line"
                  href={askUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <PlatformIcon name="chat" />
                  <span>Ask a question</span>
                </a>
              </div>
              <p className="pd-note">
                You agree price, delivery and payment with {business.name} on
                WhatsApp.
              </p>
            </>
          ) : (
            <p className="pd-note">
              {business.name} hasn’t added a WhatsApp number for orders yet.
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
