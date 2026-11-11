#!/usr/bin/env python3
"""Snapshot EwaTrade's mobile UI inventory and related Workshop evidence."""

import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from tempfile import NamedTemporaryFile
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/mobile/src/app"
COMPONENTS = ROOT / "apps/mobile/src/components"
WORKSHOP = Path(os.environ.get("WORKSHOP_HOME", Path.home() / "Documents/code/workshop"))
SPLASH = "apps/mobile/src/components/mobile/appearances/classic/startup-splash.tsx"
CREATE = "apps/mobile/src/components/mobile/admin-tabs/admin-create-action-sheet.tsx"
HOME = "apps/mobile/src/app/(admin-tabs)/admin-home.tsx"

LABELS = {
    "admin-home": "Home",
    "business-switch-modal": "Workspaces",
    "sync-status-modal": "Sync & offline",
    "catalog-items-modal": "Catalog directory",
    "first-product-setup-modal": "Item setup",
    "create-sale-modal": "New sale",
    "global-search": "Global search",
    "ask-assistant": "Assistant",
    "payments-received-modal": "Payments received",
    "stock-intake-modal": "Stock entry",
}
AREA_RULES = (
    ("Account & settings", r"account|app-lock|updates|subscription|settings"),
    ("Entry & access", r"onboarding|login|sign-up|verify-email|owner-setup|no-access"),
    ("Catalog & stock", r"catalog|product|stock|inventory|unit-conversion"),
    ("Orders & payments", r"order|sale|payment|receipt|shipment"),
    ("Finance", r"finance|closeout|reports"),
    ("Customers & staff", r"customer|staff"),
    ("Assistant", r"assistant|whatsapp"),
)
SHEET = re.compile(r"<(Modal|BottomSheetModal|[A-Z]\w*Sheet)(?=[\s/>])")
IMPORT = re.compile(r'["\']@/(components/(?:mobile|ui)/[^"\']+)["\']')
BASELINE = {
    "splash": (
        "Startup splash",
        SPLASH,
        "legacy/mobile-quality-workshop?rev=f9f8714e-0bfd-46f5-b03a-69cabfc93d12&screen=20-auth-onboarding%2Findex.html",
    ),
    "(admin-tabs)/admin-home": (
        "Home",
        HOME,
        "legacy/mobile-quality-workshop?rev=f9f8714e-0bfd-46f5-b03a-69cabfc93d12&screen=01-home%2Fv2%2Findex.html",
    ),
    "quick-create": ("Quick create", CREATE, None),
    "business-switch-modal": ("Workspaces", "apps/mobile/src/app/business-switch-modal.tsx", None),
    "sync-status-modal": ("Sync & offline", "apps/mobile/src/app/sync-status-modal.tsx", None),
}
QUALITY_REVISION = "f9f8714e-0bfd-46f5-b03a-69cabfc93d12"
QUALITY_PAGES = {
    "(admin-tabs)/catalog": "05-catalog",
    "(admin-tabs)/more": "07-more",
    "(admin-tabs)/orders": "03-orders",
    "ask-assistant": "25-ask-assistant",
    "business-switch-modal": "20-auth-onboarding",
    "catalog-item/[catalogItemId]": "06-catalog-item",
    "catalog-items-modal": "05-catalog",
    "closeout-modal": "09-closeout",
    "create-sale-modal": "02-create-sale",
    "customer-book-modal": "08-customer-book",
    "customer-ledger-modal": "18-customer-ledger",
    "customer-ledger/[customerId]": "18-customer-ledger",
    "finance-modal": "12-finance-hub",
    "first-product-setup-modal": "19-first-product-setup",
    "global-search": "11-global-search",
    "login": "20-auth-onboarding",
    "no-access": "20-auth-onboarding",
    "onboarding": "20-auth-onboarding",
    "order-receipts-modal": "17-receipts",
    "order/[orderId]": "04-order-detail",
    "owner-setup": "20-auth-onboarding",
    "payments-received-modal": "16-payments-reports",
    "reports-modal": "16-payments-reports",
    "sales-rep-home": "01-home",
    "service-jobs-modal": "14-service-jobs",
    "setup-assistant": "24-setup-assistant",
    "sign-up": "20-auth-onboarding",
    "staff-invite-modal": "13-staff",
    "staff-onboarding": "20-auth-onboarding",
    "stock-intake-modal": "10-stock-intake",
    "sync-status-modal": "15-sync-status",
    "verify-email": "20-auth-onboarding",
    "(customer)/conversations/index": "23-customer-conversations",
    "(customer)/conversations/[conversationId]": "23-customer-conversations",
}


def relative(path):
    return path.relative_to(ROOT).as_posix()


def label(text):
    return LABELS.get(text, text.removesuffix("-modal").replace("-", " ").capitalize())


def area_for(text):
    if text.startswith("qa-"):
        return "QA only"
    for area, pattern in AREA_RULES:
        if re.search(pattern, text):
            return area
    return "App navigation"


def catalog_evidence(database):
    """Only exact files in recorded implementation receipts link to a surface."""
    by_file = {}
    seen = set()
    with sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute("""
            SELECT w.path, w.title, d.key, d.id AS direction_id, r.id, r.version,
                   i.files, i.commit_hash
            FROM implementations i
            JOIN workshops w ON w.id = i.workshop_id
            JOIN projects p ON p.id = w.project_id
            JOIN revisions r ON r.id = i.revision_id
            JOIN directions d ON d.id = r.direction_id
            WHERE p.slug = 'ewatrade' AND i.files LIKE '%apps/mobile/%'
            ORDER BY i.created_at DESC, i.id
        """)
        for row in rows:
            if row["path"] == "mobile/production":
                continue
            entry = {
                "title": row["title"],
                "version": row["version"],
                "commit": row["commit_hash"],
                "url": f'https://workshop.localhost/ewatrade/{row["path"]}/directions/{row["key"]}?rev={row["id"]}',
                "state": "Implementation recorded",
            }
            # Later revisions of a known mobile direction are related design
            # history. The implementation receipt stays on its exact revision.
            later = []
            if row["path"].startswith("mobile/"):
                later = db.execute("""
                    SELECT r.id, r.version, w.selected_revision_id,
                           EXISTS (SELECT 1 FROM implementations i WHERE i.revision_id = r.id) AS implemented
                    FROM revisions r
                    JOIN directions d ON d.id = r.direction_id
                    JOIN workshops w ON w.id = d.workshop_id
                    WHERE r.direction_id = ? AND r.version > ?
                    ORDER BY r.version DESC
                """, (row["direction_id"], row["version"])).fetchall()
            for file in json.loads(row["files"]):
                path = file.removeprefix(str(ROOT) + "/").removeprefix("./")
                key = (path, row["id"])
                if path.startswith("apps/mobile/") and key not in seen:
                    by_file.setdefault(path, []).append(entry)
                    seen.add(key)
                    for version in later:
                        if version["implemented"]:
                            continue
                        selected = version["id"] == version["selected_revision_id"]
                        by_file[path].append({
                            **entry,
                            "version": version["version"],
                            "commit": None,
                            "state": "Selected · implementation pending" if selected else "Draft · no implementation receipt",
                            "url": entry["url"].split("?")[0] + "?rev=" + version["id"],
                        })
    return by_file


def matching_sources(path, content):
    yield relative(path)
    for match in IMPORT.findall(content):
        source = ROOT / "apps/mobile/src" / match
        for candidate in (source.with_suffix(".tsx"), source / "index.tsx"):
            if candidate.is_file():
                yield relative(candidate)


def inventory(evidence):
    entries = {}
    for path in sorted(APP.rglob("*.tsx")):
        route = path.relative_to(APP).with_suffix("").as_posix()
        name = path.stem
        technical = name.startswith("_") or name in {"+html", "+native-intent"}
        content = path.read_text()
        route_parts = [part for part in route.split("/") if not part.startswith("(")]
        if route_parts and route_parts[-1] == "index":
            route_parts.pop()
        display = route_parts[-1] if name == "index" and route_parts else name
        if display.startswith("["):
            display = route_parts[-2]
        entries[route] = {
            "id": route,
            "label": label(display),
            "area": "Router internals" if technical else "Customer app" if route.startswith("(customer)/") else area_for(display),
            "kind": "Router file" if technical else "Task route" if name.endswith("-modal") else "Route",
            "source": relative(path),
            "route": None if technical else "/" + "/".join(route_parts),
            "sources": list(matching_sources(path, content)),
        }

    for path in sorted(COMPONENTS.rglob("*.tsx")):
        if path.name.endswith((".test.tsx", ".fixture.tsx")):
            continue
        file = relative(path)
        for tag in sorted(set(SHEET.findall(path.read_text()))):
            if path.parent == COMPONENTS / "ui":
                continue
            entry_id = f"{file}#{tag}"
            entries[entry_id] = {
                "id": entry_id,
                "label": label(path.stem),
                "area": "Embedded sheets",
                "kind": tag,
                "source": file,
                "sources": [file],
            }

    for entry_id, (name, source, reference) in BASELINE.items():
        # Quick create is represented by its reviewed surface entry.
        entries.pop(f"{source}#Modal", None)
        entry = entries.setdefault(entry_id, {
            "id": entry_id,
            "source": source,
            "sources": [source],
            "kind": "Bottom sheet" if entry_id == "quick-create" else "Startup view",
        })
        entry.update(label=name, area="Playable", reference=reference)

    for entry in entries.values():
        if entry["id"] in QUALITY_PAGES and not entry.get("reference"):
            query = urlencode({
                "rev": QUALITY_REVISION,
                "screen": QUALITY_PAGES[entry["id"]] + "/index.html",
            })
            entry["reference"] = "legacy/mobile-quality-workshop?" + query
        related = {}
        for file in entry.pop("sources"):
            for receipt in evidence.get(file, ()):
                related[receipt["url"]] = receipt
        entry["receipts"] = sorted(related.values(), key=lambda item: item["url"])

    playable_order = list(BASELINE)
    return sorted(entries.values(), key=lambda item: (
        playable_order.index(item["id"]) if item["id"] in BASELINE else len(BASELINE),
        item["area"],
        item["label"],
        item["id"],
    ))


def run_workshop(*arguments):
    subprocess.run(["bun", "run", "workshop", *arguments], cwd=WORKSHOP, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    current_catalog = Path(os.environ.get("WORKSHOP_DATA_DIR", WORKSHOP / "data")) / "catalog.sqlite3"
    parser.add_argument("--catalog", type=Path, default=current_catalog)
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--out", type=Path)
    output.add_argument("--publish", type=Path, metavar="MANIFEST",
                        help="refresh inventory for the existing Mobile Production manifest and publish")
    parser.add_argument("--record-implementation", nargs=2, metavar=("WORKSHOP_PATH", "EVIDENCE"),
                        help="record already verified mobile implementation evidence, then refresh the Workshop")
    args = parser.parse_args()
    if args.record_implementation and not args.publish:
        parser.error("--record-implementation requires --publish")
    destination = args.out
    if args.publish:
        if args.catalog.resolve() != current_catalog.resolve():
            parser.error("publishing must read the same catalog as the Workshop CLI")
        manifest = json.loads(args.publish.read_text())
        if manifest["project"]["slug"] != "ewatrade" or manifest["workshop"]["path"] != "mobile/production":
            parser.error("--publish requires the EwaTrade mobile/production manifest")
        directions = manifest["directions"]
        if len(directions) != 1 or directions[0]["key"] != "archive":
            parser.error("the Mobile Production manifest must have one archive direction")
        destination = args.publish.resolve().parent / directions[0]["source"] / "inventory.js"
    if args.record_implementation:
        workshop_path, evidence_file = args.record_implementation
        evidence_file = Path(evidence_file).resolve()
        evidence = json.loads(evidence_file.read_text())
        if workshop_path == "mobile/production" or not any(
            file.removeprefix(str(ROOT) + "/").removeprefix("./").startswith("apps/mobile/")
            for file in evidence["files"]
        ):
            parser.error("expected evidence for a mobile product implementation in its original Workshop")
        run_workshop("implement", "--project", "ewatrade", "--path", workshop_path, "--evidence", str(evidence_file))
    rows = inventory(catalog_evidence(args.catalog))
    contents = "window.MOBILE_INVENTORY = " + json.dumps(rows, ensure_ascii=True, indent=2) + "\n"
    with NamedTemporaryFile(mode="w", dir=destination.parent, suffix=".tmp", delete=False) as temporary:
        temporary.write(contents)
    Path(temporary.name).replace(destination)
    linked = sum(bool(row["receipts"]) for row in rows)
    print(f"{len(rows)} inventory entries, {linked} linked to exact-file implementation evidence.", flush=True)
    if args.publish:
        run_workshop("publish", "--manifest", str(args.publish.resolve()))


if __name__ == "__main__":
    main()
