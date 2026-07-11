import { ImageResponse } from "next/og"

export const runtime = "nodejs"

function getSearchValue(url: URL, key: string, fallback: string) {
  return url.searchParams.get(key)?.slice(0, 120) || fallback
}

export function GET(request: Request) {
  const url = new URL(request.url)
  const name = getSearchValue(url, "name", "Product")
  const business = getSearchValue(url, "business", "ewatrade")
  const price = getSearchValue(url, "price", "")

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f7f3ea",
        color: "#1d1912",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 64,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>ewatrade</div>
        <div style={{ color: "#6f6659", fontSize: 28 }}>{business}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ color: "#6f6659", fontSize: 30 }}>Product link</div>
        <div
          style={{
            fontSize: 78,
            fontWeight: 800,
            lineHeight: 1.02,
            maxWidth: 940,
          }}
        >
          {name}
        </div>
        {price ? (
          <div
            style={{
              alignSelf: "flex-start",
              background: "#1d1912",
              color: "#fffaf2",
              fontSize: 36,
              fontWeight: 700,
              padding: "18px 26px",
            }}
          >
            From {price}
          </div>
        ) : null}
      </div>

      <div
        style={{
          borderTop: "2px solid #d8cfbf",
          color: "#6f6659",
          fontSize: 26,
          paddingTop: 28,
        }}
      >
        View product units and submit an order request.
      </div>
    </div>,
    {
      height: 630,
      width: 1200,
    },
  )
}
