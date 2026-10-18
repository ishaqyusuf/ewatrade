"use client"

import {
  BUSINESS_TYPE_GROUPS,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import { type ReactNode, useEffect, useState } from "react"
import { getMarketingUrl } from "../../lib/signup-navigation"
import { OwnerBusinessAvatar, OwnerSignupIcon } from "./owner-signup-artwork"
import "../../styles/owner-signup-reference.css"

export function OwnerSignupFrame({
  children,
  wide = false,
  rail,
  name,
  slug,
  description,
  typeKeys = [],
  otherType,
  address,
  operatingModel,
  planId = "starter",
  step = "account",
}: {
  children: ReactNode
  wide?: boolean
  rail?: ReactNode
  name?: string
  slug?: string
  description?: string
  typeKeys?: string[]
  otherType?: string
  address?: string
  operatingModel?: string
  planId?: string
  step?: "account" | "code" | "type" | "group" | "store" | "home"
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const update = () => setTheme(media.matches ? "dark" : "light")
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  const at =
    step === "account" || step === "code"
      ? 0
      : step === "type" || step === "group"
        ? 1
        : 2
  const businessType = findBusinessType(typeKeys[0])
  const tone = BUSINESS_TYPE_GROUPS.find(
    (group) => group.key === businessType?.group,
  )?.tone
  const examples =
    businessType && businessType.key !== "other"
      ? businessType.examples.split(/,\s*/).slice(0, 3)
      : ["Your first item", "Another item", "One more"]
  const upgraded = planId === "growth" || planId === "pro"
  return (
    <div className="owner-ref-win" data-theme={theme}>
      <div className={`owner-ref-app${wide ? " owner-ref-wide" : ""}`}>
        <section className="owner-ref-formpane" aria-label="Sign up">
          <header className="owner-ref-fp-head">
            <a href={getMarketingUrl()} aria-label="EwaTrade home">
              <img
                className="owner-ref-logo"
                src={`/brand/ewatrade-logo-precision-rise-v1${theme === "dark" ? "-reverse" : ""}.svg`}
                alt="ẸwáTrade"
              />
            </a>
            <span className="owner-ref-fp-signin">
              Already have an account?{" "}
              <a className="owner-ref-lnk" href="/login">
                Sign in
              </a>
            </span>
          </header>
          <div
            className={`owner-ref-fp-scroll${wide || step === "store" ? " owner-ref-with-footer" : ""}`}
          >
            <div className="owner-ref-fp-inner">
              {step !== "home" && (
                <nav className="owner-ref-prog" aria-label="Signup progress">
                  {["Account", "Business type", "Store"].map((label, index) => (
                    <span
                      className={
                        index < at
                          ? "owner-ref-done"
                          : index === at
                            ? "owner-ref-on"
                            : ""
                      }
                      key={label}
                      aria-current={index === at ? "step" : undefined}
                    >
                      <i>{index < at ? "✓" : index + 1}</i>
                      {label}
                    </span>
                  ))}
                </nav>
              )}
              {children}
            </div>
          </div>
        </section>
        <aside
          className={`owner-ref-greenpane${wide ? " owner-ref-rail" : ""}`}
          aria-label={wide ? "Your setup" : "Your store preview"}
        >
          <img
            className="owner-ref-gp-mark"
            src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
            alt=""
          />
          {wide ? (
            rail
          ) : (
            <>
              <span className="owner-ref-gp-pill">
                <OwnerSignupIcon name="store" />
                Free store link
              </span>
              <p className="owner-ref-gp-label">Your store, as you build it</p>
              <div className="owner-ref-sf" aria-label="Store page preview">
                <div className="owner-ref-sf-bar">
                  <i />
                  <i />
                  <i />
                  <span className="owner-ref-sf-url">
                    <OwnerSignupIcon name="lock" />
                    <span>
                      <b>{slug || "your-business"}</b>.ewatrade.com
                    </span>
                  </span>
                </div>
                <div className="owner-ref-sf-body">
                  <div className="owner-ref-sf-head">
                    <OwnerBusinessAvatar
                      typeKey={typeKeys[0]}
                      name={name}
                      size={46}
                    />
                    <div>
                      <b>{name?.trim() || "Your business"}</b>
                      <small>
                        {address || "Location not added"}
                        {operatingModel
                          ? ` · ${operatingModel === "products" ? "I sell" : operatingModel === "services" ? "I offer services" : "I sell and offer services"}`
                          : ""}
                      </small>
                    </div>
                    <span className="owner-ref-sf-msg">
                      <OwnerSignupIcon name="lock" />
                      Message us
                    </span>
                  </div>
                  <p className="owner-ref-sf-about">
                    {description?.trim() || (
                      <span className="owner-ref-skel">
                        About this store shows here.
                      </span>
                    )}
                  </p>
                  {typeKeys.length > 0 && (
                    <div className="owner-ref-sf-tags">
                      {typeKeys.map((key) => (
                        <span key={key}>
                          {key === "other" && otherType
                            ? otherType
                            : findBusinessType(key)?.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="owner-ref-sf-items">
                    {examples.map((example) => (
                      <div className="owner-ref-sf-item" key={example}>
                        <div
                          className="owner-ref-ph"
                          style={{
                            background: tone ? `var(--x-${tone})` : undefined,
                          }}
                        >
                          <OwnerBusinessAvatar
                            typeKey={typeKeys[0]}
                            size={44}
                          />
                        </div>
                        <b>
                          {example[0]?.toUpperCase()}
                          {example.slice(1)}
                        </b>
                        <small>Add a price</small>
                      </div>
                    ))}
                    <div className="owner-ref-sf-item owner-ref-locked">
                      <OwnerSignupIcon name={upgraded ? "plus" : "lock"} />
                      <span>
                        {upgraded
                          ? "All your other items show too"
                          : "Items 4+ show when you upgrade"}
                      </span>
                    </div>
                  </div>
                  <div className="owner-ref-sf-note">
                    Sample items · your real items replace these.
                  </div>
                </div>
              </div>
              <p className="owner-ref-gp-cap">
                Your store link works as soon as you finish.{" "}
                {upgraded
                  ? "Your plan can show all your items."
                  : "Starter shows your first 3 items."}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
