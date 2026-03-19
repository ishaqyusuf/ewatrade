# POS Software

## Overview

EwaTrade POS is a desktop application built with **Tauri** (Rust + Web frontend). It runs on merchant hardware at physical store locations.

Key characteristics:
- **Offline-first**: operates fully without internet; syncs when connection is available
- **Dual-screen**: supports 2-monitor POS setups (cashier screen + customer-facing display)
- **Zero downtime**: local data store ensures sales are never interrupted by connectivity issues
- **Import-capable**: merchants can bulk-import product catalog from Excel, CSV, or via an extraction agent from their existing software

---

## Dual-Screen Support

| Screen | Audience | Content |
|---|---|---|
| **Primary (cashier)** | Store staff | Full POS controls, cart management, customer lookup, payment management |
| **Secondary (customer display)** | Walk-in customer | Cart summary (items, quantities, prices), total, promotions, payment prompt |

The secondary screen is driven from the primary — all state is mirrored in real-time.

---

## Offline Mode

### Local Data Store
- Products, inventory, prices, customer records are synced to a local SQLite database (via Tauri)
- All transactions created offline are stored locally first
- A sync queue tracks unsynced records

### Sync Strategy
- **On reconnect**: background sync pushes offline transactions to server
- **Conflict resolution**: server timestamp wins for inventory; local wins for new orders
- **Sync indicators**: status bar shows "online / syncing / offline" state
- **Periodic sync**: every 60 seconds when online (products, price updates, inventory)

### What Works Offline
| Feature | Offline |
|---|---|
| Browse product catalog | Yes (local) |
| Barcode scanning | Yes |
| Create & complete order | Yes |
| Apply discount / promotion | Yes (cached promotions) |
| Print receipt | Yes |
| Customer lookup | Yes (local TenantCustomer cache) |
| Payment (cash) | Yes |
| Payment (card/USSD) | No — requires connectivity |
| Inventory sync | Queued for next sync |

---

## Store Import System

Merchants can import their product catalog via:

### Option 1 — Excel / CSV Upload
- Template provided by EwaTrade (downloadable from dashboard)
- Columns: `product_name`, `sku`, `barcode`, `category`, `price`, `cost_price`, `qty`, `unit`, `variants`
- Validation: duplicate SKUs detected, missing required fields flagged
- Preview before import: merchant reviews a summary before committing
- Errors reported per row with correction guidance

### Option 2 — AI Extraction Agent (Planned)
- For merchants currently on another POS/inventory system
- EwaTrade sends or provides an agent that connects to the merchant's existing software
- Extracts product data and maps it to EwaTrade's catalog schema
- Supported source systems (planned): QuickBooks, Sage, Excel-based POS, custom spreadsheets
- Agent generates a verified import file → merchant approves → import runs

---

## POS Feature Set

### Product Management
- Barcode scanning (USB scanner or camera)
- Product search (by name, SKU, barcode)
- Quick-add tiles for frequent items
- Category tabs for fast navigation

### Cart & Order
- Add / remove / adjust qty on cart items
- Apply item-level or order-level discounts
- Hold order (park cart) → resume later
- Split bill (split into multiple payments)
- Order notes (e.g. "no sugar")

### Payment
- Cash — enter amount, system calculates change
- Card (external terminal) — mark as paid externally
- USSD / Mobile money — Paystack/Flutterwave (requires connectivity)
- Multiple payment methods on one order (split: cash + card)

### Customer
- Walk-in: create anonymous or named customer
- Look up existing TenantCustomer (by name, phone, or customer code)
- Attach customer to order for loyalty tracking

### Receipts
- Print receipt (thermal printer via Tauri native print)
- Digital receipt via SMS or WhatsApp (requires connectivity)
- Receipt includes: store name, items, qty, price, total, payment method, timestamp, cashier name

### Inventory
- Stock deducted on order completion
- Low stock alerts on product tiles
- End-of-day report: sales total, items sold, cash drawer summary

### Cashier Sessions
- Cashier clocks in / opens session with opening float amount
- All transactions tagged to cashier + session
- End of session: cashier counts cash, system reconciles
- Session report sent to dashboard

---

## Walk-In Self-Service QR Checkout (POS Integration)

See `brain/modules/pos-cashier.md` for full flow.

Summary:
1. Customer uses EwaTrade mobile app to scan items in-store
2. At counter, cashier scans customer's QR code from their app
3. Order appears on cashier's primary POS screen
4. Cashier verifies items and prices
5. Cashier approves → customer sees "Pay Now" + optional tip on their app
6. Customer pays via app
7. Both screens show "Order Complete"

---

## Tauri Technical Notes
- Frontend: React + Tailwind (shared with web design system via `packages/ui`)
- Backend: Rust (Tauri commands for native features: serial port for barcode scanner, thermal printer, local SQLite via `rusqlite` or `sqlx`)
- Auto-update: Tauri built-in updater
- Platform: Windows (primary), macOS (secondary)
- Packaging: `.exe` installer for Windows, `.dmg` for macOS
