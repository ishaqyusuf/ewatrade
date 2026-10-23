import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import {
  formatStorefrontPrice,
  storefrontInitials,
} from "@ewatrade/storefront-runtime/presentation"
import type { PublicStorefront, PublicStorefrontItem } from "./storefront-types"

function Artwork({
  item,
  large = false,
  photoData,
}: { item: PublicStorefrontItem; large?: boolean; photoData?: string }) {
  const svg = getCatalogIllustrationSvg(item.illustrationId, {
    ink: "#232522",
    fill: "#d1c5ad",
    accent: "#a6967d",
    highlight: "#f3eee5",
  })
  return (
    <div
      style={{
        display: "flex",
        width: large ? 370 : 150,
        height: large ? 370 : 150,
        borderRadius: 16,
        background: "#f3eee5",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {photoData ? (
        <img
          alt=""
          src={photoData}
          width={large ? 370 : 150}
          height={large ? 370 : 150}
          style={{ objectFit: "cover", borderRadius: 16 }}
        />
      ) : svg ? (
        <img
          alt=""
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          width={large ? 300 : 125}
          height={large ? 300 : 125}
        />
      ) : (
        <span style={{ fontSize: large ? 90 : 45, color: "#766b57" }}>
          {storefrontInitials(item.name)}
        </span>
      )}
    </div>
  )
}

export function StorefrontShareImage({
  store,
  domain,
  photoData = {},
}: {
  store: PublicStorefront
  domain: string
  photoData?: Record<string, string>
}) {
  const item = store.highlightedItem
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        color: "#1d211d",
        padding: "44px 56px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            width: 54,
            height: 54,
            borderRadius: 12,
            background: "#f0f1ed",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}
        >
          {storefrontInitials(store.name)}
        </div>
        <div style={{ display: "flex", fontSize: 24, maxWidth: 950 }}>
          {store.name.slice(0, 80)}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: item ? 620 : 530,
            gap: 20,
          }}
        >
          <div style={{ display: "flex", color: "#70766b", fontSize: 18 }}>
            {item
              ? item.kind === "SERVICE"
                ? "SERVICE"
                : "PRODUCT"
              : "PRODUCTS & SERVICES"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: item ? 48 : 52,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -1.5,
            }}
          >
            {(item?.name ?? store.name).slice(0, 100)}
          </div>
          {item?.priceMinor != null ? (
            <div style={{ display: "flex", fontSize: 34 }}>
              {item.isFromPrice ? "From " : ""}
              {formatStorefrontPrice(
                item.priceMinor,
                item.currencyCode,
                "code",
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                color: "#70766b",
                fontSize: 23,
                lineHeight: 1.4,
              }}
            >
              {(
                item?.description ??
                store.description ??
                "Discover something you’ll love."
              ).slice(0, 105)}
            </div>
          )}
        </div>
        {item ? (
          <Artwork item={item} large photoData={photoData[item.id]} />
        ) : (
          <div style={{ display: "flex", gap: 12 }}>
            {store.items.slice(0, 3).map((item) => (
              <Artwork
                key={item.id}
                item={item}
                photoData={photoData[item.id]}
              />
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid #e5e7e1",
          paddingTop: 20,
          fontSize: 17,
          color: "#70766b",
        }}
      >
        <span>{domain}</span>
        <span>{store.isQaPreview ? "LOCAL QA PREVIEW · " : ""}ẸwáTrade</span>
      </div>
    </div>
  )
}
