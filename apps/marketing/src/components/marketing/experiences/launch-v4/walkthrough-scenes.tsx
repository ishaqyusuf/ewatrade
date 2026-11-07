"use client"

import { Icon } from "./icons"

export function WalkScene0() {
  return (
    <div
      className="walk-panel is-active"
      role="tabpanel"
      id="walk-panel-0"
      aria-labelledby="walk-tab-0"
    >
      <div className="product-screen ui-scene storefront-real">
        <div className="public-store-head">
          <strong>Jawdah Poultry</strong>
          <Icon name="cart" />
        </div>
        <div className="public-store-tabs">
          <b>Home</b>
          <span>Shop</span>
          <span>Services</span>
        </div>
        <div className="public-store-copy">
          <strong>
            Eggs, layers <br />
            and broilers
          </strong>
          <p>
            Browse Jawdah’s current poultry and egg listings. Choose an item and
            send your request for the business to review.
          </p>
        </div>
        <div className="public-store-actions">
          <b>Shop now</b>
          <span>See services</span>
        </div>
        <div className="public-store-notes">
          <div>
            <Icon name="package" />
            <span>Delivery details and cost are confirmed after review.</span>
          </div>
          <div>
            <Icon name="chat" />
            <span>
              You send a request; the business confirms with you before you pay.
            </span>
          </div>
        </div>
      </div>
      <p className="walk-truth">You confirm the details before they pay.</p>
    </div>
  )
}
export function WalkScene1() {
  return (
    <div
      className="walk-panel is-active"
      role="tabpanel"
      id="walk-panel-1"
      aria-labelledby="walk-tab-1"
    >
      <div className="product-screen ui-scene real-sheet">
        <div className="sheet-back">
          <Icon name="chevronLeft" /> Back
        </div>
        <div className="sheet-title">Prepare quote</div>
        <p className="product-muted">Amina Bello · Flock health visit</p>
        <div className="quote-service">
          <strong>Flock health visit</strong>
          <p>How many: 1 visit</p>
          <div className="illustration-label ">Price each</div>
          <div className="real-input">
            ₦ <span>2,000</span>
          </div>
        </div>
        <div className="illustration-label ">What the price covers</div>
        <div className="real-textarea">
          One flock health visit and a written summary.
        </div>
        <div className="illustration-label ">
          Price is good until <span className="product-muted">(optional)</span>
        </div>
        <div className="real-input">dd/mm/yyyy</div>
        <span className="real-green-button">Create quote · ₦2,000.00</span>
      </div>
      <p className="walk-truth">
        A preferred date is a request until you confirm it.
      </p>
    </div>
  )
}
export function WalkScene2() {
  return (
    <div
      className="walk-panel is-active"
      role="tabpanel"
      id="walk-panel-2"
      aria-labelledby="walk-tab-2"
    >
      <div className="product-screen ui-scene real-sheet">
        <div className="sheet-title">ORD–061</div>
        <p className="product-muted">
          Amina Bello · created 28 Oct 2026, 21:05
        </p>
        <div className="order-badges">
          <span className="product-pill ok">Paid</span>
          <span className="product-pill ok">Fulfilled</span>
        </div>
        <div className="order-summary-strip">
          <div>
            <span>TOTAL</span>
            <b>₦19,500</b>
          </div>
          <div>
            <span>PAID</span>
            <b>₦19,500</b>
          </div>
          <div>
            <span>BALANCE</span>
            <b>₦0</b>
          </div>
        </div>
        <div className="real-panel">
          <div className="panel-heading">Items</div>
          <div className="order-item">
            <strong>
              Eggs <small>Small · Crate</small>
            </strong>
            <span>4 × ₦4,500.00</span>
            <span className="product-pill ok">Fulfilled</span>
          </div>
          <div className="product-pair">
            <span>Subtotal</span>
            <strong>₦18,000.00</strong>
          </div>
          <div className="product-pair">
            <span>Service charge</span>
            <strong>₦1,500.00</strong>
          </div>
          <div className="product-pair">
            <span>Total</span>
            <strong>₦19,500.00</strong>
          </div>
        </div>
      </div>
      <p className="walk-truth">
        Payment and fulfilment keep their own status.
      </p>
    </div>
  )
}
export function WalkScene3() {
  return (
    <div
      className="walk-panel is-active"
      role="tabpanel"
      id="walk-panel-3"
      aria-labelledby="walk-tab-3"
    >
      <div className="product-screen ui-scene real-sheet">
        <div className="product-title">Finance</div>
        <div className="real-panel">
          <div className="panel-heading">
            Money accounts <span>View accounts</span>
          </div>
          <div className="product-pair">
            <span>Cash</span>
            <strong>₦62,500.00</strong>
          </div>
          <div className="product-pair">
            <span>Business bank</span>
            <strong>₦184,000.00</strong>
          </div>
        </div>
        <div className="real-panel">
          <div className="panel-heading">
            Who owes what <span>View balances</span>
          </div>
          <div className="product-pair">
            <span>Customers owe you</span>
            <strong>₦45,000.00</strong>
          </div>
          <div className="product-pair">
            <span>You owe suppliers</span>
            <strong>₦18,500.00</strong>
          </div>
        </div>
        <div className="real-panel">
          <div className="panel-heading">Recent spending</div>
          <div className="product-pair">
            <span>Delivery expense</span>
            <strong>₦2,500.00</strong>
          </div>
        </div>
      </div>
      <p className="walk-truth">You confirm bank transfers yourself.</p>
    </div>
  )
}
export function WalkScene4() {
  return (
    <div
      className="walk-panel is-active"
      role="tabpanel"
      id="walk-panel-4"
      aria-labelledby="walk-tab-4"
    >
      <div className="product-screen ui-scene real-sheet report-real">
        <p className="product-eyebrow">Jawdah Poultry · Main store</p>
        <div className="product-title">Reports</div>
        <p className="product-description">
          How sales, stock and service jobs are going at Jawdah Poultry.
        </p>
        <div className="report-date-controls">
          <span className="product-button">
            <Icon name="chevronDown" />
            Last 30 days · 30 Sep – 29 Oct
          </span>
          <span className="product-button">
            <Icon name="download" />
            Download CSV
          </span>
        </div>
        <div className="real-report-metrics">
          <div>
            <span>Orders</span>
            <strong>34</strong>
          </div>
          <div>
            <span>Sales</span>
            <strong>₦682,500</strong>
          </div>
          <div>
            <span>Service sales</span>
            <strong>₦110,000</strong>
          </div>
          <div>
            <span>Services sold</span>
            <strong>12</strong>
          </div>
        </div>
        <div className="real-panel">
          <div className="panel-heading">Sales by day</div>
          <div className="report-key">
            <span>● Products</span>
            <span>● Services</span>
          </div>
          <div
            className="sales-chart stacked"
            role="img"
            aria-label="Example product and service sales stacked by date"
          >
            <div>
              <span className="stacked-bar" style={{ height: "55px" }}>
                <i style={{ height: "15px" }} />
                <b style={{ height: "40px" }} />
              </span>
              <small>23 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "84px" }}>
                <i style={{ height: "21px" }} />
                <b style={{ height: "63px" }} />
              </span>
              <small>24 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "80px" }}>
                <i style={{ height: "30px" }} />
                <b style={{ height: "50px" }} />
              </span>
              <small>25 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "110px" }}>
                <i style={{ height: "30px" }} />
                <b style={{ height: "80px" }} />
              </span>
              <small>26 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "91px" }}>
                <i style={{ height: "18px" }} />
                <b style={{ height: "73px" }} />
              </span>
              <small>27 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "130px" }}>
                <i style={{ height: "35px" }} />
                <b style={{ height: "95px" }} />
              </span>
              <small>28 Oct</small>
            </div>
            <div>
              <span className="stacked-bar" style={{ height: "109px" }}>
                <i style={{ height: "24px" }} />
                <b style={{ height: "85px" }} />
              </span>
              <small>29 Oct</small>
            </div>
          </div>
        </div>
        <div className="real-panel">
          <div className="panel-heading">Top sellers</div>
          <div className="product-pair">
            <span>Eggs</span>
            <strong>₦360,000</strong>
          </div>
          <div className="product-pair">
            <span>Layer feed</span>
            <strong>₦212,500</strong>
          </div>
        </div>
      </div>
      <p className="walk-truth">
        Review the business, then take a CSV with you.
      </p>
    </div>
  )
}
