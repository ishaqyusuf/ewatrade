# Feature: Self-Service Store Detection

## Goal
Help the self-service app infer which store a customer is currently inside when the app opens so the customer can start checkout faster with less manual store selection.

## Current Status
Implemented v1 on the POS/self-service launch surface. The app requests browser geolocation, calls the public store-detection endpoint, shows ranked store candidates when available, requires explicit customer confirmation, and falls back to manual store-code entry when geolocation is unavailable, denied, or too uncertain.

## User Flow
1. Customer opens the self-service app while physically inside or near a supported store.
2. App requests or uses previously granted location permission.
3. App reads the device location and sends it to a backend store-resolution flow.
4. Backend returns the most likely nearby store, or a ranked list if confidence is not high enough.
5. App preselects the resolved store or asks the customer to confirm from nearby options.
6. Customer starts the self-service checkout flow in the detected store context.
7. If no reliable match is found, the app falls back to manual store selection or QR/store-code entry.

## Data Model
- `store`
- `tenant`
- Store geolocation is modeled in `Store.metadata.retailOps.selfServiceDetection` for v1:
  - `enabled: boolean`
  - `latitude: number`
  - `longitude: number`
  - `radiusMeters: number`
- The resolver also accepts the legacy-compatible metadata path `Store.metadata.selfServiceStoreDetection`.
- TODO: Define whether location-resolution events should be stored for analytics, abuse detection, or support debugging.

## API Endpoints
- `POST /api/self-service/store-detection/resolve`
  - Request: `latitude`, `longitude`, optional `accuracyMeters`, optional `maxCandidates`.
  - Response: `status`, `match`, and ranked `candidates`.
  - Status values:
    - `confirmed`: the top match is inside the configured radius with high confidence and acceptable device accuracy.
    - `needs_confirmation`: candidates exist, but the match should be confirmed by the customer.
    - `manual_required`: no enabled geofence produced a usable match.

## UI Screens
- POS/self-service app launch panel in `apps/pos`
- Store detection confirmation sheet or screen
- Manual store selection fallback screen
- Self-service cart or checkout home screen

## Edge Cases
- Customer denies location permission.
- Device location is unavailable, stale, or too imprecise indoors.
- Multiple stores are within the same radius and confidence is low.
- Customer is near a store but not physically inside the supported self-service zone.
- Store is detected correctly but self-service is disabled for that branch.
- Customer has a previously selected store that conflicts with the current location result.
- Backend should avoid silently binding the user to the wrong tenant/store context.

## Permissions
- End customers can use this feature in the self-service app.
- Store/merchant admins manage the store location data and whether self-service detection is enabled.
- Internal support or operations roles may need visibility into detection failures for troubleshooting.

## Future Improvements
- Add geofencing or beacon/Wi-Fi-assisted resolution for better in-store accuracy.
- Remember the last confirmed store and combine it with live location for smarter startup behavior.
- Introduce confidence thresholds that determine when to auto-select versus require confirmation.
- Support QR scan fallback from the same entry screen.
- Measure detection success rate and incorrect-store corrections.
