"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"

import { useEffect, useRef, useState } from "react"

import { Icon } from "./icons"

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
})
export function NativePreview() {
  const [phone, setPhone] = useState("sale")
  const [step, setStep] = useState("items")
  const [quantity, setQuantity] = useState(3)
  const [query, setQuery] = useState("")
  const [variant, setVariant] = useState("all")
  const proceedRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    if (step === "customer") backRef.current?.focus()
    else proceedRef.current?.focus()
  }, [step])
  return (
    <section className="mobile-section wrap" id="mobile-preview">
      <div className="mobile-copy">
        <h2>
          Your counter. <br />
          In your pocket.
        </h2>
        <p className="lead">
          Record a sale, check an item, get back to your customer.
        </p>
        <p>
          The native app and offline sales are coming soon. Until then, open
          EwaTrade in your phone's browser.
        </p>
        <fieldset
          className="preview-tabs"
          aria-label="Mobile app preview screen"
        >
          <button
            aria-pressed={phone === "sale"}
            data-phone="sale"
            {...marketingAttrs("navigation", "availability", "mobile")}
            onClick={() => setPhone("sale")}
            type="button"
          >
            New sale
          </button>
          <button
            aria-pressed={phone === "item"}
            data-phone="item"
            {...marketingAttrs("navigation", "availability", "mobile")}
            onClick={() => setPhone("item")}
            type="button"
          >
            Item details
          </button>
        </fieldset>
        <p className="fine">Mobile app coming soon · preview data</p>
      </div>
      <figure className="mobile-proof">
        <div className="handset real-native">
          <div className="handset-status">
            <strong>9:41</strong>
            <span>▮▮▮ ▰</span>
          </div>
          <div
            className="native-screen"
            data-phone-screen="sale"
            hidden={phone !== "sale"}
          >
            <div data-sale-step="items" hidden={step !== "items"}>
              <div className="native-top">
                <div>
                  <strong>New sale</strong>
                  <p>Step 1 of 3 · Jawdah Poultry</p>
                </div>
                <span className="native-circle">
                  <Icon name="close" />
                </span>
              </div>
              <div className="native-price-actions">
                <span>
                  <Icon name="pencil" />
                  Type a price
                </span>
                <span>
                  <Icon name="plus" />
                  Additional cost
                </span>
              </div>
              <div className="native-section-label">
                <b>IN THIS SALE</b>
                <span id="selected-count">{quantity > 0 ? 1 : 0}</span>
              </div>
              <div
                className="native-selected"
                id="selected-item"
                hidden={
                  quantity === 0 ||
                  !"eggs small crate".includes(query.trim().toLowerCase())
                }
              >
                <div className="native-selected-line">
                  <span className="native-initial">E</span>
                  <div className="selected-description">
                    <strong>Eggs · Small · Crate</strong>
                    <p>₦4,500 · 108 crates available</p>
                    <strong id="line-total">
                      {money.format(quantity * 4500)}
                    </strong>
                  </div>
                  <div className="native-quantity">
                    <button
                      data-quantity="-1"
                      aria-label="Decrease egg quantity"
                      onClick={() =>
                        setQuantity((current) => Math.max(0, current + -1))
                      }
                      type="button"
                    >
                      −
                    </button>
                    <input
                      id="quantity"
                      value={quantity}
                      type="number"
                      min="0"
                      max="108"
                      step="any"
                      aria-label="Crates of eggs"
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (Number.isFinite(value))
                          setQuantity(Math.min(108, Math.max(0, value)))
                      }}
                    />
                    <button
                      data-quantity="1"
                      aria-label="Increase egg quantity"
                      onClick={() =>
                        setQuantity((current) => Math.min(108, current + 1))
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <div
                id="native-empty"
                className="native-empty"
                hidden={quantity > 0}
              >
                <button
                  id="restore-eggs"
                  className="native-primary"
                  onClick={() => setQuantity(1)}
                  type="button"
                >
                  Add Eggs
                </button>
              </div>
              <div className="native-section-label">
                <b>MORE ITEMS</b>
                <span>2</span>
              </div>
              <div className="native-options">
                <div
                  className="native-option"
                  hidden={
                    !"llayer feed\u20a618,500 \u00b7 40 bags available+ add".includes(
                      query.trim().toLowerCase(),
                    )
                  }
                >
                  <span className="native-initial amber">L</span>
                  <div>
                    <strong>Layer feed</strong>
                    <p>₦18,500 · 40 bags available</p>
                  </div>
                  <span className="native-add">+ Add</span>
                </div>
                <div
                  className="native-option"
                  hidden={
                    !"bbroiler chicken\u20a69,000 \u00b7 18 birds available+ add".includes(
                      query.trim().toLowerCase(),
                    )
                  }
                >
                  <span className="native-initial lilac">B</span>
                  <div>
                    <strong>Broiler chicken</strong>
                    <p>₦9,000 · 18 birds available</p>
                  </div>
                  <span className="native-add">+ Add</span>
                </div>
              </div>
              <div className="native-footer">
                <div className="native-total">
                  <span id="unit-label">
                    {quantity > 0
                      ? `1 item · ${quantity} ${quantity === 1 ? "unit" : "units"}`
                      : "Add the first item"}
                  </span>
                  <strong id="sale-total">
                    {money.format(quantity * 4500)}
                  </strong>
                </div>
                <div className="native-search-row">
                  <label className="native-search">
                    <Icon name="search" />
                    <input
                      placeholder="Search items"
                      aria-label="Search preview items"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <button
                    id="sale-proceed"
                    ref={proceedRef}
                    disabled={quantity === 0}
                    onClick={() => setStep("customer")}
                    type="button"
                  >
                    Proceed <Icon name="chevronRight" />
                  </button>
                </div>
              </div>
            </div>
            <div data-sale-step="customer" hidden={step !== "customer"}>
              <div className="native-top">
                <button
                  className="native-circle"
                  data-native-back=""
                  aria-label="Back to sale items"
                  ref={backRef}
                  onClick={() => setStep("items")}
                  type="button"
                >
                  <Icon name="chevronLeft" />
                </button>
                <div>
                  <strong>Who is buying?</strong>
                  <p>Step 2 of 3 · Jawdah Poultry</p>
                </div>
                <span className="native-circle">
                  <Icon name="close" />
                </span>
              </div>
              <div className="buyer-rail">
                <span>
                  <i className="chosen">
                    <Icon name="store" />
                  </i>
                  Walk-in
                </span>
                <span>
                  <i>JQ</i>Jawdah
                </span>
                <span>
                  <i>
                    <Icon name="plus" />
                  </i>
                  New
                </span>
              </div>
              <div className="native-card">
                <strong>Walk-in customer</strong>
                <p>No customer attached to this sale</p>
              </div>
              <div className="native-footer">
                <p className="native-preview-note">
                  Preview only · no sale is created
                </p>
                <button
                  className="native-primary"
                  data-native-back=""
                  onClick={() => setStep("items")}
                  type="button"
                >
                  Back to items
                </button>
              </div>
            </div>
          </div>
          <div
            className="native-screen native-item"
            data-phone-screen="item"
            hidden={phone !== "item"}
          >
            <div className="native-item-bar">
              <button
                className="native-circle"
                data-show-sale=""
                aria-label="Back to sale preview"
                onClick={() => {
                  setPhone("sale")
                  setStep("items")
                }}
                type="button"
              >
                <Icon name="chevronLeft" />
              </button>
              <span>Catalog · Poultry</span>
              <span className="native-circle">
                <Icon name="camera" />
              </span>
            </div>
            <div className="native-item-heading">
              <span className="native-package">
                <Icon name="package" />
              </span>
              <div>
                <strong>Eggs</strong>
                <div>
                  <span className="product-pill info">Goods</span>
                  <span className="product-pill ok">Active</span>
                </div>
              </div>
            </div>
            <div className="native-quick-actions">
              <button
                data-show-sale=""
                onClick={() => {
                  setPhone("sale")
                  setStep("items")
                }}
                type="button"
              >
                <i className="gold">
                  <Icon name="plus" />
                </i>
                <span>New order</span>
              </button>
              <span>
                <i>
                  <Icon name="download" />
                </i>
                <span>Stock in</span>
              </span>
              <span>
                <i>
                  <Icon name="image" />
                </i>
                <span>Images</span>
              </span>
              <span>
                <i>
                  <Icon name="share" />
                </i>
                <span>Share</span>
              </span>
            </div>
            <fieldset
              className="native-variant-chips"
              aria-label="Product variant"
            >
              <button
                data-variant="all"
                aria-pressed={variant === "all"}
                onClick={() => setVariant("all")}
                type="button"
              >
                All <small>2</small>
              </button>
              <button
                data-variant="small"
                aria-pressed={variant === "small"}
                onClick={() => setVariant("small")}
                type="button"
              >
                Small <small>1</small>
              </button>
              <button
                data-variant="large"
                aria-pressed={variant === "large"}
                onClick={() => setVariant("large")}
                type="button"
              >
                Large <small>1</small>
              </button>
            </fieldset>
            <div className="native-price-table">
              <div className="native-price-head">
                <span>OPTION</span>
                <span>STOCK</span>
                <span>PRICE</span>
              </div>
              <div
                className="native-price-row"
                data-variant-row="small"
                hidden={variant !== "all" && variant !== "small"}
              >
                <div>
                  <strong>Small · Crate</strong>
                  <small>Eggs</small>
                </div>
                <div>
                  <strong>120</strong>
                  <small>12 res.</small>
                </div>
                <strong>₦4,500</strong>
              </div>
              <div
                className="native-price-row"
                data-variant-row="large"
                hidden={variant !== "all" && variant !== "large"}
              >
                <div>
                  <strong>Large · Crate</strong>
                  <small>Eggs</small>
                </div>
                <div>
                  <strong>86</strong>
                  <small>4 res.</small>
                </div>
                <strong>₦5,500</strong>
              </div>
            </div>
            <div className="native-section-label">
              <b>ABOUT</b>
            </div>
            <div className="native-card">
              <p>Fresh eggs, sold by the crate.</p>
              <div className="native-about-row">
                <span>Category</span>
                <strong>Poultry</strong>
              </div>
              <strong>Stock-tracked item</strong>
              <p>Stock moves when orders are fulfilled</p>
            </div>
            <div className="native-section-label">
              <b>USAGE</b>
            </div>
            <div className="native-usage">
              <b>For sale</b>
              <span>Internal use</span>
              <span>Both</span>
            </div>
          </div>
          <div className="home-indicator" aria-hidden="true" />
        </div>
      </figure>
    </section>
  )
}
