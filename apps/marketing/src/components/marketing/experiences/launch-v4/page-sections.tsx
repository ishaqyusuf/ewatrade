"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"

import { WebSignupCta } from "./cta"
import { Icon } from "./icons"

export function FeatureSuite() {
  return (
    <section className="suite wrap" id="features">
      <h2>
        Everything you need <br />
        to run your business.
      </h2>
      <p>
        From the first customer request to the last payment, <br />
        keep the work and its records together.
      </p>
      <div className="suite-grid">
        <a
          {...marketingAttrs("navigation", "features", "storefront")}
          className="suite-feature"
          href="#journey"
          data-jump-step="0"
        >
          <span className="suite-icon">
            <Icon name="store" />
          </span>
          <strong>Storefront</strong>
          <span>Let customers browse and request</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "orders")}
          className="suite-feature"
          href="#journey"
          data-jump-step="2"
        >
          <span className="suite-icon">
            <Icon name="cart" />
          </span>
          <strong>Orders</strong>
          <span>Know what needs fulfilling</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "quotes")}
          className="suite-feature"
          href="#journey"
          data-jump-step="1"
        >
          <span className="suite-icon">
            <Icon name="book" />
          </span>
          <strong>Quotes &amp; services</strong>
          <span>Agree the work and its price</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "stock")}
          className="suite-feature"
          href="#stock-detail"
        >
          <span className="suite-icon">
            <Icon name="package" />
          </span>
          <strong>Stock</strong>
          <span>Know what is free to sell</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "customers")}
          className="suite-feature"
          href="#customers-detail"
        >
          <span className="suite-icon">
            <Icon name="users" />
          </span>
          <strong>Customers</strong>
          <span>See who owes you what</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "finance")}
          className="suite-feature"
          href="#journey"
          data-jump-step="3"
        >
          <span className="suite-icon">
            <Icon name="wallet" />
          </span>
          <strong>Finance</strong>
          <span>Follow money in and out</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "team")}
          className="suite-feature"
          href="#team-detail"
        >
          <span className="suite-icon">
            <Icon name="building" />
          </span>
          <strong>Team</strong>
          <span>Give staff the right access</span>
        </a>
        <a
          {...marketingAttrs("navigation", "features", "reports")}
          className="suite-feature"
          href="#journey"
          data-jump-step="4"
        >
          <span className="suite-icon">
            <Icon name="chart" />
          </span>
          <strong>Reports</strong>
          <span>See what sells and when</span>
        </a>
      </div>
    </section>
  )
}
export function WorkspaceSection() {
  return (
    <section className="workspace-section" id="workspace">
      <div className="wrap">
        <div className="section-head">
          <h2>
            The details stay <br />
            with the business.
          </h2>
          <p>
            Know what you can sell, what your team can do and what each customer
            owes.
          </p>
        </div>
        <div className="workspace-grid">
          <div className="workspace-copy">
            <div id="stock-detail">
              <h3>Count it the way you sell it.</h3>
              <p>
                Count pieces, trays, bags or cartons. See what is available,
                what is held for orders and how the balance changed.
              </p>
            </div>
            <div id="team-detail">
              <h3>Give everyone their part.</h3>
              <p>
                Give staff access to the stores and tasks they need. Sales reps
                see their own sales; you keep the whole business in view.
              </p>
            </div>
            <div id="customers-detail">
              <h3>Keep every customer's account.</h3>
              <p>
                Keep debts, payments and customer credit together. Share a
                statement when it is time to settle up.
              </p>
            </div>
          </div>
          <figure className="workspace-proof">
            <div className="product-screen inventory-real">
              <p className="product-eyebrow">Jawdah Poultry</p>
              <div className="product-title">Inventory</div>
              <p className="product-description">
                What you have in each store and what you can sell.
              </p>
              <div className="inventory-controls">
                <span className="real-search">
                  <Icon name="search" />
                  Search products...
                </span>
                <div>
                  <span className="product-button">Columns</span>
                  <span className="product-button">
                    <Icon name="grid" />
                    <span className="table-label">Table</span>
                    <span className="grid-label">Grid</span>
                  </span>
                  <span className="real-green-button">Update stock</span>
                </div>
              </div>
              <div className="stock-filters">
                <b>All stock</b>
                <span>Running low</span>
                <span>Held for orders</span>
                <span>Out of stock</span>
              </div>
              <div className="product-tabs">
                <b>Stock</b>
                <span>History</span>
                <span>Transfers</span>
              </div>
              <div className="inventory-summary">
                <div>
                  <span>Products you can sell</span>
                  <strong>18</strong>
                  <p>Have stock that is not held for orders</p>
                </div>
                <div>
                  <span>Running low</span>
                  <strong>2</strong>
                  <p>2 products are at or under their low-stock level</p>
                </div>
                <div>
                  <span>Held for orders</span>
                  <strong>3</strong>
                  <p>3 products have stock set aside</p>
                </div>
                <div>
                  <span>Out of stock</span>
                  <strong>2</strong>
                  <p>2 products have none to sell</p>
                </div>
              </div>
              <div className="select-row">
                <span className="square-check" />
                <span>Select all shown stock</span>
                <span className="product-muted">2 shown</span>
              </div>
              <div className="stock-table">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <span className="square-check" />
                      </th>
                      <th>Product</th>
                      <th>Store</th>
                      <th>In stock</th>
                      <th>Held for orders</th>
                      <th>Free to sell</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <span className="square-check" />
                      </td>
                      <td>
                        <strong>Eggs</strong>
                        <small>Small · Crate</small>
                      </td>
                      <td>Jawdah Poultry</td>
                      <td>120 crates</td>
                      <td>12 crates</td>
                      <td>
                        <b>108 crates</b>
                      </td>
                      <td>
                        <span className="product-pill ok">Available</span>
                      </td>
                      <td>
                        <Icon name="more" />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="square-check" />
                      </td>
                      <td>
                        <strong>Layer feed</strong>
                        <small>Bag</small>
                      </td>
                      <td>Jawdah Poultry</td>
                      <td>40 bags</td>
                      <td>—</td>
                      <td>
                        <b>40 bags</b>
                      </td>
                      <td>
                        <span className="product-pill ok">Available</span>
                      </td>
                      <td>
                        <Icon name="more" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="stock-grid">
                <article className="stock-grid-card">
                  <div>
                    <span>
                      <strong>Eggs</strong>
                      <small>Small · Crate</small>
                    </span>
                    <span className="square-check" />
                    <Icon name="more" />
                  </div>
                  <span className="product-pill ok">Available</span>
                  <dl>
                    <div>
                      <dt>In stock</dt>
                      <dd>120 crates</dd>
                    </div>
                    <div>
                      <dt>Free to sell</dt>
                      <dd>
                        <b>108 crates</b>
                      </dd>
                    </div>
                  </dl>
                </article>
                <article className="stock-grid-card">
                  <div>
                    <span>
                      <strong>Layer feed</strong>
                      <small>Bag</small>
                    </span>
                    <span className="square-check" />
                    <Icon name="more" />
                  </div>
                  <span className="product-pill ok">Available</span>
                  <dl>
                    <div>
                      <dt>In stock</dt>
                      <dd>40 bags</dd>
                    </div>
                    <div>
                      <dt>Free to sell</dt>
                      <dd>
                        <b>40 bags</b>
                      </dd>
                    </div>
                  </dl>
                </article>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  )
}
export function FaqV15() {
  return (
    <section className="faq-section wrap" id="questions">
      <h2>
        A few things <br />
        worth knowing.
      </h2>
      <div className="faq">
        <details>
          <summary {...marketingAttrs("faq", "faq", "catalog")}>
            Can I sell products and services?<span aria-hidden="true">+</span>
          </summary>
          <p>
            Yes. Keep both in your catalog. Products can have units and choices;
            services can have a fixed price or require a quote.
          </p>
        </details>
        <details>
          <summary {...marketingAttrs("faq", "faq", "fulfilment")}>
            Is a paid order marked as delivered?
            <span aria-hidden="true">+</span>
          </summary>
          <p>
            No. Payment and fulfilment are tracked separately. A paid order can
            still be waiting to be prepared or delivered.
          </p>
        </details>
        <details>
          <summary {...marketingAttrs("faq", "faq", "approval")}>
            Can the assistant change my records on its own?
            <span aria-hidden="true">+</span>
          </summary>
          <p>
            Changes wait for your review and confirmation. The assistant can
            answer questions and prepare supported drafts; it does not confirm
            bank transfers for you.
          </p>
        </details>
        <details>
          <summary {...marketingAttrs("faq", "faq", "mobile")}>
            Is the mobile app available?<span aria-hidden="true">+</span>
          </summary>
          <p>
            The native mobile app, including offline sales, is coming soon. The
            web dashboard works in your computer or phone browser and needs an
            internet connection.
          </p>
        </details>
        <details>
          <summary {...marketingAttrs("faq", "faq", "plans")}>
            How do paid plans work?<span aria-hidden="true">+</span>
          </summary>
          <p>
            Choose a plan, then contact us to activate it. Prices are monthly.
            Each plan includes assistant use for questions and drafts; confirm
            the allowance with us before upgrading. Customer messaging is a
            separate Growth and Pro feature.
          </p>
        </details>
      </div>
    </section>
  )
}
export function ClosingV15({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <section className="closing wrap" id="start">
      <h2>
        Good business. <br />
        Less busywork.
      </h2>
      <div>
        <p>
          Start with one business, ten catalog items <br />
          and fifty orders a month.
        </p>
        <WebSignupCta
          signupEnabled={signupEnabled}
          channel="closing"
          className="button primary"
        />
      </div>
    </section>
  )
}
export function FooterV15({
  dark,
  onToggleTheme,
}: {
  dark: boolean
  onToggleTheme: () => void
}) {
  return (
    <footer className="site-footer" id="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-column">
            <h3>Features</h3>
            <a
              {...marketingAttrs("navigation", "footer", "storefront")}
              href="#journey"
              data-jump-step="0"
            >
              Storefront
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "orders")}
              href="#journey"
              data-jump-step="2"
            >
              Orders
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "quotes")}
              href="#journey"
              data-jump-step="1"
            >
              Quotes &amp; services
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "stock")}
              href="#workspace"
            >
              Stock &amp; customers
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "reports")}
              href="#journey"
              data-jump-step="4"
            >
              Reports
            </a>
          </div>
          <div className="foot-column">
            <h3>Product</h3>
            <a
              {...marketingAttrs("navigation", "footer", "journey")}
              href="#journey"
            >
              How it works
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "whatsapp")}
              href="#assistant"
            >
              WhatsApp
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "mobile")}
              href="#mobile-preview"
            >
              Mobile app
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "businesses")}
              href="#businesses"
            >
              Businesses
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "pricing")}
              href="#pricing"
            >
              Pricing
            </a>
          </div>
          <div className="foot-column">
            <h3>Company</h3>
            <a
              {...marketingAttrs("navigation", "footer", "contact")}
              href="/contact"
            >
              Contact
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "support")}
              href="/support"
            >
              Support
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "faq")}
              href="#questions"
            >
              Questions
            </a>
          </div>
          <div className="foot-column">
            <h3>Legal</h3>
            <a
              {...marketingAttrs("navigation", "footer", "terms")}
              href="/terms"
            >
              Terms
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "privacy")}
              href="/privacy"
            >
              Privacy
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "billing_policy")}
              href="/billing-policy"
            >
              Billing policy
            </a>
            <a
              {...marketingAttrs("navigation", "footer", "delete_account")}
              href="/delete-account"
            >
              Delete account
            </a>
          </div>
          <div className="foot-statement">
            <p className="foot-tagline">Come. Trade. Together.</p>
            <p>
              One place for the business <br />
              you are building.
            </p>
            <button
              className="footer-theme"
              id="footer-theme"
              {...marketingAttrs("theme", "footer", dark ? "light" : "dark")}
              onClick={onToggleTheme}
              aria-label={
                dark ? "Switch to light theme" : "Switch to dark theme"
              }
              type="button"
            >
              Switch appearance
            </button>
          </div>
        </div>
        <div className="foot-base">
          <span>© 2026 EwaTrade</span>
          <span>
            Jawdah Poultry is an example business. All records shown are
            illustrative.
          </span>
          <a {...marketingAttrs("navigation", "footer", "home")} href="#top">
            Back to top ↑
          </a>
        </div>
        <div className="foot-wordmark" aria-hidden="true">
          ẸwáTrade
        </div>
      </div>
    </footer>
  )
}
