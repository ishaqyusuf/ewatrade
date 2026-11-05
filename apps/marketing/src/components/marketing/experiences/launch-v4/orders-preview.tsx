"use client"

import { useState } from "react"

import { BrandMark, Icon } from "./icons"

const searchable = [
  "ord–06128 oct, 21:05jawdah qa customereggscompletedpaidtotal₦19,500.00",
  "ord–06026 oct, 18:20walk-inmanual payment qa 26 octcompletedpaidtotal₦1,000.00",
  "ord–05926 oct, 14:41walk-infca-20261026 inspection visitconfirmedpaidtotal₦2,000.00",
  "ord–05826 oct, 14:34walk-infca-20261026 notebookcompletedunpaid · ₦600.00 duetotal₦600.00",
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
              <span className="real-avatar">JQ</span>
            </div>
          </div>
          <div className="real-page">
            <p className="product-eyebrow">Jawdah Poultry QA</p>
            <div className="product-title">Orders</div>
            <p className="product-description">
              Products and Services share one immutable order record.
            </p>
            <div className="real-toolbar">
              <label className="real-search">
                <Icon name="search" />
                <input
                  id="order-search"
                  placeholder="Search orders..."
                  aria-label="Search preview orders"
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
              <span className="product-muted">25 orders loaded</span>
            </div>
            <div className="real-order-grid">
              <article
                className="real-order-card"
                hidden={
                  !"ord–06128 oct, 21:05jawdah qa customereggscompletedpaidtotal₦19,500.00".includes(
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
                  <strong>Jawdah QA Customer</strong>
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
                  !"ord–06026 oct, 18:20walk-inmanual payment qa 26 octcompletedpaidtotal₦1,000.00".includes(
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
                  <p>Manual payment QA 26 Oct</p>
                  <div>
                    <span className="product-pill ok">Completed</span>
                    <span className="product-pill ok">Paid</span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦1,000.00</strong>
                </div>
              </article>
              <article
                className="real-order-card"
                hidden={
                  !"ord–05926 oct, 14:41walk-infca-20261026 inspection visitconfirmedpaidtotal₦2,000.00".includes(
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
                  <strong>Walk-in</strong>
                  <p>FCA-20261026 Inspection visit</p>
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
                  !"ord–05826 oct, 14:34walk-infca-20261026 notebookcompletedunpaid · ₦600.00 duetotal₦600.00".includes(
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
                  <p>FCA-20261026 Notebook</p>
                  <div>
                    <span className="product-pill ok">Completed</span>
                    <span className="product-pill warn">
                      Unpaid · ₦600.00 due
                    </span>
                  </div>
                </div>
                <div className="order-card-total">
                  <span>Total</span>
                  <strong>₦600.00</strong>
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
      <figcaption>Product preview · existing QA records</figcaption>
    </figure>
  )
}
