;(() => {
  const origin = "https://workshop.localhost"

  function archiveAsset(link, entrypoint) {
    if (!link) return null
    const url = new URL(link, origin)
    const revision = url.searchParams.get("rev")
    const asset = url.searchParams.get("screen") || entrypoint
    if (
      url.origin !== origin ||
      !url.pathname.startsWith("/ewatrade/") ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(revision) ||
      !asset?.endsWith(".html")
    )
      return null
    const parts = asset.split("/")
    if (
      parts.some(
        (part) => !part || part === "." || part === ".." || part.includes("\\"),
      )
    )
      return null
    const target = new URL(
      `/preview/${revision}/${parts.map(encodeURIComponent).join("/")}`,
      origin,
    )
    target.searchParams.set("workshop-panel", "off")
    return target.href
  }

  function options(entry, sourceCommit) {
    const result = []
    if (entry.area === "Playable")
      result.push({
        label: "v1 · Currently implemented in source",
        summary: `Source snapshot · ${sourceCommit.slice(0, 9)}`,
        baseline: true,
      })
    for (const receipt of entry.receipts) {
      result.push({
        label: `v${receipt.version} · ${receipt.title}`,
        summary: receipt.commit
          ? `${receipt.state} · ${receipt.commit.slice(0, 9)}`
          : receipt.state,
        archive: archiveAsset(receipt.url, receipt.asset),
      })
    }
    if (entry.reference)
      result.push({
        label: "Prior Workshop reference",
        summary: "Historical design reference",
        archive: archiveAsset(`/ewatrade/${entry.reference}`),
      })
    return result.length
      ? result
      : [{ label: "No revision linked", summary: "Preview pending" }]
  }

  function show(version, elements) {
    const { phoneViewport, archive, title, frame, status } = elements
    const source = version.archive
    status.textContent = version.summary
    phoneViewport.hidden = Boolean(source)
    archive.hidden = !source
    if (source) {
      title.textContent = version.label
      frame.title = version.label
      if (frame.getAttribute("src") !== source) frame.src = source
    } else {
      frame.removeAttribute("src")
    }
  }

  window.MOBILE_PRODUCTION_VERSIONS = { options, show }
})()
