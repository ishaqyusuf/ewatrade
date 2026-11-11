;(() => {
  const screens = {
    catalog: "(admin-tabs)/catalog",
    search: "global-search",
    product: "catalog-item/[catalogItemId]",
    setup: "first-product-setup-modal",
    images: "catalog-item-images",
    gallery: "catalog-image-gallery",
  }
  const home = "(admin-tabs)/admin-home"
  const sampleName = "Broiler chicken"
  const asset = "assets/broiler-sample.jpg"
  const original = { label: "Original", appearance: "original" }
  const generated = { label: "Generated", appearance: "generated" }
  const samplePhoto = () => ({ versions: [generated], active: 0 })
  const escapeMarkup = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    )
  const photo = (version, alt = sampleName) =>
    `<img class="catalog-photo ${version.appearance}" src="${asset}" alt="${escapeMarkup(alt)}">`
  const button = (label, action, extra = "") =>
    `<button type="button" class="catalog-button" data-catalog="${action}" ${extra}>${label}</button>`

  function create({ navigate, paint, current, icons, layout }) {
    const state = {
      saved: [samplePhoto()],
      working: [],
      resumeSaved: false,
      draft: [],
      origin: screens.product,
      query: { [screens.catalog]: "", [screens.search]: "" },
      searchCatalog: false,
      itemKind: "product",
      parent: {},
      name: "",
      description: "",
      price: "",
      note: { saved: "", draft: "" },
      noteOpen: { saved: false, draft: false },
      source: "",
      selected: 0,
      viewed: 0,
      allowance: 29,
      busy: false,
      confirmDelete: false,
      sourcePicked: false,
    }
    let reversing = false
    let nextItemKind = "product"
    let timer
    const inDraft = () => state.origin === screens.setup
    const key = () => (inDraft() ? "draft" : "saved")
    const photos = () => (inDraft() ? state.draft : state.working)
    const itemTitle = () =>
      state.itemKind === "service" ? "Add service" : "Add item"
    const name = () => (inDraft() ? state.name : sampleName)
    const selectedPhoto = () => photos()[state.selected]
    const headers = (
      title,
      backLabel = "Back",
      extra = "",
    ) => `<header class="catalog-header">
      ${button("‹", "back", `aria-label="${backLabel}"`)}<h2>${title}</h2>${extra || "<span></span>"}
    </header>`
    const footer = (label, action, disabled = false) =>
      `<footer class="catalog-footer"><button type="button" class="catalog-primary" data-catalog="${action}" ${disabled ? "disabled" : ""}>${label}</button></footer>`
    const frame = (label, header, content, tail = "", className = "") =>
      `<section class="catalog-flow ${className}" aria-label="${label}">${header}<div class="catalog-body">${content}</div>${tail}</section>`

    function resultMarkup(screen) {
      const query = state.query[screen].trim().toLowerCase()
      const global = screen === screens.search
      if (global && query.length < 2)
        return '<p class="catalog-muted">Search for orders, customers, and catalog items.</p>'
      if (query && !sampleName.toLowerCase().includes(query))
        return '<p class="catalog-muted" role="status">No items found.</p>'
      return `${global ? "<h3>Catalog</h3>" : ""}
        <button class="catalog-result" type="button" data-screen="${screens.product}">
          ${photo(state.saved[0]?.versions[state.saved[0].active] ?? original)}<span><strong>${sampleName}</strong><small>Goods · Poultry · ₦12,500</small></span><span aria-hidden="true">›</span>
        </button>`
    }

    function searchFooter(screen) {
      return `<div class="catalog-search-footer"><label>${icons.search}<input type="search" data-catalog-field="query" aria-label="${screen === screens.search ? "Search" : "Search catalog"}" placeholder="${screen === screens.search ? "Search anything" : "Search name, type or unit"}" value="${escapeMarkup(state.query[screen])}"></label></div>`
    }

    function listing(screen) {
      const global = screen === screens.search
      return frame(
        global ? "Search" : "Catalog",
        global
          ? headers("Search", "Back to Home")
          : `<header class="catalog-tab-heading"><h2>Catalog</h2>${button("+", "new", 'aria-label="Add item"')}</header>`,
        `${global ? "" : '<div class="catalog-filters"><span>All</span><span>Goods</span></div>'}<div data-catalog-results>${resultMarkup(screen)}</div>`,
        global || state.searchCatalog
          ? searchFooter(screen)
          : `<div class="catalog-search-footer">${button(icons.search, "search-catalog", 'aria-label="Search catalog"')}</div>`,
        global ? "" : "catalog-tab",
      )
    }

    function overview() {
      const top = state.saved[0]
      return frame(
        "Product overview",
        headers(
          "Catalog · Poultry",
          "Back to results",
          button(icons.catalog, "images", 'aria-label="Edit images"'),
        ),
        `<div class="catalog-product">${photo(top?.versions[top.active] ?? original)}<div><h3>${sampleName}</h3><span class="catalog-badge">Goods</span> <span class="catalog-badge catalog-active">Active</span></div></div>
        <div class="catalog-shortcuts"><span>New order</span><span>Stock in</span>${button("Images", "images")}<span>Share</span></div>
        <div class="catalog-card"><strong>Whole bird</strong><p>₦12,500 · Each</p><small>In stock</small></div>
        <h3>About</h3><p class="catalog-muted">Whole broiler chicken.</p><div class="catalog-card">Poultry · Stock-tracked item</div>`,
      )
    }

    function setup() {
      return frame(
        itemTitle(),
        headers(itemTitle(), "Back from item setup"),
        `<h3>Essentials</h3>
        <label class="catalog-field">Item name<input data-catalog-field="name" placeholder="e.g. Broiler chicken" value="${escapeMarkup(state.name)}"></label>
        <label class="catalog-field">Selling price<input inputmode="decimal" data-catalog-field="price" value="${escapeMarkup(state.price)}" placeholder="₦0"></label>
        <label class="catalog-field">Description<textarea data-catalog-field="description" placeholder="Optional">${escapeMarkup(state.description)}</textarea></label>
        <h3>Optional details</h3>
        ${button(`<span>Images</span><small>${state.draft.length ? `${state.draft.length} selected` : "Add images"} ›</small>`, "images", "data-catalog-detail")}`,
        footer("Save item", "save-item"),
      )
    }

    function thumbnail(entry, index) {
      return `<div class="catalog-thumbnail">
        ${button(photo(entry.versions[entry.active]), `view-${index}`, `aria-label="View image ${index + 1}"`)}
        ${index === 0 ? '<span class="catalog-primary-label">Primary</span>' : button("Make primary", `primary-${index}`)}
        ${button("×", `remove-${index}`, `aria-label="Remove image ${index + 1}"`)}
        ${button("✦ Refine", `refine-${index}`, `aria-label="Refine image ${index + 1} with AI" ${state.busy || !state.allowance ? "disabled" : ""}`)}
      </div>`
    }

    function images() {
      if (state.source) return sourceView()
      const draft = inDraft()
      return frame(
        "Images",
        headers(
          "Images",
          draft ? "Back to item setup" : `Back to ${sampleName}`,
        ),
        `${name() ? `<p class="catalog-muted">${escapeMarkup(name())}</p>` : ""}
        <div class="catalog-images-heading"><h3>Your images</h3><span>${photos().length} / 8</span></div>
        <div class="catalog-photos ${!draft && layout() === "android" ? "catalog-capture" : ""}">${photos().map(thumbnail).join("")}</div>
        <div class="catalog-sources">
          ${button("◉<span>Take photo</span>", "source-camera", photos().length >= 8 ? "disabled" : "")}
          ${button("▧<span>Choose</span>", "source-choose", photos().length >= 8 ? "disabled" : "")}
          ${button("▦<span>My images</span>", "source-library", photos().length >= 8 ? "disabled" : "")}
        </div>
        <div class="catalog-card catalog-ai"><h3>✦ Create a new image</h3><p class="catalog-muted">Uses your ${draft && state.itemKind === "service" ? "service" : "product"} details.</p>
          <button type="button" class="catalog-primary" data-catalog="generate" ${!name().trim() || state.busy || !state.allowance || photos().length >= 8 ? "disabled" : ""}>✦ Generate with AI</button>
          ${button(state.noteOpen[key()] ? "Hide optional note" : "+ Add a note (optional)", "toggle-note", `aria-expanded="${state.noteOpen[key()]}"`)}
          ${state.noteOpen[key()] ? `<textarea data-catalog-field="note" maxlength="500" aria-label="Additional direction (optional)" placeholder="e.g. A warm, neutral background">${escapeMarkup(state.note[key()])}</textarea>` : ""}
        </div>
        <p class="catalog-allowance">${state.allowance} generations left</p>
        ${state.busy ? '<p class="catalog-card" role="status">Working on your image… You can leave Images and return.</p>' : ""}
        ${button("Illustration library", "source-illustrations")}`,
        footer(draft ? "Done" : "Save changes", "save-images", state.busy),
        !draft && layout() === "android" ? "catalog-android-capture" : "",
      )
    }

    function sourceView() {
      const label = {
        camera: "Take photo",
        choose: "Choose photo",
        library: "My images",
        illustrations: "Illustration library",
      }[state.source]
      return frame(
        label,
        headers(label, "Back to images"),
        `<p class="catalog-muted">Sample images</p>
        ${button(photo(original, "Sample chicken photo"), "pick-source", `aria-label="Select sample photo" aria-pressed="${state.sourcePicked}"`)}
        ${state.sourcePicked ? '<p role="status">1 selected</p>' : ""}`,
        footer(
          state.source === "camera" ? "Use photo" : "Add selected",
          "add-source",
          !state.sourcePicked,
        ),
      )
    }

    function gallery() {
      const entry = selectedPhoto()
      if (!entry) return images()
      const version =
        entry.versions[state.viewed] ?? entry.versions[entry.active]
      const currentVersion = state.viewed === entry.active
      return frame(
        "Image gallery",
        headers(
          `Image ${state.selected + 1} of ${photos().length}`,
          "Back to images",
        ),
        `<p class="catalog-muted">${version.label}${currentVersion ? " · Default" : ""}</p>
        <div class="catalog-gallery-photo">${photo(version, `${name()} · ${version.label}`)}
          ${photos().length > 1 ? `<div class="catalog-gallery-arrows">${button("‹", "previous", 'aria-label="Previous image"')}${button("›", "next", 'aria-label="Next image"')}</div>` : ""}
        </div>
        <div class="catalog-history" aria-label="Photo history">${entry.versions.map((history, index) => button(`${history.label}${index === entry.active ? " · Default" : ""}`, `history-${index}`, `aria-pressed="${index === state.viewed}"`)).join("")}</div>
        ${currentVersion ? '<p class="catalog-muted">Shown in your image list</p>' : button(`Use ${version.label.toLowerCase()}`, "use-version")}
        ${state.viewed > 0 ? button("Delete refinement", "delete-version", state.busy ? "disabled" : "") : ""}
        ${state.confirmDelete ? `<div class="catalog-card"><p>Delete this refinement?</p>${button("Cancel", "cancel-delete")}${button("Delete refinement", "confirm-delete")}</div>` : ""}`,
        footer(
          state.viewed > 0 ? "Refine again" : "Refine with AI",
          `refine-${state.selected}`,
          state.busy || !state.allowance,
        ),
      )
    }

    function enter(screen, previous) {
      if (screen === previous || reversing) return
      if (
        [screens.images, screens.gallery].includes(screen) &&
        ![screens.images, screens.gallery].includes(previous)
      ) {
        state.origin =
          previous === screens.setup ? screens.setup : screens.product
        if (!inDraft()) {
          if (!state.resumeSaved) state.working = structuredClone(state.saved)
          state.resumeSaved = false
        }
        state.source = ""
        state.confirmDelete = false
      }
      if (screen === screens.setup && previous !== screens.images) {
        state.itemKind = nextItemKind
        nextItemKind = "product"
        state.name = state.description = state.price = ""
        state.draft = []
        state.note.draft = ""
        state.noteOpen.draft = false
      }
      if (
        screen === screens.gallery &&
        (previous !== screens.images || !selectedPhoto())
      ) {
        state.selected = 0
        state.viewed = selectedPhoto()?.active ?? 0
      }
      if (
        screen in renderers &&
        screen !== screens.images &&
        screen !== screens.gallery
      )
        state.parent[screen] = previous
    }

    function back() {
      const screen = current()
      if (state.source && screen === screens.images) {
        state.source = ""
        paint()
        return
      }
      if (screen === screens.images && !inDraft() && state.busy)
        state.resumeSaved = true
      const destination =
        screen === screens.gallery
          ? screens.images
          : screen === screens.images
            ? state.origin
            : screen === screens.product
              ? state.parent[screen] === screens.search
                ? screens.search
                : screens.catalog
              : screen === screens.setup
                ? state.parent[screen] === screens.catalog
                  ? screens.catalog
                  : home
                : home
      reversing = true
      try {
        navigate(destination)
      } finally {
        reversing = false
      }
    }

    function runJob(index) {
      const queue = photos()
      if (
        state.busy ||
        !state.allowance ||
        (index === undefined && (!name().trim() || queue.length >= 8))
      )
        return
      const entry = index === undefined ? null : queue[index]
      if (index !== undefined && !entry) return
      state.busy = true
      paint()
      timer = setTimeout(() => {
        state.allowance -= 1
        state.busy = false
        if (entry) {
          entry.versions.push({
            label: `Refinement ${entry.versions.length}`,
            appearance: "refined",
          })
          entry.active = entry.versions.length - 1
          if (current() === screens.gallery && selectedPhoto() === entry)
            state.viewed = entry.active
        } else queue.push(samplePhoto())
        if ([screens.images, screens.gallery].includes(current())) paint()
      }, 700)
    }

    function openNew(kind) {
      nextItemKind = kind
      navigate(screens.setup)
    }

    function click(action) {
      if (action === "back") return back()
      if (action === "new") return openNew("product")
      if (action === "new-service") return openNew("service")
      if (action === "images") return navigate(screens.images)
      if (action === "save-images") {
        if (state.busy) return
        if (!inDraft()) state.saved = structuredClone(state.working)
        return back()
      }
      if (action === "save-item") {
        if (!state.name.trim())
          return document.querySelector('[data-catalog-field="name"]')?.focus()
        return back()
      }
      if (action === "generate") return runJob()
      if (action.startsWith("refine-")) return runJob(Number(action.slice(7)))
      if (action.startsWith("view-")) {
        state.selected = Number(action.slice(5))
        state.viewed = selectedPhoto().active
        state.confirmDelete = false
        return navigate(screens.gallery)
      }
      if (action.startsWith("remove-"))
        photos().splice(Number(action.slice(7)), 1)
      else if (action.startsWith("primary-"))
        photos().unshift(...photos().splice(Number(action.slice(8)), 1))
      else if (action === "search-catalog") {
        state.searchCatalog = true
        paint()
        return document.querySelector('[data-catalog-field="query"]')?.focus()
      } else if (action === "toggle-note")
        state.noteOpen[key()] = !state.noteOpen[key()]
      else if (action.startsWith("source-")) {
        state.source = action.slice(7)
        state.sourcePicked = false
      } else if (action === "pick-source")
        state.sourcePicked = !state.sourcePicked
      else if (
        action === "add-source" &&
        state.sourcePicked &&
        photos().length < 8
      ) {
        photos().push({ versions: [original], active: 0 })
        state.source = ""
      } else if (action.startsWith("history-")) {
        state.viewed = Number(action.slice(8))
        state.confirmDelete = false
      } else if (action === "next" || action === "previous") {
        state.selected =
          (state.selected + (action === "next" ? 1 : -1) + photos().length) %
          photos().length
        state.viewed = selectedPhoto().active
        state.confirmDelete = false
      } else if (action === "use-version") selectedPhoto().active = state.viewed
      else if (action === "delete-version") state.confirmDelete = true
      else if (action === "cancel-delete") state.confirmDelete = false
      else if (action === "confirm-delete") {
        const entry = selectedPhoto()
        entry.versions.splice(state.viewed)
        entry.active = Math.min(entry.active, entry.versions.length - 1)
        state.viewed = entry.active
        state.confirmDelete = false
      }
      paint()
    }

    function input(field, value, root) {
      if (field === "query") {
        const screen = current()
        state.query[screen] = value
        root.querySelector("[data-catalog-results]").innerHTML =
          resultMarkup(screen)
      } else if (field === "note") state.note[key()] = value
      else state[field] = value
    }

    function reset() {
      clearTimeout(timer)
      state.saved = [samplePhoto()]
      state.working = []
      state.resumeSaved = false
      state.draft = []
      state.itemKind = nextItemKind = "product"
      state.origin = screens.product
      state.query = { [screens.catalog]: "", [screens.search]: "" }
      state.parent = {}
      state.searchCatalog =
        state.busy =
        state.noteOpen.saved =
        state.noteOpen.draft =
        state.confirmDelete =
        state.sourcePicked =
          false
      state.source =
        state.note.saved =
        state.note.draft =
        state.name =
        state.price =
        state.description =
          ""
      state.selected = state.viewed = 0
      state.allowance = 29
    }

    const renderers = {
      [screens.catalog]: () => listing(screens.catalog),
      [screens.search]: () => listing(screens.search),
      [screens.product]: overview,
      [screens.setup]: setup,
      [screens.images]: images,
      [screens.gallery]: gallery,
    }
    return { renderers, enter, click, input, reset }
  }

  window.MOBILE_PRODUCTION_CATALOG = { create, screens }
})()
