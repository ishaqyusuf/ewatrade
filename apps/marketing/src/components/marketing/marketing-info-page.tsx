import "./experiences/shop-v3.css"

export function MarketingInfoPage({ kind }: { kind: "contact" | "support" }) {
  const support = kind === "support"
  return (
    <div className="shop-v3 shop-info-page">
      <header className="shop-header shop-wrap">
        <a href="/" aria-label="EwaTrade home">
          <img
            className="shop-brand"
            src="/brand/ewatrade-logo-precision-rise-v1.svg"
            alt="ẸwáTrade"
            width="548"
            height="120"
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
              : "Share a little about the work you want to connect. Ask about Growth or Pro here too — they are free during launch."}
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
            <h2>Ready to start?</h2>
            <p>
              You can <a href="/#pricing">create your store</a> yourself in a
              few minutes. The Free plan is free forever.
            </p>
          </section>
        )}
      </main>
      <footer className="shop-footer shop-wrap">
        <a href="/" aria-label="EwaTrade home">
          <img
            className="shop-brand"
            src="/brand/ewatrade-logo-precision-rise-v1.svg"
            alt="ẸwáTrade"
            width="548"
            height="120"
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
