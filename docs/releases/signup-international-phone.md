# International website signup phone

Website signup now uses neutral name/business/email placeholders and a combined
shadcn flag picker, calling code and formatted phone input. Country selection is
searchable; placeholders show zeros in the selected country format. Vercel request
country suggests an editable default with manual fallback. No geolocation prompt.

The website requires a valid phone. Country-aware API requests normalize to E.164;
legacy mobile start requests remain compatible. Optional phoneCountry persists in
the existing onboarding JSON draft and remains separate from business location.
No Prisma migration, environment variable, native UI or mobile release is needed.

Owner requested direct Production release, skipping Preview. This isolated source
contains only signup changes on top of origin/main, excluding unrelated local work.
Focused tests, onboarding TypeScript and scoped Biome passed before isolation;
release-source verification and hosted deployment are recorded in Brain.
