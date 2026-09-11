const MAX_WAVEFORM_LEVELS = 28
const METERING_FLOOR_DB = -60

export function normalizeVoiceMetering(metering: number | undefined) {
  if (metering === undefined || !Number.isFinite(metering)) return 0
  const normalized = Math.min(
    1,
    Math.max(0, (metering - METERING_FLOOR_DB) / -METERING_FLOOR_DB),
  )
  // Recorder metering is logarithmic (dB). A gentle visual curve keeps quiet
  // speech legible while the bar heights remain driven by the real microphone.
  return normalized ** 0.72
}

export function appendVoiceWaveformLevel(
  levels: number[],
  metering: number | undefined,
) {
  return [
    ...Array.from(
      { length: Math.max(0, MAX_WAVEFORM_LEVELS - levels.length - 1) },
      () => 0,
    ),
    ...levels,
    normalizeVoiceMetering(metering),
  ].slice(-MAX_WAVEFORM_LEVELS)
}

export function createEmptyVoiceWaveform() {
  return Array.from({ length: MAX_WAVEFORM_LEVELS }, () => 0)
}
