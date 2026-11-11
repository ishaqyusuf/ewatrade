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
  const model = window.MOBILE_CATALOG_MODEL
  const { icons, sampleRows, productUsageLabels, productUsageDescriptions } =
    model
  const broiler = sampleRows.find((row) => row.id === "broiler")
  const asset = "assets/broiler-sample.jpg"
  const original = { label: "Original", appearance: "original", parent: null }
  const generated = {
    label: "Generated",
    appearance: "generated",
    parent: null,
  }
  const entry = (version) => ({ versions: [version], active: version })
  const scenarios = {
    mixed: "Goods and services",
    goods: "Goods only",
    services: "Services only",
    first: "First item",
    loading: "Loading",
    unavailable: "Unavailable",
    offline: "Offline with saved items",
    "offline-empty": "Offline without saved items",
    readonly: "View only",
  }
  const problems = {
    out_of_stock: {
      label: "out of stock",
      pill: "Out of stock",
      icon: "alert",
      tint: "rose",
    },
    no_price: {
      label: "no price",
      pill: "No price",
      icon: "tag",
      tint: "amber",
    },
    not_counted: {
      label: "not counted",
      pill: "Not counted",
      icon: "clipboard",
      tint: "sky",
    },
  }

  const html = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    )
  const button = (label, action, attrs = "", className = "") =>
    `<button type="button" class="catalog-button ${className}" data-catalog="${action}" ${attrs}>${label}</button>`
  const go = (label, screen, attrs = "", className = "") =>
    `<button type="button" class="catalog-button ${className}" data-screen="${screen}" ${attrs}>${label}</button>`
  const disabled = (value) => (value ? "disabled" : "")
  const icon = (name) => icons[name]
  const photo = (version, alt) =>
    `<img class="catalog-photo ${version.appearance}" src="${asset}" alt="${html(alt)}">`
  const illustration = (kind) =>
    `<span class="catalog-illustration" role="img" aria-label="${kind === "service" ? "Produce crate" : "Chicken"}"><span data-illustration-theme="light">${model.illustrations.light[kind]}</span><span data-illustration-theme="dark">${model.illustrations.dark[kind]}</span></span>`
  const action = (label, key, attrs = "", variant = "primary") =>
    button(label, key, attrs, `catalog-action catalog-action--${variant}`)
  const pill = (label, tone) =>
    `<span class="catalog-pill" data-tone="${tone}">${label}</span>`
  const section = (title, content) =>
    `<section class="catalog-section"><h3>${title}</h3>${content}</section>`
  const banner = (message, title = "", tone = "warning", extra = "") =>
    `<div class="catalog-banner" data-tone="${tone}" role="status">${title ? `<strong>${title}</strong>` : ""}<p>${message}</p>${extra}</div>`
  const headers = (
    title,
    backLabel,
    trailing = "",
    locked = false,
    close = false,
  ) =>
    `<header class="catalog-header">${button(icon(close ? "close" : "back"), "back", `aria-label="${html(backLabel)}" ${disabled(locked)}`, "catalog-round")}<h2>${title}</h2>${trailing || "<span></span>"}</header>`
  const footer = (content) =>
    `<footer class="catalog-footer">${content}</footer>`
  const frame = (label, header, content, tail = "", classes = "") =>
    `<section class="catalog-flow ${classes}" aria-label="${html(label)}">${header}<div class="catalog-body">${content}</div>${tail}</section>`
  const empty = (title, message, glyph = "warehouse") =>
    `<div class="catalog-empty">${icon(glyph)}<strong>${title}</strong><p>${message}</p></div>`
  const field = (label, name, value, extra = "") =>
    `<label class="catalog-field">${label}<input data-catalog-field="${name}" value="${html(value)}" ${extra}></label>`

  function installPalette() {
    const style = document.createElement("style")
    style.textContent = Object.entries(model.palette)
      .map(
        ([theme, palette]) =>
          `:root[data-theme="${theme}"] .catalog-flow, :root[data-theme="${theme}"] .phone:has(.catalog-flow) .status-bar{${Object.entries(
            palette,
          )
            .map(([key, value]) => `--cat-${key.slice(2)}:${value}`)
            .join(";")}}`,
      )
      .join("")
    document.head.append(style)
  }

  function create({
    navigate,
    paint,
    current,
    focus,
    refreshDock,
    syncScenario,
  }) {
    let state
    let resetTimer
    let writeTimer
    let reversing = false
    let nextItemKind = "product"
    const screenState = () => ({
      scenario: "mixed",
      imagesScenario: "ready",
      saveError: false,
      saveAttempt: null,
      queries: { [screens.catalog]: "", [screens.search]: "" },
      filter: "all",
      attention: null,
      searchOpen: false,
      selecting: false,
      selectedIds: new Set(),
      item: broiler,
      items: new Map(),
      parents: {},
      origin: screens.product,
      draft: {
        photos: [],
        illustration: false,
        note: "",
        noteOpen: false,
        name: "",
        price: "",
        description: "",
        kind: "product",
      },
      imageIndex: 0,
      viewed: null,
      confirmDelete: false,
      source: "",
      sourceSearch: "",
      sourcePicked: false,
      allowance: 29,
      job: null,
      writing: false,
      overlay: "",
      usageDraft: null,
      optionFilter: "",
      barcodeOption: "",
      barcode: "",
    })
    function reset() {
      clearTimeout(resetTimer)
      clearTimeout(writeTimer)
      state = screenState()
      nextItemKind = "product"
    }
    reset()
    const rowState = (row) => {
      if (!state.items.has(row.id))
        state.items.set(row.id, {
          photos: row === broiler ? [entry(generated)] : [],
          illustration: false,
          note: "",
          noteOpen: false,
          usage: "FOR_SALE",
          barcodes: {},
          hidden: Boolean(row.hiddenFromSale),
        })
      return state.items.get(row.id)
    }
    const saved = () => rowState(state.item)
    const isDraft = () => state.origin === screens.setup
    const media = () => (isDraft() ? state.draft : saved())
    const title = () => (isDraft() ? state.draft.name : state.item.name)
    const offline = () => state.scenario.startsWith("offline")
    const canEdit = () => !offline() && state.scenario !== "readonly"
    const busy = () => state.writing || state.job?.target === media()
    const canRefine = () => !locked() && aiAvailable() && !state.job
    const selectedImage = () => media().photos[state.imageIndex]
    const search = (key) => state.queries[key]
    const catalogRows = () => {
      if (
        ["first", "loading", "unavailable", "offline-empty"].includes(
          state.scenario,
        )
      )
        return []
      if (state.scenario === "goods")
        return sampleRows.filter((row) => row.kind === "product")
      if (state.scenario === "services")
        return sampleRows.filter((row) => row.kind === "service")
      return sampleRows
    }
    const counts = () => model.catalogShelfCounts(catalogRows(), 0)
    const visibleRows = () =>
      model.filterCatalogShelf(catalogRows(), {
        kind: state.filter,
        query: search(screens.catalog),
        attention: state.attention,
      })
    const wantsSearch = () =>
      model.shouldShowListSearch(counts().all) ||
      Boolean(search(screens.catalog))

    function avatar(row, large = false) {
      const { photos, illustration: hasIllustration } = rowState(row)
      const tint = large
        ? row.kind === "service"
          ? "lilac"
          : "amber"
        : model.catalogAvatarTint(row.name, row.kind)
      const content = photos[0]
        ? photo(photos[0].active, row.name)
        : hasIllustration
          ? illustration(row.kind)
          : icon(row.kind === "service" ? "wrench" : "package")
      return `<span class="catalog-avatar ${large ? "catalog-avatar--large" : ""}" data-tone="${tint}">${content}</span>`
    }
    function rowMarkup(row) {
      const info = problems[row.problem]
      const selecting = current() === screens.catalog && state.selecting
      const chosen = selecting && state.selectedIds.has(row.id)
      const status = rowState(row).hidden
        ? pill("Hidden", "muted")
        : info
          ? pill(info.pill, row.problem === "not_counted" ? "muted" : info.tint)
          : row.kind === "service"
            ? pill("Service", "muted")
            : ""
      return button(
        `${chosen ? `<span class="catalog-avatar catalog-selected">${icon("check")}</span>` : avatar(row)}
        <span class="catalog-row-name"><strong>${html(row.name)}</strong><small>${row.problem === "not_counted" ? "Stock not counted" : html(row.availabilityLabel)}</small></span>
        <span class="catalog-row-price"><strong>${row.problem === "no_price" ? "—" : html(row.priceLabel)}</strong>${status}</span>`,
        `row:${row.id}`,
        selecting ? `role="checkbox" aria-checked="${chosen}"` : "",
        "catalog-row",
      )
    }

    function resultMarkup(screen) {
      if (screen === screens.search) {
        const query = search(screen).trim()
        if (query.length < 2)
          return '<p class="catalog-muted">Search for orders, customers, and catalog items.</p>'
        const matches = model.filterCatalogShelf(sampleRows, { query })
        return matches.length
          ? section(
              "Catalog",
              `<div class="catalog-shelf">${matches.map(rowMarkup).join("")}</div>`,
            )
          : '<p class="catalog-muted" role="status">No items found.</p>'
      }
      const rows = visibleRows()
      if (rows.length)
        return `<div class="catalog-shelf">${rows.map(rowMarkup).join("")}</div>`
      if (state.scenario === "loading")
        return `<div class="catalog-shelf catalog-skeleton" aria-label="Loading catalog items" role="progressbar">${"<i></i>".repeat(4)}</div>`
      if (state.scenario === "first")
        return `<div class="catalog-first"><p>Start with one item</p><h3>What do you sell?</h3><p>Set a name and price now. You can add the other type any time.</p>${action(`${icon("package")} Add an item`, "new")}${action(`${icon("wrench")} Add a service`, "new-service")}</div>${empty("Search, types and stock show here after your first item.", "", "package")}`
      if (state.scenario === "unavailable") return ""
      if (offline())
        return counts().all
          ? empty("No matching saved items", "Try another search or filter.")
          : empty("No cached items", "Reconnect to load your Catalog.")
      return search(screen) || state.attention || state.filter !== "all"
        ? empty("No matching items", "Try another search or item type.")
        : empty(
            "No catalog items",
            "Add an item or service to start your Catalog.",
          )
    }

    function searchFooter(
      key,
      label,
      placeholder,
      value,
      clear = "clear-search",
    ) {
      return `<div class="catalog-search-footer"><div class="catalog-search-pill">${icon("search")}<input type="search" maxlength="160" data-catalog-field="${key}" aria-label="${label}" placeholder="${placeholder}" value="${html(value)}">${button(icon("close"), clear, `aria-label="Clear search" ${value ? "" : "hidden"}`, "catalog-clear-search")}</div></div>`
    }
    function shelfControls(total) {
      const filters =
        total.product && total.service
          ? `<div class="catalog-filters" aria-label="Item type">${[
              ["all", "All"],
              ["product", "Goods"],
              ["service", "Services"],
            ]
              .map(([key, label]) =>
                button(
                  `${label}<span>${total[key]}</span>`,
                  `filter:${key}`,
                  `aria-pressed="${state.filter === key}"`,
                ),
              )
              .join("")}</div>`
          : ""
      const attention = Object.entries(problems).filter(
        ([key]) => total[key] || state.attention === key,
      )
      return `${offline() ? banner(`Saved items${total.all ? " · as of 09:41" : ""}. Search saved items; reconnect to add an item.`, "Offline mode") : ""}
        ${state.scenario === "unavailable" ? banner("Catalog could not load.", "", "error", action("Try again", "retry-list", "", "outline")) : ""}
        ${filters}
        ${state.scenario === "readonly" ? '<p class="catalog-muted">View only · Ask an owner to add or edit items.</p>' : ""}
        ${
          attention.length
            ? `<div class="catalog-chips">${attention
                .map(([key, info]) =>
                  button(
                    `${icon(info.icon)}${total[key]} ${info.label}`,
                    `attention:${key}`,
                    `aria-pressed="${state.attention === key}" data-tone="${info.tint}"`,
                    "catalog-chip",
                  ),
                )
                .join("")}</div>`
            : ""
        }
        ${action("Clear filters", "clear-filters", `data-catalog-clear-filters ${search(screens.catalog) || state.attention ? "" : "hidden"}`, "ghost")}`
    }

    function listing() {
      const total = counts()
      const first = state.scenario === "first"
      const catalogTitle = total.all
        ? model.catalogShelfTitle(
            Boolean(total.product),
            Boolean(total.service),
          )
        : "Catalog"
      const header = `<header class="catalog-tab-heading"><div><h2>${catalogTitle}</h2>${total.all ? `<p>${model.catalogCountLabel(total)}${offline() ? " · saved" : ""}</p>` : ""}</div>${canEdit() && !first && !state.selecting ? button(`${icon("checkSquare")} Select`, "select", `aria-label="Select items" ${disabled(!visibleRows().length)}`, "catalog-select") : ""}</header>`
      const results = `<div data-catalog-results>${resultMarkup(screens.catalog)}</div>`
      const hides = [...state.selectedIds].some(
        (id) => !rowState(sampleRows.find((row) => row.id === id)).hidden,
      )
      const selectionBar = state.selecting
        ? `<div class="catalog-selection-top">${button(icon("close"), "cancel-select", 'aria-label="Cancel selection"', "catalog-round")}<strong>${state.selectedIds.size} selected</strong>${button(state.selectedIds.size === visibleRows().length ? "Clear all" : "Select all", "select-all")}</div>`
        : ""
      let tail = ""
      if (state.selecting) {
        tail = footer(
          action(
            `${icon(hides ? "hidden" : "eye")} ${hides ? "Hide from sale" : "Show for sale"}`,
            "bulk",
            disabled(!state.selectedIds.size),
          ),
        )
        if (state.overlay === "bulk")
          tail += modal(
            hides ? "Hide from sale" : "Show for sale",
            `<p>${state.selectedIds.size} selected</p>${action(hides ? "Hide from sale" : "Show for sale", "apply-bulk")}`,
          )
      } else if (wantsSearch()) {
        tail =
          state.searchOpen || search(screens.catalog)
            ? searchFooter(
                "query",
                "Search catalog",
                offline() ? "Search saved items" : "Search name, type or unit",
                search(screens.catalog),
              )
            : `<div class="catalog-search-footer">${button(icon("search"), "search-catalog", 'aria-label="Search catalog"', "catalog-search-bubble")}</div>`
      }
      return frame(
        "Catalog",
        selectionBar + header,
        `<div class="catalog-shelf-controls">${shelfControls(total)}</div>${results}`,
        tail,
        "catalog-tab",
      )
    }
    function globalSearch() {
      return frame(
        "Search",
        headers("Search", "Back to Home"),
        `<div data-catalog-results>${resultMarkup(screens.search)}</div>`,
        searchFooter(
          "query",
          "Search",
          "Search anything",
          search(screens.search),
        ),
      )
    }

    function quickAction(
      label,
      glyph,
      target,
      unavailable = false,
      gold = false,
    ) {
      const markup = `<span>${icon(glyph)}</span>${label}`
      const attrs = disabled(unavailable)
      const classes = `catalog-quick-action ${gold ? "catalog-gold" : ""}`
      return target.startsWith("@")
        ? go(markup, target.slice(1), attrs, classes)
        : button(markup, target, attrs, classes)
    }
    function usageSection(data) {
      const draft = state.usageDraft || data.usage
      return section(
        "Usage",
        `<div class="catalog-card catalog-usage"><strong>Item usage</strong>
        <div class="catalog-chips" role="radiogroup" aria-label="Item usage">${Object.entries(
          productUsageLabels,
        )
          .map(([key, label]) =>
            button(
              label,
              `usage:${key}`,
              `role="radio" aria-checked="${draft === key}"`,
              "catalog-usage-choice",
            ),
          )
          .join(
            "",
          )}</div><p class="catalog-muted">${productUsageDescriptions[draft]}</p>
        ${draft !== data.usage ? `<div class="catalog-pair">${action("Cancel", "cancel-usage", "", "outline")}${action("Save usage", "save-usage")}</div>` : ""}</div>`,
      )
    }
    function photoCard(item, data) {
      if (offline()) return ""
      const tone = item.kind === "service" ? "lilac" : "sky"
      const glyph = item.kind === "service" ? "wrench" : "package"
      if (!data.photos.length && !data.illustration)
        return `<div class="catalog-no-photo">
        <span data-tone="${item.kind === "service" ? "lilac" : "amber"}">${icon(glyph)}</span>
        <div>No image yet${canEdit() ? button(" · Add an image", "images", 'aria-label="Add an image"') : ""}</div></div>`
      return `<div class="catalog-cover">
        ${data.photos[0] ? photo(data.photos[0].active, item.name) : illustration(item.kind)}
        <div class="catalog-cover-badge">${pill(`${icon(glyph)}${item.kind === "service" ? "Service" : "Goods"}`, tone)}${data.photos.some(reviewPending) ? pill("Image check pending", "amber") : ""}</div>
        ${data.photos.length > 1 ? `<div class="catalog-cover-dots" aria-hidden="true">${"<span></span>".repeat(data.photos.length)}</div>` : ""}
        ${canEdit() ? button(`${icon("camera")} Edit images`, "images", "", "catalog-cover-edit") : ""}</div>`
    }
    function aboutRow(label, sub, glyph, tone) {
      return `<div class="catalog-about-row"><span data-tone="${tone}">${icon(glyph)}</span><div><strong>${html(label)}</strong><small>${sub}</small></div></div>`
    }
    function optionsFor(item) {
      if (saved().hidden) return []
      const base = {
        id: "default",
        variant: "Default",
        name: item.id === "broiler" ? "Whole bird" : item.unitName,
        price: item.problem === "no_price" ? "Not set" : item.priceLabel,
        quantity: item.problem === "not_counted" ? "—" : item.onHand,
        reserved: item.reserved,
      }
      if (item.id !== "feed") return [base]
      return [
        { ...base, variant: "Starter", name: "25 kg bag" },
        {
          ...base,
          id: "finisher",
          variant: "Finisher",
          name: "25 kg bag",
          price: "₦17,000",
          quantity: 7,
        },
      ]
    }
    function optionRows(options, product, sellable) {
      if (!options.length) return ""
      const row = (option) => {
        const stock = product
          ? `<strong>${option.quantity}</strong>${option.quantity === "—" ? "" : `<small>${option.reserved} res.</small>`}`
          : "Job"
        const cells = `<span><strong>${html(option.name)}</strong><small>${html(option.variant)}</small></span><span>${stock}</span><b>${html(option.price)}</b>`
        return sellable
          ? go(cells, "create-sale-modal", "", "catalog-price-row")
          : `<div class="catalog-price-row">${cells}</div>`
      }
      const filters =
        options.length > 1
          ? `<div class="catalog-chips catalog-variant-filters">${[
              ["all", "All", options.length],
              ...options.map((option) => [option.id, option.variant, 1]),
            ]
              .map(([key, label, count]) =>
                button(
                  `${html(label)} <small>${count}</small>`,
                  `option:${key}`,
                  `aria-pressed="${(state.optionFilter || "all") === key}"`,
                  "catalog-variant",
                ),
              )
              .join("")}</div>`
          : ""
      const rows = options.filter(
        (option) => !state.optionFilter || state.optionFilter === option.id,
      )
      return `${filters}<div class="catalog-prices catalog-card"><div class="catalog-price-head"><span>Option</span><span>${product ? "Stock" : "Work"}</span><span>Price</span></div>${rows.map(row).join("")}</div>`
    }
    function barcodeSection(options, data) {
      if (!options.length) return ""
      return section(
        "Barcodes",
        `<div class="catalog-card">${options
          .map((option) => {
            const code = data.barcodes[option.id]
            const name =
              options.length > 1
                ? `${option.variant} · ${option.name}`
                : option.name
            return button(
              `<span><strong>${html(name)}</strong><small>${code ? html(code) : "No barcode"}</small></span><b>${code ? "Change" : "Add"}</b>`,
              `barcode:${option.id}`,
              "",
              "catalog-barcode-row",
            )
          })
          .join("")}</div>`,
      )
    }
    function unavailableOverview() {
      const pending = state.scenario === "loading"
      const body = pending
        ? `<div class="catalog-skeleton" aria-label="Loading item" role="progressbar"><i></i><i></i><i></i></div>`
        : empty(
            offline() ? "Overview unavailable offline" : "Overview unavailable",
            offline()
              ? "Reconnect to load this item or service."
              : "Catalog item not found.",
            "package",
          )
      return frame(
        "Product overview",
        "",
        `${action(`${icon("arrow")} Back to catalog`, "back", "", "ghost")}${body}
        ${pending || offline() ? "" : action("Try again", "retry-list", "", "outline")}`,
        "",
        "catalog-overview",
      )
    }
    function overview() {
      if (state.overlay === "barcode" && optionsFor(state.item).length)
        return barcodeEditor()
      if (["loading", "unavailable", "offline-empty"].includes(state.scenario))
        return unavailableOverview()
      const item = state.item
      const data = saved()
      const product = item.kind === "product"
      const name = html(item.name)
      const internalUse = data.usage === "INTERNAL_USE"
      const sellable =
        !internalUse &&
        !data.hidden &&
        !item.problem &&
        item.priceLabel !== "Quote"
      const options = optionsFor(item)
      const backButton = button(
        icon("arrow"),
        "back",
        'aria-label="Back to catalog"',
        "catalog-round",
      )
      const header = `<header class="catalog-overview-header">${backButton}<h2>Catalog${item.category ? ` · ${html(item.category)}` : ""}</h2>${canEdit() ? button(icon("camera"), "images", 'aria-label="Edit images"', "catalog-round") : ""}</header>`
      const reason = internalUse
        ? canEdit()
          ? "This internal-use item is hidden from customer orders. Change its usage below to sell it."
          : "Internal-use goods are hidden from customer orders."
        : !options.length
          ? "Add an active option with a price before this item can be ordered."
          : item.priceLabel === "Quote"
            ? "Every option needs a quote before it can be sold."
            : "Add an active option with a price and available stock to sell this item."
      const body = `<div class="catalog-product">${avatar(item, true)}<div><h3>${name}</h3><div class="catalog-chips">${pill(`${icon(product ? "package" : "wrench")}${product ? "Goods" : "Service"}`, product ? "sky" : "lilac")}${pill("Active", "mint")}</div></div></div>
        ${offline() ? banner("As of 09:41. Stock and prices may have changed.", "Saved item") : ""}
        <div class="catalog-shortcuts">
          ${internalUse ? "" : quickAction("New order", "plus", "@create-sale-modal", !sellable, true)}
          ${product ? quickAction("Stock in", "download", "@stock-intake-modal", offline()) : quickAction("Jobs", "wrench", "@service-jobs-modal", offline())}
          ${product && data.usage !== "FOR_SALE" ? quickAction("Record use", "upload", "@stock-intake-modal", offline(), internalUse) : ""}
          ${quickAction("Images", "image", "images", !canEdit())}
          ${quickAction("Share", "share", "share")}
        </div>
        ${sellable ? "" : banner(reason, internalUse ? "For business use only" : "No sellable options")}
        ${optionRows(options, product, sellable)}
        ${section(
          "About",
          `<div class="catalog-card catalog-about">
          ${item.description ? `<p>${html(item.description)}</p>` : ""}
          ${item.category ? aboutRow(item.category, "Category", "grid", "mint") : ""}
          ${product ? aboutRow("Stock-tracked item", "Stock moves when orders are fulfilled", "package", "sky") : aboutRow("Service", "Work is tracked in Service jobs", "wrench", "lilac")}
          ${product && !canEdit() ? aboutRow(productUsageLabels[data.usage], productUsageDescriptions[data.usage], "tag", "amber") : ""}</div>`,
        )}
        ${product && canEdit() ? usageSection(data) : ""}
        ${product && canEdit() ? barcodeSection(options, data) : ""}
        ${photoCard(item, data)}`
      const tail =
        state.overlay === "share"
          ? modal(
              "Share",
              `<p>${name}</p>${options.map((option) => `<p>${html(option.name)}: ${html(option.price)}</p>`).join("")}${action("Done", "close-overlay")}`,
            )
          : ""
      return frame(
        "Product overview",
        "",
        `${header}${body}`,
        tail,
        "catalog-overview",
      )
    }
    function modal(label, content) {
      return `<div class="catalog-modal"><button type="button" class="catalog-modal-scrim" data-catalog="close-overlay" aria-label="Dismiss ${label}"></button><section role="dialog" aria-modal="true" aria-label="${label}"><h3>${label}</h3>${content}</section></div>`
    }
    function barcodeEditor() {
      const option = optionsFor(state.item).find(
        (option) => option.id === state.barcodeOption,
      )
      const currentCode = saved().barcodes[state.barcodeOption] || ""
      return frame(
        "Barcode",
        headers("Barcode", "Close barcode", "", false, true),
        `<strong>${html(option.variant)} · ${html(option.name)}</strong>
        ${field("Barcode", "barcode", state.barcode, 'maxlength="120" placeholder="Scan or type"')}
        <p class="catalog-muted" data-catalog-barcode-warning ${currentCode && state.barcode.trim() && currentCode !== state.barcode.trim() ? "" : "hidden"}>This replaces barcode ${html(currentCode)}. Each option keeps one barcode.</p>
        ${action("Save barcode", "save-barcode", disabled(!state.barcode.trim() || state.barcode.trim() === currentCode))}
        ${currentCode ? action("Remove barcode", "remove-barcode", "", "outline") : ""}`,
      )
    }

    function setup() {
      const draft = state.draft
      const name = draft.kind === "service" ? "Add service" : "Add item"
      return frame(
        name,
        headers(name, "Back from item setup"),
        `<h3>Essentials</h3>
        ${field("Item name", "name", draft.name, 'placeholder="e.g. Broiler chicken"')}
        ${field("Selling price", "price", draft.price, 'inputmode="decimal" placeholder="₦0"')}
        <label class="catalog-field">Description<textarea data-catalog-field="description" placeholder="Optional">${html(draft.description)}</textarea></label>
        <h3>Optional details</h3>
        ${button(`<span>Images</span><small>${draft.photos.length ? `${draft.photos.length} selected` : draft.illustration ? "Illustration selected" : "Add a photo or illustration"} ${icon("next")}</small>`, "images", "", "catalog-detail")}`,
        footer(
          action(
            `Save ${draft.kind === "service" ? "service" : "item"}`,
            "save-item",
          ),
        ),
      )
    }

    function noteMarkup() {
      const target = media()
      return `<div class="catalog-note">${button(target.noteOpen ? "Hide optional note" : "+ Add a note (optional)", "toggle-note", `aria-expanded="${target.noteOpen}"`)}
        ${target.noteOpen ? `<label class="catalog-field">Additional direction (optional)<textarea data-catalog-field="note" maxlength="500" placeholder="e.g. A warm, neutral background">${html(target.note)}</textarea></label>` : ""}</div>`
    }
    function thumbnail(photoEntry, index) {
      const number = index + 1
      return `<div class="catalog-thumbnail">
        ${button(photo(photoEntry.active, `Image ${number} of ${title()}`), `view:${index}`, `aria-label="View image ${number}"`, "catalog-view-photo")}
        ${index === 0 ? '<span class="catalog-primary-label">Primary</span>' : button("Make primary", `primary:${index}`, `aria-label="Make image ${number} primary" ${disabled(locked())}`, "catalog-make-primary")}
        ${button(`<span>${icon("close")}</span>`, `remove:${index}`, `aria-label="Remove image ${number}" ${disabled(locked())}`, "catalog-remove-photo")}
        ${button(`<span>${icon("sparkles")} Refine</span>`, `refine:${index}`, `aria-label="Refine image ${number} with AI" ${disabled(!canRefine() || reviewPending(photoEntry))}`, "catalog-refine-photo")}
      </div>`
    }
    const locked = () => busy() || Boolean(state.saveError)
    const reviewPending = (item) =>
      state.imagesScenario === "review" && item.active === original
    const remaining = () =>
      state.imagesScenario === "exhausted" ? 0 : state.allowance
    const aiAvailable = () =>
      remaining() > 0 && state.imagesScenario !== "paused"
    const activeJob = () => (state.job?.target === media() ? state.job : null)
    function feedback() {
      if (state.writing)
        return '<p class="catalog-muted" role="status">Saving images…</p>'
      if (state.saveError)
        return `${banner("Images could not be saved. Try again.")}${action("Retry saving images", "retry-save", "", "outline")}`
      return ""
    }
    function images() {
      if (state.source) return sourceView()
      const target = media()
      const draft = isDraft()
      const kind = draft ? target.kind : state.item.kind
      const backLabel = draft ? "Back to item setup" : `Back to ${title()}`
      const full = target.photos.length >= 8
      const job = activeJob()
      return frame(
        "Images",
        headers("Images", backLabel, "", state.writing),
        `${!draft ? `<p class="catalog-muted">${html(title())}</p>` : ""}
        ${feedback()}
        ${target.illustration ? `<div class="catalog-card catalog-illustration-card">${illustration(kind)}${action("Remove illustration", "remove-illustration", disabled(locked()), "outline")}</div>` : ""}
        <div class="catalog-images-heading"><h3>Your images</h3><span>${target.photos.length} / 8</span></div>
        ${target.photos.length ? `<div class="catalog-photos">${target.photos.map(thumbnail).join("")}</div>` : ""}
        <div class="catalog-sources">${[
          ["camera", "Take photo", "camera"],
          ["choose", "Choose", "image"],
          ["library", "My images", "grid"],
        ]
          .map(([key, label, glyph]) =>
            button(
              `${icon(glyph)}<span>${label}</span>`,
              `source:${key}`,
              disabled(locked() || full),
            ),
          )
          .join("")}</div>
        <div class="catalog-card catalog-ai"><h3>${icon("sparkles")} Create a new image</h3><p class="catalog-muted">Uses your ${kind === "service" ? "service" : "product"} details.</p>
          ${action(`${icon("sparkles")} Generate with AI`, "generate", disabled(!title().trim() || locked() || !aiAvailable() || full))}
          ${noteMarkup()}</div>
        <p class="catalog-allowance">${model.catalogAiAllowanceLabel(remaining(), "lifetime")}${job ? " · 1 reserved" : ""}</p>
        ${job ? banner(`${job.refining ? "Refining your photo…" : "Creating your image…"} You can leave Images and return.`, "", "default") : ""}
        ${!job && !aiAvailable() ? `<p class="catalog-muted">${remaining() ? "AI generation is currently unavailable." : "You have used your free generations."} Your images remain available.</p>` : ""}
        ${target.photos.some(reviewPending) ? '<p class="catalog-muted">Your photo stays private while its image check runs. Refine becomes available after it passes.</p>' : ""}
        ${action("Illustration library", "source:illustrations", disabled(locked()), "ghost")}`,
        "",
        "catalog-images",
      )
    }
    function sourceView() {
      const source = state.source
      const target = media()
      const kind = isDraft() ? target.kind : state.item.kind
      const name = html(title() || "this item")
      if (source === "library") {
        const add = button(
          state.sourcePicked ? "Add 1" : "Add",
          "add-source",
          `aria-label="${state.sourcePicked ? "Add 1 photo" : "Add photos"}" ${disabled(!state.sourcePicked)}`,
          "catalog-library-add",
        )
        return frame(
          "My images",
          headers("My images", "Back to Images", add),
          `<p class="catalog-muted">${state.sourcePicked ? `1 selected · up to ${8 - target.photos.length} for ${name}` : `Pick up to ${8 - target.photos.length} for ${name}.`}</p><div data-catalog-library>${libraryResults()}</div>`,
          searchFooter(
            "sourceSearch",
            "Search My images",
            "Search titles, categories, items",
            state.sourceSearch,
            "clear-library-search",
          ),
        )
      }
      if (source === "illustrations")
        return frame(
          "Illustration library",
          headers(
            "Illustration library",
            "Close illustration library",
            "",
            false,
            true,
          ),
          `<div class="catalog-card catalog-illustration-card">${illustration(kind)}<strong>${kind === "service" ? "Produce crate" : "Chicken"}</strong>
        ${action("Use illustration", "use-illustration")}</div>`,
        )
      const camera = source === "camera"
      const label = camera ? "Take photo" : "Choose photo"
      return frame(
        label,
        headers(label, "Back to Images"),
        button(
          photo(original, "Sample chicken photo"),
          "pick-source",
          `aria-label="Select sample photo" aria-pressed="${state.sourcePicked}"`,
          "catalog-library-card",
        ),
        footer(
          action(
            camera ? "Use photo" : "Add selected",
            "add-source",
            disabled(!state.sourcePicked),
          ),
        ),
      )
    }
    function libraryResults() {
      if (
        !"broiler chicken poultry".includes(
          state.sourceSearch.trim().toLowerCase(),
        )
      )
        return empty("No matching images", "Try another search.", "image")
      return button(
        `${photo(original, "Broiler chicken")}<strong>Broiler chicken</strong><small>Poultry</small>`,
        "pick-source",
        `aria-pressed="${state.sourcePicked}"`,
        "catalog-library-card",
      )
    }
    function gallery() {
      const image = selectedImage()
      if (!image) return images()
      const version = state.viewed || image.active
      const job = activeJob()
      const currentVersion = version === image.active
      const isRefinement = version.parent !== null
      const count = media().photos.length
      const pageTitle = `Image ${state.imageIndex + 1} of ${count}`
      return frame(
        "Image gallery",
        headers(pageTitle, "Back to images"),
        `<p class="catalog-muted">${version.label}${currentVersion ? " · Default" : ""}</p>
        <div class="catalog-gallery-photo">${photo(version, `${title()} · ${version.label}`)}
          ${count > 1 ? `<div class="catalog-gallery-arrows">${button(icon("back"), "previous", 'aria-label="Previous image"', "catalog-round")}${button(icon("next"), "next", 'aria-label="Next image"', "catalog-round")}</div>` : ""}
        </div>
        <div class="catalog-history" aria-label="Photo history">${image.versions.map((item, index) => button(`<strong>${item.label}</strong>${item === image.active ? "<small>Default</small>" : ""}`, `history:${index}`, `aria-pressed="${item === version}"`)).join("")}</div>
        <div class="catalog-gallery-actions">
          ${currentVersion ? '<p class="catalog-muted">Shown in your image list</p>' : action(`Use ${version.label.toLowerCase()}`, "use-version", disabled(locked()), "outline")}
          ${isRefinement ? button("Delete refinement", "delete-version", disabled(locked()), "catalog-inline") : ""}
        </div>
        ${
          state.confirmDelete
            ? `<div class="catalog-card catalog-illustration-card"><p>Delete this refinement and any refinements made from it? Your original stays.</p>
          ${action("Keep", "cancel-delete", "", "outline")}${action("Delete refinement", "confirm-delete", disabled(locked()))}</div>`
            : ""
        }
        ${feedback()}
        ${job ? banner(job.refining ? "Refining your photo…" : "Creating your image…", "", "default") : ""}
        <p class="catalog-muted">Check colour, shape and labels before using an AI edit.</p>
        ${noteMarkup()}`,
        footer(
          action(
            `${icon("sparkles")} ${isRefinement ? "Refine again" : "Refine with AI"}`,
            "refine-viewed",
            disabled(!canRefine() || reviewPending(image)),
          ),
        ),
        "catalog-gallery",
      )
    }

    function cancelSelection() {
      state.selecting = false
      state.selectedIds.clear()
      state.overlay = ""
    }
    function repaint() {
      if (current() in renderers) paint()
      refreshDock()
    }
    function setScenario(value) {
      if (value === state.scenario) return
      state.scenario = value
      syncScenario(value)
      state.queries[screens.catalog] = ""
      state.searchOpen = false
      state.filter = "all"
      state.attention = null
      cancelSelection()
      repaint()
    }
    function setImagesScenario(value) {
      state.imagesScenario = value
      repaint()
    }
    function enter(screen, previous) {
      if (screen === previous || reversing) return
      if (previous === screens.catalog) cancelSelection()
      if (screen === screens.setup && previous !== screens.images) {
        state.draft = {
          photos: [],
          illustration: false,
          note: "",
          noteOpen: false,
          name: "",
          price: "",
          description: "",
          kind: nextItemKind,
        }
        nextItemKind = "product"
      }
      if (
        [screens.images, screens.gallery].includes(screen) &&
        ![screens.images, screens.gallery].includes(previous)
      ) {
        state.origin =
          previous === screens.setup ? screens.setup : screens.product
        state.source = ""
        selectImage(0)
      }
      if (screen === screens.gallery) state.source = ""
      if (screen === screens.product) {
        state.usageDraft = null
        state.optionFilter = ""
        state.overlay = ""
      }
      if (
        screen in renderers &&
        ![screens.images, screens.gallery].includes(screen)
      )
        state.parents[screen] = previous
    }
    function selectImage(index) {
      state.imageIndex = index
      state.viewed = selectedImage()?.active ?? null
      state.confirmDelete = false
    }
    function back() {
      const screen = current()
      if (state.source && screen === screens.images) {
        state.source = ""
        return repaint()
      }
      if (state.overlay) {
        state.overlay = ""
        return repaint()
      }
      if (screen === screens.images && state.writing) return
      if (screen === screens.images && state.saveAttempt) {
        Object.assign(state.saveAttempt.target, state.saveAttempt.before)
        state.saveAttempt = null
        state.saveError = false
      }
      const destination =
        screen === screens.gallery
          ? screens.images
          : screen === screens.images
            ? state.origin
            : screen === screens.product
              ? state.parents[screen] === screens.search
                ? screens.search
                : screens.catalog
              : screen === screens.setup &&
                  state.parents[screen] === screens.catalog
                ? screens.catalog
                : home
      reversing = true
      try {
        navigate(destination, true)
      } finally {
        reversing = false
      }
    }
    function write() {
      state.writing = true
      state.saveError = false
      repaint()
      writeTimer = setTimeout(() => {
        state.writing = false
        if (state.imagesScenario === "save-error" && !state.saveAttempt.retried)
          state.saveError = true
        else state.saveAttempt = null
        repaint()
      }, 380)
    }
    function changeImages(change) {
      const target = media()
      if (isDraft()) {
        change(target)
        return repaint()
      }
      if (locked()) return
      const before = {
        photos: target.photos.map((image) => ({
          ...image,
          versions: [...image.versions],
        })),
        illustration: target.illustration,
      }
      state.saveAttempt = { target, before, retried: false }
      change(target)
      write()
    }
    function runJob(image, source) {
      if (state.job || locked() || !aiAvailable()) return
      const target = media()
      if (!image && (!title().trim() || target.photos.length >= 8)) return
      if (image && reviewPending(image)) return
      const job = { target, refining: Boolean(image) }
      state.job = job
      repaint()
      resetTimer = setTimeout(() => {
        state.allowance -= 1
        state.job = null
        target.illustration = false
        if (image) {
          const next = {
            label: `Refinement ${image.versions.length}`,
            appearance: "refined",
            parent: source,
          }
          image.versions.push(next)
          image.active = next
          if (current() === screens.gallery && selectedImage() === image)
            state.viewed = next
        } else target.photos.push(entry(generated))
        if (
          [screens.product, screens.images, screens.gallery].includes(current())
        )
          repaint()
      }, 1050)
    }
    function addSource() {
      if (!state.sourcePicked || media().photos.length >= 8) return
      state.source = ""
      changeImages((target) => {
        target.illustration = false
        target.photos.push(entry(original))
      })
    }
    function chooseRow(id) {
      if (current() === screens.catalog && state.selecting) {
        if (!state.selectedIds.delete(id)) state.selectedIds.add(id)
        return repaint()
      }
      state.item = sampleRows.find((row) => row.id === id)
      navigate(screens.product)
    }
    function openNew(kind) {
      nextItemKind = kind
      navigate(screens.setup)
    }
    function browseSource(source) {
      state.source = source
      state.sourcePicked = false
      state.sourceSearch = ""
      repaint()
    }
    function openSearch() {
      state.searchOpen = true
      repaint()
      focus("query")
    }
    function clearFilters() {
      state.queries[screens.catalog] = ""
      state.attention = null
      state.searchOpen = false
      cancelSelection()
      repaint()
    }
    function deleteVersion() {
      const image = selectedImage()
      const selected = state.viewed
      if (!image || !selected?.parent) return
      const descendsFrom = (version) => {
        for (let current = version; current; current = current.parent)
          if (current === selected) return true
        return false
      }
      state.confirmDelete = false
      changeImages(() => {
        image.versions = image.versions.filter(
          (version) => !descendsFrom(version),
        )
        if (descendsFrom(image.active)) image.active = selected.parent
        state.viewed = image.active
      })
    }
    function setBarcode(value) {
      saved().barcodes[state.barcodeOption] = value
      state.overlay = ""
      repaint()
    }
    const actions = {
      back,
      new: () => openNew("product"),
      "new-service": () => openNew("service"),
      "save-item": () => (state.draft.name.trim() ? back() : focus("name")),
      "search-catalog": openSearch,
      "clear-search": () => {
        state.queries[current()] = ""
        repaint()
        focus("query")
      },
      "clear-filters": clearFilters,
      "retry-list": () => setScenario("mixed"),
      select: () => {
        state.selecting = true
        repaint()
      },
      "cancel-select": () => {
        cancelSelection()
        repaint()
      },
      "select-all": () => {
        const rows = visibleRows()
        state.selectedIds = new Set(
          rows.every((row) => state.selectedIds.has(row.id))
            ? []
            : rows.map((row) => row.id),
        )
        repaint()
      },
      bulk: () => {
        state.overlay = "bulk"
        repaint()
      },
      "apply-bulk": () => {
        const rows = sampleRows
          .filter((row) => state.selectedIds.has(row.id))
          .map(rowState)
        const hides = rows.some((row) => !row.hidden)
        for (const row of rows) row.hidden = hides
        cancelSelection()
        repaint()
      },
      images: () => navigate(screens.images),
      share: () => {
        state.overlay = "share"
        repaint()
      },
      "close-overlay": () => {
        state.overlay = ""
        repaint()
      },
      "cancel-usage": () => {
        state.usageDraft = null
        repaint()
      },
      "save-usage": () => {
        saved().usage = state.usageDraft
        state.usageDraft = null
        repaint()
      },
      "save-barcode": () => setBarcode(state.barcode.trim()),
      "remove-barcode": () => setBarcode(""),
      "toggle-note": () => {
        media().noteOpen = !media().noteOpen
        repaint()
      },
      "pick-source": () => {
        state.sourcePicked = !state.sourcePicked
        repaint()
      },
      "add-source": addSource,
      "clear-library-search": () => {
        state.sourceSearch = ""
        repaint()
        focus("sourceSearch")
      },
      "use-illustration": () => {
        state.source = ""
        changeImages((target) => {
          target.illustration = true
          target.photos = []
        })
      },
      "remove-illustration": () =>
        changeImages((target) => {
          target.illustration = false
        }),
      generate: () => runJob(),
      "refine-viewed": () => runJob(selectedImage(), state.viewed),
      "use-version": () =>
        changeImages(() => {
          selectedImage().active = state.viewed
        }),
      "delete-version": () => {
        state.confirmDelete = true
        repaint()
      },
      "cancel-delete": () => {
        state.confirmDelete = false
        repaint()
      },
      "confirm-delete": deleteVersion,
      "retry-save": () => {
        if (!state.saveError || !state.saveAttempt) return
        state.saveAttempt.retried = true
        write()
      },
      next: () => moveImage(1),
      previous: () => moveImage(-1),
    }
    function moveImage(offset) {
      const count = media().photos.length
      selectImage((state.imageIndex + count + offset) % count)
      repaint()
    }
    const itemActions = {
      row: chooseRow,
      option: (id) => {
        state.optionFilter = id === "all" ? "" : id
        repaint()
      },
      barcode: (id) => {
        state.barcodeOption = id
        state.barcode = saved().barcodes[id] || ""
        state.overlay = "barcode"
        repaint()
      },
      filter: (filter) => {
        state.filter = filter
        cancelSelection()
        repaint()
      },
      attention: (key) => {
        state.attention = state.attention === key ? null : key
        cancelSelection()
        repaint()
      },
      usage: (value) => {
        state.usageDraft = value
        repaint()
      },
      source: browseSource,
      view: (index) => {
        selectImage(Number(index))
        navigate(screens.gallery)
      },
      remove: (index) =>
        changeImages((target) => {
          target.photos.splice(Number(index), 1)
        }),
      primary: (index) =>
        changeImages((target) => {
          target.photos.unshift(...target.photos.splice(Number(index), 1))
        }),
      refine: (index) => {
        const image = media().photos[Number(index)]
        runJob(image, image.active)
      },
      history: (index) => {
        state.viewed = selectedImage().versions[Number(index)]
        state.confirmDelete = false
        repaint()
      },
    }
    function click(key) {
      const [name, value] = key.split(":")
      if (value !== undefined) itemActions[name]?.(value)
      else actions[name]?.()
    }
    function input(key, value, root) {
      if (key === "query") {
        const screen = current()
        state.queries[screen] = value
        root.querySelector("[data-catalog-results]").innerHTML =
          resultMarkup(screen)
        root.querySelector('[data-catalog="clear-search"]').hidden = !value
        if (screen === screens.catalog)
          root.querySelector("[data-catalog-clear-filters]").hidden =
            !value && !state.attention
      } else if (key === "sourceSearch") {
        state.sourceSearch = value
        root.querySelector("[data-catalog-library]").innerHTML =
          libraryResults()
        root.querySelector('[data-catalog="clear-library-search"]').hidden =
          !value
      } else if (key === "note") media().note = value
      else if (key === "barcode") {
        state.barcode = value
        const currentCode = saved().barcodes[state.barcodeOption] || ""
        const next = value.trim()
        root.querySelector('[data-catalog="save-barcode"]').disabled =
          !next || next === currentCode
        root.querySelector("[data-catalog-barcode-warning]").hidden =
          !currentCode || !next || next === currentCode
      } else state.draft[key] = value
    }
    function blur(key) {
      if (
        key === "query" &&
        current() === screens.catalog &&
        !search(screens.catalog)
      ) {
        state.searchOpen = false
        repaint()
      }
    }
    function selectByGesture(action) {
      if (
        current() !== screens.catalog ||
        !canEdit() ||
        !action?.startsWith("row:")
      )
        return false
      state.selecting = true
      chooseRow(action.slice(4))
      return true
    }

    const renderers = {
      [screens.catalog]: listing,
      [screens.search]: globalSearch,
      [screens.product]: overview,
      [screens.setup]: setup,
      [screens.images]: images,
      [screens.gallery]: gallery,
    }
    return {
      renderers,
      enter,
      click,
      input,
      blur,
      reset,
      setScenario,
      setImagesScenario,
      selectByGesture,
      isSelecting: () => state.selecting,
    }
  }
  window.MOBILE_PRODUCTION_CATALOG = {
    create,
    screens,
    scenarios,
    installPalette,
  }
})()
