"use client"

import type { ReactNode } from "react"

export function OwnerSignupFrame({
  children,
  wide = false,
  rail,
  name,
  slug,
  description,
}: {
  children: ReactNode
  wide?: boolean
  rail?: ReactNode
  name?: string
  slug?: string
  description?: string
}) {
  return (
    <div className={`owner-frame${wide ? " owner-frame-wide" : ""}`}>
      <div className="owner-form-panel">{children}</div>
      <aside
        className="owner-preview"
        aria-label={wide ? "Your setup summary" : "Your store preview"}
      >
        <img
          className="owner-preview-mark"
          src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
          alt=""
        />
        {wide ? (
          rail
        ) : (
          <div className="owner-store-preview">
            <p className="owner-preview-eyebrow">YOUR FREE STORE LINK</p>
            <p className="owner-preview-domain">
              {slug || "your-business"}.ewatrade.com
            </p>
            <div className="owner-store-window">
              <div className="owner-store-browser">
                <span />
                <span />
                <span />
                <small>Store preview</small>
              </div>
              <div className="owner-store-banner" />
              <div className="owner-store-body">
                <span className="owner-store-avatar">
                  {name?.trim().slice(0, 1).toUpperCase() || "E"}
                </span>
                <h2>{name?.trim() || "Your business"}</h2>
                <p>
                  {description?.trim() ||
                    "Your corner of the internet. Ready for your first customers."}
                </p>
                <div className="owner-sample-items">
                  {[
                    "Your first item",
                    "Another favourite",
                    "One more to love",
                  ].map((label, index) => (
                    <div key={label}>
                      <span>{["◇", "○", "▱"][index]}</span>
                      <small>{label}</small>
                    </div>
                  ))}
                </div>
                <p className="owner-preview-limit">
                  First 3 items free · More room with Growth or Pro
                </p>
              </div>
            </div>
            <p className="owner-preview-note">
              Illustrative preview. Your actual catalogue starts empty.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
