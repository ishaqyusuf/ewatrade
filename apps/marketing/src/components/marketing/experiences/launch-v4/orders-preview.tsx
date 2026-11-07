"use client"

import { marketingAttrs } from "@/lib/marketing-interactions"
import { useState } from "react"

import { BrandMark, Icon } from "./icons"

const searchable = [
  "ord–06128 oct, 21:05amina belloeggscompletedpaidtotal₦19,500.00",
  "ord–06026 oct, 18:20walk-inlayer feedcompletedpaidtotal₦18,500.00",
  "ord–05926 oct, 14:41amina belloflock health visitconfirmedpaidtotal₦2,000.00",
  "ord–05826 oct, 14:34walk-inbroiler chickencompletedunpaid · ₦9,000.00 duetotal₦9,000.00",
]
export function OrdersPreview() {
  const [query, setQuery] = useState("")
  return (
    <figure className="hero-product">
      <div
        className="product-screen real-dashboard"
        aria-label="EwaTrade implemented Orders screen"
      >
        <aside className="real-rail">
          <div className="real-logo">
            <BrandMark />
          </div>
          <span>
            <Icon name="building" />
          </span>
          <span>
            <Icon name="sparkles" />
          </span>
          <span>
            <Icon name="home" />
          </span>
          <span>
            <Icon name="chat" />
          </span>
          <span>
            <Icon name="package" />
          </span>
          <span>
            <Icon name="store" />
          </span>
          <span>
            <Icon name="book" />
          </span>
          <span className="active">
            <Icon name="cart" />
          </span>
          <span>
            <Icon name="userCircle" />
          </span>
          <span>
            <Icon name="chart" />
          </span>
        </aside>
        <div className="real-desk-main">
          <div className="real-topbar">
            <span>
              <Icon name="search" />
              Find anything...
            </span>
            <div>
              <Icon name="bell" />
              <span className="real-avatar">JP</span>
            </div>
          </div>
          <div className="real-page">
            <p className="product-eyebrow">Jawdah Poultry</p>
            <div className="product-title">Orders</div>
            <p className="product-description">
              Track every order, payment and delivery in one place.
            </p>
            <div className="real-toolbar">
              <label className="real-search">
                <Icon name="search" />
                <input
                  id="order-search"
                  placeholder="Search orders..."
                  aria-label="Search preview orders"
                  {...marketingAttrs("search", "hero", "orders")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Icon name="sliders" />
              </label>
              <div>
                <span className="product-button">
                  <Icon name="chevronDown" />
                  Newest first
                </span>
                <span className="product-button">
                  <Icon name="grid" />
                  Grid
                </span>
                <span className="product-button">
                  <Icon name="plus" />
                </span>
              </div>
            </div>
            <div className="select-row">
              <span className="square-check" />
              <span>Select all</span>
              <span className="product-muted">4 orders shown</span>
            </div>
            <div className="real-order-grid">
              <article
                className="real-order-card"
                hidden={
                  !"ord–06128 oct, 21:05amina belloeggscompletedpaidtotal₦19,500.00".includes(
                    query.trim().toLocaleLowerCase(),
                  )
                }
              >
                <div className="order-card-top">
                  <span className="square-check" />
                  <strong>ORD–061</strong>
                  <span>28 Oct, 21:05</span>
                  <Icon name="more" />
                </div>
                <div className="order-card-body">
                  <strong>Amina Bello</strong>
                  <p>Eggs</p>
                  <div>
                    <span className="product-pill ok">Completed</span>
                    <span className="product-pill ok">Paid</span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦19,500.00</strong>
                </div>
              </article>
              <article
                className="real-order-card"
                hidden={
                  !"ord–06026 oct, 18:20walk-inlayer feedcompletedpaidtotal₦18,500.00".includes(
                    query.trim().toLocaleLowerCase(),
                  )
                }
              >
                <div className="order-card-top">
                  <span className="square-check" />
                  <strong>ORD–060</strong>
                  <span>26 Oct, 18:20</span>
                  <Icon name="more" />
                </div>
                <div className="order-card-body">
                  <strong>Walk-in</strong>
                  <p>Layer feed</p>
                  <div>
                    <span className="product-pill ok">Completed</span>
                    <span className="product-pill ok">Paid</span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦18,500.00</strong>
                </div>
              </article>
              <article
                className="real-order-card"
                hidden={
                  !"ord–05926 oct, 14:41amina belloflock health visitconfirmedpaidtotal₦2,000.00".includes(
                    query.trim().toLocaleLowerCase(),
                  )
                }
              >
                <div className="order-card-top">
                  <span className="square-check" />
                  <strong>ORD–059</strong>
                  <span>26 Oct, 14:41</span>
                  <Icon name="more" />
                </div>
                <div className="order-card-body">
                  <strong>Amina Bello</strong>
                  <p>Flock health visit</p>
                  <div>
                    <span className="product-pill info">Confirmed</span>
                    <span className="product-pill ok">Paid</span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦2,000.00</strong>
                </div>
              </article>
              <article
                className="real-order-card"
                hidden={
                  !"ord–05826 oct, 14:34walk-inbroiler chickencompletedunpaid · ₦9,000.00 duetotal₦9,000.00".includes(
                    query.trim().toLocaleLowerCase(),
                  )
                }
              >
                <div className="order-card-top">
                  <span className="square-check" />
                  <strong>ORD–058</strong>
                  <span>26 Oct, 14:34</span>
                  <Icon name="more" />
                </div>
                <div className="order-card-body">
                  <strong>Walk-in</strong>
                  <p>Broiler chicken</p>
                  <div>
                    <span className="product-pill ok">Completed</span>
                    <span className="product-pill warn">
                      Unpaid · ₦9,000.00 due
                    </span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦9,000.00</strong>
                </div>
              </article>
            </div>
            <p
              id="order-empty"
              hidden={searchable.some((text) =>
                text.includes(query.trim().toLocaleLowerCase()),
              )}
            >
              No orders match your search.
            </p>
          </div>
        </div>
      </div>
      <figcaption>Example business · illustrative records</figcaption>
    </figure>
  )
}
