;(() => {
  const control = document.getElementById("phone-zoom")
  const viewport = document.querySelector(".phone-viewport")
  const phone = viewport.querySelector("[data-workshop-surface]")
  const root = document.documentElement
  const narrow = matchMedia("(max-width: 600px)")
  const supported = new Set(
    Array.from(control.options, (option) => option.value),
  )
  const saved = new URLSearchParams(location.hash.slice(1)).get("ws_zoom")

  let frame = 0
  let visibleFrame
  let lastAvailableHeight = Number.POSITIVE_INFINITY
  control.value = supported.has(saved) ? saved : "auto"

  function resize() {
    frame = 0
    if (control.value !== "fit" && control.value !== "auto") {
      phone.style.setProperty(
        "--phone-zoom",
        String(Number(control.value) / 100),
      )
      return
    }
    if (control.value === "auto" && narrow.matches) {
      phone.style.removeProperty("--phone-zoom")
      return
    }
    const canvasTop = viewport.getBoundingClientRect().top
    if (
      visibleFrame &&
      (visibleFrame.top <= canvasTop || !Number.isFinite(lastAvailableHeight))
    ) {
      // The Workshop iframe sizes to its content. This intersection measures
      // the part of the iframe visible in the outer browser viewport.
      const visibleTop = Math.max(canvasTop, visibleFrame.top)
      lastAvailableHeight = Math.max(1, visibleFrame.bottom - visibleTop - 22)
    }
    const width = Math.max(1, viewport.clientWidth - 16)
    const fit = Math.min(
      1,
      width / phone.offsetWidth,
      lastAvailableHeight / phone.offsetHeight,
    )
    const percent = Math.max(1, Math.floor(fit * 100))
    phone.style.setProperty("--phone-zoom", String(percent / 100))
  }

  function scheduleResize() {
    if (!frame) frame = requestAnimationFrame(resize)
  }

  function applySelection() {
    root.toggleAttribute("data-zoom-override", control.value !== "auto")
    scheduleResize()
    window.dispatchEvent(new Event("workshop:zoom-mode"))
  }

  control.addEventListener("change", () => {
    const hash = new URLSearchParams(location.hash.slice(1))
    hash.set("ws_zoom", control.value)
    try {
      history.replaceState(null, "", `#${hash}`)
    } catch {
      // Scaling also works in embeds that disallow history changes.
    }
    applySelection()
  })

  // This fixed probe is clipped by the parent viewport even in a sandboxed
  // iframe. It does not contribute to the archived canvas height.
  const probe = document.createElement("div")
  probe.className = "phone-fit-probe"
  probe.setAttribute("aria-hidden", "true")
  document.body.append(probe)
  const intersection = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return
      visibleFrame = entry.intersectionRect
      scheduleResize()
    },
    { threshold: Array.from({ length: 51 }, (_, index) => index / 50) },
  )
  intersection.observe(probe)

  const layout = new ResizeObserver(scheduleResize)
  layout.observe(viewport)
  layout.observe(phone)
  window.addEventListener("resize", scheduleResize)
  narrow.addEventListener("change", scheduleResize)
  applySelection()
})()
