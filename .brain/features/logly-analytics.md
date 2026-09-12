# Logly mobile analytics release

This branch starts from the exact Android production build revision `7556b0c3` and adds only the shared analytics package, Expo runtime mount, mobile dependency, and public Turbo variables. The runtime sends coarse `site_visit` and `page_view` events to the existing same-origin mobile ingest endpoint under the independently scoped `ewatrade-mobile` project.

Identifiers remain installation-local in SecureStore. Dynamic/private route segments and arbitrary properties are removed, delivery uses a bounded in-memory retry queue, and analytics failures never interrupt navigation. The server credential remains on the web deployment and is never bundled into Expo. No database schema or visual UI changes are included.

Release validation and the resulting EAS update group are recorded in Logly's `.brain/tasks/analytics-expansion/report.md`. Interactive acceptance remains a separate owner-directed pass.
