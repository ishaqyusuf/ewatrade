# Feature: Self-Service Store Detection

## Goal
Help the self-service app infer which store a customer is currently inside when the app opens so the customer can start checkout faster with less manual store selection.

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
- TODO: Define how store geolocation is modeled, such as latitude/longitude, geofence polygon, accuracy radius, floor/branch metadata, and active self-service eligibility.
- TODO: Define whether location-resolution events should be stored for analytics, abuse detection, or support debugging.

## API Endpoints
- TODO: Add a self-service app endpoint or procedure to resolve the current store from device coordinates.
- TODO: Add contract details for confidence score, fallback candidates, and permission-denied responses once the API exists.

## UI Screens
- Self-service app launch/loading screen
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
