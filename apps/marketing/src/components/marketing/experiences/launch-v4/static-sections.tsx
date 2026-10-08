import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { getCreateStoreCta } from "@/lib/create-store-url"
import {
  PlatformSwitch,
  usePlatform,
} from "@ewatrade/onboarding/components/product-preview/platform"
import { ProductPreview } from "@ewatrade/onboarding/components/product-preview/product-preview"
import {
  data,
  money,
} from "@ewatrade/onboarding/components/product-preview/sample-data"
import {
  icons,
  typeIcon,
} from "@ewatrade/onboarding/components/product-preview/screens"
import type { CSSProperties } from "react"
export function Availability({ signupEnabled }: { signupEnabled: boolean }) {
  const cta = getCreateStoreCta(signupEnabled)
  return (
    <>
      <section className={"gg-sec"} id={"apps"} aria-labelledby={"dash-h"}>
        {"\n      "}
        <div className={"gg-wrap"}>
          {"\n        "}
          <div className={"gg-split-head"}>
            {"\n          "}
            <h2 className={"gg-h2 ew-reveal is-in"} id={"dash-h"}>
              {"The web for the back office. The phone for the counter, soon."}
            </h2>
            {"\n          "}
            <p
              className={"gg-lead ew-reveal is-in"}
              style={{ "--d": "80ms" } as CSSProperties}
            >
              {
                "Sales, stock, customers, staff and finance work today in the web dashboard. The mobile app is coming soon, for one-handed selling at the counter, even when the network drops."
              }
            </p>
            {"\n        "}
          </div>
          {"\n        "}
          <div className={"b-avail"}>
            {"\n          "}
            <article
              className={"b-av b-av--web ew-reveal is-in"}
              aria-labelledby={"av-web"}
            >
              {"\n            "}
              <img
                className={"gg-wm"}
                src={"/brand/ewatrade-mark-precision-rise-v1-reverse.svg"}
                alt={""}
              />
              {"\n            "}
              <span className={"b-av-tag"}>{"Available today"}</span>
              {"\n            "}
              <h3 id={"av-web"}>{"Web dashboard"}</h3>
              {"\n            "}
              <p>
                {
                  "Sell, count stock, chase what’s owed and close the day. Reports, finance and staff on a bigger screen."
                }
              </p>
              {"\n            "}
              <ul className={"b-av-list"}>
                {"\n              "}
                <li>
                  <i data-icon={"check"} />
                  {"In any browser, on a computer or a phone"}
                </li>
                {"\n              "}
                <li>
                  <i data-icon={"check"} />
                  {"Nothing to install, nothing to update"}
                </li>
                {"\n              "}
                <li>
                  <i data-icon={"check"} />
                  {"Staff with roles, reps on “Only their own sales”"}
                </li>
                {"\n            "}
              </ul>
              {"\n            "}
              <a className={"gg-btn gg-btn--gold"} href={cta.href}>
                {cta.label}
              </a>
              {"\n          "}
            </article>
            {"\n          "}
            <article
              className={"b-av b-av--app ew-reveal is-in"}
              style={{ "--d": "100ms" } as CSSProperties}
              aria-labelledby={"av-app"}
            >
              {"\n            "}
              <div className={"b-av-copy"}>
                {"\n              "}
                <span className={"b-av-tag b-av-tag--soon"}>
                  {"Coming soon"}
                </span>
                {"\n              "}
                <h3 id={"av-app"}>{"Mobile app"}</h3>
                {"\n              "}
                <p>
                  {
                    "Made for the counter. Sales save on the phone when there’s no signal and sync when it’s back. Same business, same numbers as the web."
                  }
                </p>
                {"\n              "}
                <p>
                  {
                    "Keep using the web dashboard on your phone or computer while the app is on its way."
                  }
                </p>
                {"\n            "}
              </div>
              {"\n            "}
              <div className={"b-av-phone"} aria-hidden={"true"}>
                <ProductPreview
                  platform="mobile"
                  view="offline"
                  state={{ synced: true }}
                />
              </div>
              {"\n          "}
            </article>
            {"\n        "}
          </div>
          {"\n      "}
        </div>
        {"\n    "}
      </section>
      {"\n\n"}
    </>
  )
}
export function Faq() {
  return (
    <>
      <section className={"gg-sec"} id={"faq"} aria-labelledby={"faq-h"}>
        {"\n      "}
        <div className={"gg-wrap gg-faq"}>
          {"\n        "}
          <div className={"gg-faq-side"}>
            {"\n          "}
            <h2 className={"gg-h2 ew-reveal is-in"} id={"faq-h"}>
              {"Questions, answered."}
            </h2>
            {"\n          "}
            <p
              className={"ew-reveal is-in"}
              style={{ "--d": "80ms" } as CSSProperties}
            >
              {"Something else on your mind? "}
              <a href={"/contact"}>{"Talk to us"}</a>
              {"."}
            </p>
            {"\n        "}
          </div>
          {"\n        "}
          <div>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"Is there a mobile app?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "It’s coming soon. Until then, ẸwáTrade works in the browser on any phone or computer."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"Can I sell services as well as products?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "Yes. Products and services live in one catalogue, so a laundry can sell “Shirt wash and iron” and a bottle of starch in the same sale."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"What’s the difference between paid and delivered?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "They’re tracked separately. An order can be paid and still preparing, or delivered and still owing, so you always know what’s left to do and what’s left to collect."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"Does it work without internet?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "The web dashboard needs a connection. The mobile app, coming soon, will keep selling with no signal: sales save on the phone, show “Waiting to sync” and sync when you’re back online."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"Can my staff and sales reps use it?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "Yes, on Starter, Growth and Pro. Add staff and give each one a role. For sales reps, turn on “Only their own sales” for a store, and they’ll see the orders they made and nothing else."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"Should I use my phone or my computer?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "Either. The web dashboard works in the browser on both, so you can sell at the counter on your phone and check reports on a laptop. It’s the same business and the same numbers."
                }
              </p>
              {"\n          "}
            </details>
            {"\n          "}
            <details className={"gg-qa"}>
              {"\n            "}
              <summary>
                {"What happens when launch pricing ends?"}
                <i>{"+"}</i>
              </summary>
              {"\n            "}
              <p>
                {
                  "The Free plan stays free forever. Starter, Growth and Pro are free during launch. We’ll tell you before launch pricing ends."
                }
              </p>
              {"\n          "}
            </details>
            {"\n"}
            <details className={"gg-qa"}>
              <summary>
                {"How do I delete my account?"}
                <i>{"+"}</i>
              </summary>
              <p>
                {"See "}
                <a href={"/delete-account"}>{"account deletion"}</a>
                {
                  " for the steps to request deletion of your account and business data."
                }
              </p>
            </details>
          </div>
        </div>
      </section>
    </>
  )
}
export function Closing({ signupEnabled }: { signupEnabled: boolean }) {
  const cta = getCreateStoreCta(signupEnabled)
  return (
    <>
      <section className={"gg-final"} aria-labelledby={"final-h"}>
        {"\n    "}
        <img
          className={"gg-wm"}
          src={"/brand/ewatrade-mark-precision-rise-v1-reverse.svg"}
          alt={""}
        />
        {"\n    "}
        <div className={"gg-wrap"}>
          {"\n      "}
          <h2 className={"ew-reveal is-in"} id={"final-h"}>
            {"Your business. Your next chapter."}
          </h2>
          {"\n      "}
          <p
            className={"ew-reveal is-in"}
            style={{ "--d": "80ms" } as CSSProperties}
          >
            {
              "Create your store today, in any browser. The Free plan is yours to keep."
            }
          </p>
          {"\n      "}
          <div
            className={"gg-ctas ew-reveal is-in"}
            style={{ "--d": "160ms" } as CSSProperties}
          >
            {"\n        "}
            <a className={"gg-btn gg-btn--gold"} href={cta.href}>
              {cta.label}
            </a>
            {"\n        "}
            <a className={"gg-textlink"} href={getDashboardLoginUrl()}>
              {"Sign in"}
            </a>
            {"\n      "}
          </div>
          {"\n    "}
        </div>
        {"\n  "}
      </section>
      {"\n\n\n"}
      <footer className={"gg-footer"}>
        {"\n  "}
        <div className={"gg-wrap"}>
          {"\n    "}
          <div className={"gg-foot-grid"}>
            {"\n      "}
            <div className={"gg-foot-brand"}>
              {"\n        "}
              <img
                className={"ew-logo"}
                src={"/brand/ewatrade-logo-precision-rise-v1-reverse.svg"}
                alt={"ẸwáTrade"}
                width={"141"}
                height={"30"}
              />
              {"\n        "}
              <p>{"Come. Trade. Together."}</p>
              {"\n      "}
            </div>
            {"\n      "}
            <nav aria-label={"Product"}>
              <h3>{"Product"}</h3>
              <ul>
                <li>
                  <a href={"#product"}>{"Features"}</a>
                </li>
                <li>
                  <a href={"#businesses"}>{"Businesses"}</a>
                </li>
                <li>
                  <a href={"#pricing"}>{"Pricing"}</a>
                </li>
                <li>
                  <a href={"#faq"}>{"FAQ"}</a>
                </li>
              </ul>
            </nav>
            {"\n      "}
            <nav aria-label={"Company"}>
              <h3>{"Company"}</h3>
              <ul>
                <li>
                  <a href={"/contact"}>{"Contact"}</a>
                </li>
                <li>
                  <a href={"/support"}>{"Support"}</a>
                </li>
              </ul>
            </nav>
            {"\n      "}
            <nav aria-label={"Legal"}>
              <h3>{"Legal"}</h3>
              <ul>
                <li>
                  <a href={"/terms"}>{"Terms"}</a>
                </li>
                <li>
                  <a href={"/privacy"}>{"Privacy"}</a>
                </li>
                <li>
                  <a href={"/billing-policy"}>{"Billing policy"}</a>
                </li>
                <li>
                  <a href={"/delete-account"}>{"Delete account"}</a>
                </li>
              </ul>
            </nav>
            {"\n    "}
          </div>
          {"\n    "}
          <p className={"gg-foot-base"}>
            {
              "© 2026 EwaTrade. Sample businesses and figures on this page are illustrations."
            }
          </p>
          {"\n  "}
        </div>
        {"\n"}
      </footer>
      {"\n\n"}
    </>
  )
}
