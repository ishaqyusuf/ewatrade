/** Finalize browser recordings as mono PCM WAV so the server can measure duration. */
export async function voiceRecordingFile(blob: Blob) {
  const decoder = new AudioContext()
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer())
    if (
      !Number.isFinite(decoded.duration) ||
      decoded.duration < 0.5 ||
      decoded.duration > 122
    )
      throw new Error("Invalid recording duration")
    const length = Math.min(Math.ceil(decoded.duration * 16_000), 120 * 16_000)
    const renderer = new OfflineAudioContext(1, length, 16_000)
    const source = renderer.createBufferSource()
    source.buffer = decoded
    source.connect(renderer.destination)
    source.start()
    const samples = (await renderer.startRendering()).getChannelData(0)
    const bytes = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(bytes)
    const text = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(offset + i, value.charCodeAt(i))
    }
    text(0, "RIFF")
    view.setUint32(4, bytes.byteLength - 8, true)
    text(8, "WAVE")
    text(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 16_000, true)
    view.setUint32(28, 32_000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, "data")
    view.setUint32(40, samples.length * 2, true)
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
      view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true)
    }
    return {
      file: new File([bytes], "voice-note.wav", { type: "audio/wav" }),
      durationMs: Math.ceil(samples.length / 16),
    }
  } finally {
    await decoder.close()
  }
}
