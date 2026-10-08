# Production tool and narration provenance

Generated locally on 8 October 2026. No cloned voice, paid inference, stock music,
AI product screens or externally sourced footage is used.

## Kokoro

- Model: `onnx-community/Kokoro-82M-v1.0-ONNX`, q8, based on `hexgrad/Kokoro-82M`
  v1.0. Both model cards label Apache-2.0. Model author states production/commercial
  use is supported: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/README.md
- Runtime: `kokoro-js@1.2.1` (Apache-2.0); bundled English `af_heart` synthetic
  voice, not a commissioned performance or a clone of a named individual.
- Quantized model SHA256:
  `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`.
- Bundled `af_heart.bin` SHA256:
  `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b`.
- Full Apache license: `KOKORO-LICENSE`. The model card says training used
  permissive/noncopyrighted audio; it also attributes Koniwa `tnc` (CC BY3.0)
  and SIWIS (CC BY4.0). Retain these upstream acknowledgments with distribution:
  https://github.com/koniwa/koniwa and https://datashare.ed.ac.uk/handle/10283/2353.
- Model card and voices: https://huggingface.co/hexgrad/Kokoro-82M and
  https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md.
- ONNX conversion: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX.

The license provides the stated commercial-use permission. It does not establish
exclusive ownership of generated audio or independently audit all training data.
No Nigerian accent or local-language quality is claimed by this English edit.

## Remotion

Pinned `4.0.534`; installed license copied to `REMOTION-LICENSE.md`.
Free License explicitly covers individuals, for-profit organizations with up to
three employees, nonprofits, and evaluation. It allows commercial video creation.
The current owner is an individual developer; these local review renders use that
eligibility. Larger-company reuse must apply its own eligible license.
Official terms: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md.

## Other assets

ẸwáTrade Precision Rise logo copied unchanged from the repository's approved
brand asset. All product images/video are actual local browser captures of owned
fictional QA tenants. Arial is rendered as an installed system font; no font
binary is redistributed. No music track is included.

Playwright (Apache-2.0), React (MIT), ONNX Runtime (MIT), Transformers.js
(Apache-2.0), and their dependency licenses remain in the isolated install.
