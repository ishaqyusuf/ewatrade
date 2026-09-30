import "./experiences/shop-v3.css"

export function MarketingInfoPage({ kind }: { kind: "contact" | "support" }) {
  const support = kind === "support"
  return (
    <div className="shop-v3 shop-info-page">
      <header className="shop-header shop-wrap">
        <a href="/" aria-label="EwaTrade home">
          <img
            className="shop-brand"
            src="/brand/ewatrade-logo.png"
            alt="EwaTrade"
            width="1140"
            height="300"
          />
        </a>
        <nav aria-label="Page navigation">
          <a href="/#story">How it connects</a>
          <a href="/#explore">Explore</a>
          <a href="/contact">Contact</a>
          <a href="/support">Support</a>
        </nav>
      </header>
      <main className="shop-info-main shop-wrap">
        <p className="shop-eyebrow">
          <span aria-hidden="true" />
          {support ? "EwaTrade support" : "Let’s talk"}
        </p>
        <h1>
          {support
            ? "How can we help?"
            : "Good trade starts with a conversation."}
        </h1>
        <p>
          {support
            ? "For account access, software billing or concerns about misuse of the platform, email the EwaTrade team."
            : "Tell us what your business is building. We can help you decide whether EwaTrade is a fit for your retail, service or multi-store work."}
        </p>
        <section>
          <h2>Email {support ? "support" : "the team"}</h2>
          <a href="mailto:founders@ewatrade.com">founders@ewatrade.com ↗</a>
          <p>
            {support
              ? "Include a short description of the issue and any error reference you received. Do not send passwords, one-time codes, full payment card details or prescription documents."
              : "Share a little about the work you want to connect. We will reply when the next early access window opens."}
          </p>
        </section>
        {support ? (
          <section>
            <h2>Orders and services</h2>
            <p>
              For a purchase, delivery, pickup, refund or appointment, contact
              the seller shown in your transaction. EwaTrade support can help
              with access to the platform itself.
            </p>
          </section>
        ) : (
          <section>
            <h2>Prefer a form?</h2>
            <p>
              The <a href="/#early-access">early access form</a> sends your
              request through our existing contact workflow.
            </p>
          </section>
        )}
      </main>
      <footer className="shop-footer shop-wrap">
        <a href="/" aria-label="EwaTrade home">
          <img
            className="shop-brand"
            src="/brand/ewatrade-logo.png"
            alt="EwaTrade"
            width="1140"
            height="300"
          />
        </a>
        <nav aria-label="Footer navigation">
          <a href="/">Home</a>
          <a href="/contact">Contact</a>
          <a href="/support">Support</a>
        </nav>
        <small>© {new Date().getFullYear()} EwaTrade</small>
      </footer>
    </div>
  )
}
