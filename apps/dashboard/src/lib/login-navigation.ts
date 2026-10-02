export function getLoginDestination(next?: string | null) {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/"
  const base = "https://dashboard.example"
  let url: URL
  try {
    url = new URL(next, base)
  } catch {
    return "/"
  }
  if (
    url.origin !== base ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/api/")
  )
    return "/"
  return `${url.pathname}${url.search}${url.hash}`
}
