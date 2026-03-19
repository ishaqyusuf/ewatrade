# Business Types

## Purpose
Define the business type taxonomy used to:
1. Collect the right onboarding information per business
2. Select appropriate website builder templates
3. Drive marketplace categorisation and discoverability
4. Configure relevant features per business kind (e.g., booking vs cart vs food order)

---

## Model Approach: Two-Layer Taxonomy

Use a **two-level taxonomy** stored as a lookup table (not a hardcoded enum) so new kinds can be added without schema migrations.

### Layer 1 — Business Category (broad grouping)
| Slug | Label |
|---|---|
| `food_beverage` | Food & Beverage |
| `retail_goods` | Retail & Goods |
| `services` | Services |
| `hospitality` | Hospitality |
| `health` | Health & Wellness |
| `logistics` | Logistics & Delivery |

### Layer 2 — Store Kind (specific business type)
Each `StoreKind` belongs to a `businessCategory`. Tenant sets their `storeKind` during onboarding. This drives template selection.

| Slug | Label | Category |
|---|---|---|
| `foodstuff` | Foodstuff / Provisions | food_beverage |
| `grocery` | Groceries | food_beverage |
| `restaurant` | Restaurant | food_beverage |
| `small_chops` | Small Chops / Fast Food | food_beverage |
| `bakery` | Bakery | food_beverage |
| `drinks_bar` | Drinks & Bar | food_beverage |
| `fashion_wears` | Fashion & Wears | retail_goods |
| `footwear` | Shoes & Footwear | retail_goods |
| `electronics` | Electronics & Gadgets | retail_goods |
| `beauty_cosmetics` | Beauty & Cosmetics | retail_goods |
| `farm_feeds` | Farm Feeds & Agro Supplies | retail_goods |
| `pharmacy` | Pharmacy | health |
| `cleaning_service` | Cleaning Service | services |
| `event_planning` | Event Planning | services |
| `laundry` | Laundry Service | services |
| `hotel_booking` | Hotel / Lodging | hospitality |
| `flight_booking` | Flight & Travel Booking | hospitality |
| `general_store` | General Store | retail_goods |

---

## Schema Entities

### `BusinessCategory`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `slug` | string | unique, e.g. `food_beverage` |
| `label` | string | e.g. `Food & Beverage` |
| `icon` | string | optional icon name |
| `order` | int | sort order for display |

### `StoreKind`
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `slug` | string | unique, e.g. `restaurant` |
| `label` | string | e.g. `Restaurant` |
| `categoryId` | FK → BusinessCategory | |
| `templateHints` | string[] | slugs of recommended templates |
| `featureFlags` | json | e.g. `{ "booking": true, "foodOrder": true }` |
| `icon` | string | optional |

### `Tenant` (addition)
- `storeKindId` FK → `StoreKind` (set during onboarding Step 2)

---

## Template Selection

During website builder setup, the template picker is **filtered by `storeKind`**.

```
Tenant.storeKind = "restaurant"
  → loads templates tagged with "restaurant"
  → shows menus, food gallery, order CTA sections
  → hides sections irrelevant to restaurants

Tenant.storeKind = "hotel_booking"
  → shows room listings, booking calendar, amenities sections

Rider / DriverProfile site
  → shows rider profile, zones, ratings sections
```

Template compatibility is stored on `Template.compatibleKinds` (array of `StoreKind` slugs). A template with no restriction is shown to all kinds.

---

## Feature Flags by Kind

Some business kinds unlock or restrict certain features:

| Feature | Restaurant | Pharmacy | Cleaning Service | Hotel |
|---|---|---|---|---|
| Cart / item order | Yes | Yes | No | No |
| Booking / scheduling | No | No | Yes | Yes |
| Menu sections | Yes | No | No | No |
| Product variants | No | Yes | No | No |
| Service catalog | No | No | Yes | No |

Feature flags are stored on `StoreKind.featureFlags` and used to show/hide builder sections and dashboard tools.

---

## Rules
- Every merchant tenant must select a `storeKind` during onboarding.
- `storeKind` can be changed post-onboarding (triggers template re-selection suggestion).
- New store kinds can be added by platform admin without code changes.
- Logistics tenant type does NOT use `storeKind` — it uses `dispatchType` (individual rider / courier / fleet / 3PL).
