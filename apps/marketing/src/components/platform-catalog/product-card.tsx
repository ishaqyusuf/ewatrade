import {
  type PlatformCatalogItem,
  platformAvailability,
  platformItemPrice,
} from "@/lib/platform-catalog"
import Link from "next/link"
import { PlatformTile } from "./tile"

export function PlatformProductGrid({
  slug,
  items,
}: {
  slug: string
  items: PlatformCatalogItem[]
}) {
  return (
    <div className={`grid${items.length <= 3 ? " grid-few" : ""}`}>
      {items.map((item) => {
        const availability = platformAvailability(item.availability)
        return (
          <article className="card" key={item.id}>
            <Link
              className="card-link"
              href={`/b/${encodeURIComponent(slug)}/p/${encodeURIComponent(item.id)}`}
            >
              <PlatformTile item={item} />
              <div className="card-body">
                <h3 className="clamp-2">{item.name}</h3>
                <div className="price">{platformItemPrice(item)}</div>
                {availability.kind === "in" ? null : (
                  <span className="avail" data-a={availability.kind}>
                    <i />
                    {availability.label}
                  </span>
                )}
              </div>
            </Link>
          </article>
        )
      })}
    </div>
  )
}
