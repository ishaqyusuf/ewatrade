"use client"
import { marketingAttrs } from "@/lib/marketing-interactions"

import { useState } from "react"

import { Icon } from "./icons"
import { useMarketingMotion } from "./use-marketing-motion"

export function BusinessTypesV15() {
  const motion = useMarketingMotion(0.05)
  const [paused, setPaused] = useState(false)
  return (
    <section
      className="business-types"
      id="businesses"
      ref={motion.ref}
      data-running={motion.active && !paused}
    >
      <div className="wrap">
        <h2>
          Made for the businesses <br />
          on your street.
        </h2>
        <p>
          Sell goods, deliver a service, or do a bit of both. <br />
          There is room for your kind of business.
        </p>
      </div>
      <div className="business-rails">
        <div className="business-lane">
          <div className="business-track track-0">
            <ul aria-label="Business types">
              <li>
                <Icon name="poultry" />
                <span>Poultry &amp; feed</span>
              </li>
              <li>
                <Icon name="pharmacy" />
                <span>Pharmacy</span>
              </li>
              <li>
                <Icon name="boutique" />
                <span>Fashion boutique</span>
              </li>
              <li>
                <Icon name="laundry" />
                <span>Laundry</span>
              </li>
              <li>
                <Icon name="bakery" />
                <span>Bakery</span>
              </li>
              <li>
                <Icon name="store" />
                <span>Provisions store</span>
              </li>
              <li>
                <Icon name="restaurant" />
                <span>Restaurant &amp; buka</span>
              </li>
            </ul>
            <ul aria-hidden="true" inert={true}>
              <li>
                <Icon name="poultry" />
                <span>Poultry &amp; feed</span>
              </li>
              <li>
                <Icon name="pharmacy" />
                <span>Pharmacy</span>
              </li>
              <li>
                <Icon name="boutique" />
                <span>Fashion boutique</span>
              </li>
              <li>
                <Icon name="laundry" />
                <span>Laundry</span>
              </li>
              <li>
                <Icon name="bakery" />
                <span>Bakery</span>
              </li>
              <li>
                <Icon name="store" />
                <span>Provisions store</span>
              </li>
              <li>
                <Icon name="restaurant" />
                <span>Restaurant &amp; buka</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="business-lane">
          <div className="business-track track-1">
            <ul aria-label="Business types">
              <li>
                <Icon name="salon" />
                <span>Hair salon</span>
              </li>
              <li>
                <Icon name="barber" />
                <span>Barbershop</span>
              </li>
              <li>
                <Icon name="hardware" />
                <span>Hardware</span>
              </li>
              <li>
                <Icon name="cosmetics" />
                <span>Cosmetics</span>
              </li>
              <li>
                <Icon name="phoneRepair" />
                <span>Phone repair</span>
              </li>
              <li>
                <Icon name="furniture" />
                <span>Furniture</span>
              </li>
              <li>
                <Icon name="farmProduce" />
                <span>Farm produce</span>
              </li>
            </ul>
            <ul aria-hidden="true" inert={true}>
              <li>
                <Icon name="salon" />
                <span>Hair salon</span>
              </li>
              <li>
                <Icon name="barber" />
                <span>Barbershop</span>
              </li>
              <li>
                <Icon name="hardware" />
                <span>Hardware</span>
              </li>
              <li>
                <Icon name="cosmetics" />
                <span>Cosmetics</span>
              </li>
              <li>
                <Icon name="phoneRepair" />
                <span>Phone repair</span>
              </li>
              <li>
                <Icon name="furniture" />
                <span>Furniture</span>
              </li>
              <li>
                <Icon name="farmProduce" />
                <span>Farm produce</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="business-control">
        <button
          id="business-motion"
          {...marketingAttrs(paused ? "play" : "pause", "business_ribbon")}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
          disabled={motion.reduced}
          type="button"
        >
          {motion.reduced
            ? "Movement off"
            : paused
              ? "Resume movement"
              : "Pause movement"}
        </button>
      </div>
    </section>
  )
}
