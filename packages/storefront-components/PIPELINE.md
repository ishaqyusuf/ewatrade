# Local component artifact pipeline

TF09-02 adds bounded generation attempts, immutable local artifacts and inert fixture previews. It does not register or publish a component. The existing composition-only AI generator is unchanged. The default component generator is disabled; callers must inject a trusted `ComponentGenerator`. Its configuration and credentials stay in the trusted parent closure and never enter the compiler workspace.

```ts
import { runComponentPipeline } from "./src/pipeline"
import { offlineSampleBrief, offlineSampleGenerator } from "./src/offline-sample"
import { readAttemptStatus, verifyArtifact } from "./src/artifacts"

const result = await runComponentPipeline({
  storeRoot: "/private/tmp/component-artifacts",
  attemptId: "explicit-unique-attempt",
  sourceRevision: "<40 lowercase hexadecimal characters>",
  brief: offlineSampleBrief,
}, offlineSampleGenerator)
```

`offlineSampleGenerator` is explicitly a synthetic fixture, with no provider/model provenance or real model-call claim. It emits the `public-intro@1.0.0` source and manifest. Heading and description settings default to empty and fall back to public business profile data. The optional typed Contact control appears only when the trusted fixture supplies its conversation intent. The source contains no synthetic operational facts.

An attempt directory is created exclusively and its request, prompt and unknown-outcome marker are fsynced before invoking a generator. Reusing an ID with different request/prompt bytes conflicts. Reusing the same ID returns its recorded result, or an unresolved unknown state, without invoking a generator or compiler. A thrown/timed-out injected call remains unknown and requires external reconciliation. Generation has one call, a60-second abort signal, bounded input/output and no automatic retry or repair. A repair is a new explicit attempt with `repairedFrom` naming the previous artifact digest.

The approved SDK validates source/manifest/imports/CSS and creates trusted, bounded fixture inputs from the existing `populated`, `empty` and `unavailable` synthetic fixtures. One normal pinned compiler container produces the qualification bundle; one bounded renderer container renders all three fixtures. These are fixture outputs from one artifact, not connected merchant tests. Generated source and its bundle are never imported by the host. The qualification bundle is an SSR function, not a production renderer export.

SSR output is still untrusted. `validateInertComponentHtml` refuses anything outside a small, balanced HTML serialization grammar: active tags, URLs outside approved image assets, handlers, raw styles, ambiguous attributes and invalid action indices fail closed. Only exact trusted frame-token inline styles are admitted. Native button types/labels and image alt attributes are checked. Static previews have restrictive CSP; the review index uses `sandbox=""` iframes. Serve them only through the reviewed local static preview server with response CSP sandbox. Never insert artifact HTML into a privileged page DOM. Static SSR has no generated JavaScript, hydration or business-action dispatch; local browser review assesses native controls, text, accessibility and responsive presentation separately.

Artifacts contain exact request/prompt/raw output, generated source/CSS/manifest, generator provenance, fixture inputs, the bounded qualification bundle, dependency lock, compiler/renderer probes, SDK/build-recipe hashes, preview HTML/gate receipts and diagnostics. Oversized raw output is retained only up to its limit, with full-output hash/size and an explicit truncation marker. Unknown and ordinary failures also receive inspectable immutable artifacts. Provider errors are not copied into diagnostics.

`artifacts/<digest>/artifact.json` hashes the complete bounded file inventory. Temporary files are exclusively written and fsynced before atomic finalization. Finished files/directories are read-only; APIs never update them. This is an append-only local storage convention with verification, not an OS-level WORM guarantee. `verifyArtifact` refuses traversal, symlinks, extra/missing files and changed sizes/hashes. It checks integrity, not acceptance or permission to promote. The SDK provenance's logical `artifactId` is the attempt ID; the storage artifact ID is the independently calculated full inventory digest, avoiding a self-referential hash.

Focused checks:

```sh
bun --env-file=/dev/null test packages/storefront-components/src/pipeline.test.ts
./node_modules/.bin/tsc -p packages/storefront-components/tsconfig.json --noEmit --incremental false
bun --env-file=/dev/null packages/storefront-components/scripts/check-pipeline.ts
```

The last command performs one actual offline sample build using the already cached immutable local Docker compiler and retains its artifact path. It never pulls images, installs dependencies, connects to a database, invokes a model or reaches Preview/Production. Root `scripts/template-components.ts` owns the user-facing local sample/status/verify/serve workflow. Exact reviewed source promotion is implemented in `../storefront-templates/src/generated/` (TF09-03); normal authorized deployment remains separate. `./operations` projects bounded source-labeled existing telemetry exports without database/provider access; the root CLI `operations --file` command uses nonblocking/no-follow/capped reads.
