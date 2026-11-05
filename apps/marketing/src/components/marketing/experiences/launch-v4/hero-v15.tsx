"use client"

import { WebSignupCta } from "./cta"

import { OrdersPreview } from "./orders-preview"

export function HeroV15({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <section className="hero wrap">
      <div className="hero-copy">
        <h1>
          Your whole business, <br />
          from request to paid.
        </h1>
        <div className="hero-side">
          <p className="lead">
            Sell products, quote for services and keep orders, stock and money
            in one place.
          </p>
          <div className="hero-actions">
            <WebSignupCta
              signupEnabled={signupEnabled}
              channel="hero"
              className="button primary"
            />
          </div>
          <p className="fine">
            Start free. No card needed. Works in your browser.
          </p>
        </div>
      </div>
      <OrdersPreview />
    </section>
  )
}
