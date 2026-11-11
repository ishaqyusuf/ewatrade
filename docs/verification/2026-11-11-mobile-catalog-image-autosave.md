# Mobile Catalog image autosave

11 November 2026. The owner confirmed that saving Broiler chicken in Development
showed its image in the Catalog list. The follow-up removes Save changes from
the existing-item Images editor. Adding, removing, choosing an illustration,
making an image primary and applying a displayed AI result save through the
existing scoped photo replacement command.

The editor sends one command for each complete selection, waits for it before
accepting another, and revalidates Catalog details and list queries after the
attempt. An unconfirmed write retries with the same command ID and payload. A
conflict directs the editor to reopen the latest saved selection. Refinement
deletion uses its own existing transactional restore. New-item images are part
of the create-item draft. An AI job still running when the editor closes can
apply when the editor is next opened.

A local harness ran the actual saved-editor handlers with stubbed transport.
The prior editor issued zero writes on Make primary. The revised editor wrote
immediately, used the last committed order, blocked Back during the write,
invalidated Catalog reads and reused the same command after a lost response.
Seven image selection, refinement and avatar tests and 285 scoped smoke tests
passed. The mobile type check and assistant coverage and impact gates passed.

The connected Galaxy displayed the original saved primary in both the product
overview and Catalog list. It left Catalog before the focused Maestro test
reached the first edit. The flow made no photo changes on the device.
