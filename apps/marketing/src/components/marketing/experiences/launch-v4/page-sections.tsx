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
        Products, services, orders, stock and money. <br />
        All connected to the work you do every day.
      </p>
      <div className="suite-grid">
        <a className="suite-feature" href="#journey" data-jump-step="0">
          <span className="suite-icon">
            <Icon name="store" />
          </span>
          <strong>Storefront</strong>
          <span>Your products and services</span>
        </a>
        <a className="suite-feature" href="#journey" data-jump-step="2">
          <span className="suite-icon">
            <Icon name="cart" />
          </span>
          <strong>Orders</strong>
          <span>From request to fulfilment</span>
        </a>
        <a className="suite-feature" href="#journey" data-jump-step="1">
          <span className="suite-icon">
            <Icon name="book" />
          </span>
          <strong>Quotes &amp; services</strong>
          <span>Scope, price and service work</span>
        </a>
        <a className="suite-feature" href="#workspace">
          <span className="suite-icon">
            <Icon name="package" />
          </span>
          <strong>Stock</strong>
          <span>Units, availability and history</span>
        </a>
        <a className="suite-feature" href="#workspace">
          <span className="suite-icon">
            <Icon name="users" />
          </span>
          <strong>Customers</strong>
          <span>Balances and statements</span>
        </a>
        <a className="suite-feature" href="#journey" data-jump-step="3">
          <span className="suite-icon">
            <Icon name="wallet" />
          </span>
          <strong>Finance</strong>
          <span>Accounts, expenses and payments</span>
        </a>
        <a className="suite-feature" href="#workspace">
          <span className="suite-icon">
            <Icon name="building" />
          </span>
          <strong>Team</strong>
          <span>Roles and store access</span>
        </a>
        <a className="suite-feature" href="#journey" data-jump-step="4">
          <span className="suite-icon">
            <Icon name="chart" />
          </span>
          <strong>Reports</strong>
          <span>Sales and business performance</span>
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
            The small things matter: the unit you sell in, who has access, and
            the balance that is still outstanding.
          </p>
        </div>
        <div className="workspace-grid">
          <div className="workspace-copy">
            <div>
              <h3>Count it the way you sell it.</h3>
              <p>
                Pieces, trays, bags and cartons. Track stock in its own unit,
                see what is held for orders and check an item's history when a
                number needs explaining.
              </p>
            </div>
            <div>
              <h3>Give everyone their part.</h3>
              <p>
                Assign staff to stores and give them the access they need. Sales
                reps can see their own sales while you keep the whole business
                in view.
              </p>
            </div>
            <div>
              <h3>Keep every customer's account.</h3>
              <p>
                See debts, payments and paid-ahead balances together. Share a
                statement when it is time to settle up.
              </p>
            </div>
          </div>
          <figure className="workspace-proof">
            <div className="product-screen inventory-real">
              <p className="product-eyebrow">Jawdah Poultry QA</p>
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
                      <td>Jawdah Poultry QA</td>
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
                      <td>Jawdah Poultry QA</td>
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
          <summary data-marketing-action="faq" data-marketing-channel="faq">
            Can I sell products and services?<span aria-hidden="true">+</span>
          </summary>
          <p>
            Yes. Keep both in your catalog. Products can have units and choices;
            services can have a fixed price or require a quote.
          </p>
        </details>
        <details>
          <summary data-marketing-action="faq" data-marketing-channel="faq">
            Is a paid order marked as delivered?
            <span aria-hidden="true">+</span>
          </summary>
          <p>
            No. Payment and fulfilment are tracked separately. A paid order can
            still be waiting to be prepared or delivered.
          </p>
        </details>
        <details>
          <summary data-marketing-action="faq" data-marketing-channel="faq">
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
          <summary data-marketing-action="faq" data-marketing-channel="faq">
            Is the mobile app available?<span aria-hidden="true">+</span>
          </summary>
          <p>
            The native mobile app, including offline sales, is coming soon. The
            web dashboard works in your computer or phone browser and needs an
            internet connection.
          </p>
        </details>
        <details>
          <summary data-marketing-action="faq" data-marketing-channel="faq">
            How do paid plans work?<span aria-hidden="true">+</span>
          </summary>
          <p>
            Paid plans are monthly. Contact us to activate one. Every plan
            includes a monthly assistant allowance. Customer messaging is a
            separate feature on Growth and Pro.
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
          channel="hero"
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
              {...marketingAttrs("navigation", "footer")}
              href="#journey"
              data-jump-step="0"
            >
              Storefront
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
              href="#journey"
              data-jump-step="2"
            >
              Orders
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
              href="#journey"
              data-jump-step="1"
            >
              Quotes &amp; services
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="#workspace">
              Stock &amp; customers
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
              href="#journey"
              data-jump-step="4"
            >
              Reports
            </a>
          </div>
          <div className="foot-column">
            <h3>Product</h3>
            <a {...marketingAttrs("navigation", "footer")} href="#journey">
              How it works
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="#assistant">
              WhatsApp
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
              href="#mobile-preview"
            >
              Mobile app
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="#businesses">
              Businesses
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="#pricing">
              Pricing
            </a>
          </div>
          <div className="foot-column">
            <h3>Company</h3>
            <a {...marketingAttrs("navigation", "footer")} href="/contact">
              Contact
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="/support">
              Support
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="#questions">
              Questions
            </a>
          </div>
          <div className="foot-column">
            <h3>Legal</h3>
            <a {...marketingAttrs("navigation", "footer")} href="/terms">
              Terms
            </a>
            <a {...marketingAttrs("navigation", "footer")} href="/privacy">
              Privacy
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
              href="/billing-policy"
            >
              Billing policy
            </a>
            <a
              {...marketingAttrs("navigation", "footer")}
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
          <span>Product previews use example records.</span>
          <a {...marketingAttrs("navigation", "footer")} href="#top">
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
