import type { SpeechSynthesizer } from "./synthesizer.js";

interface BeepSynthesizerOptions {
  sampleRate?: number;
  durationMs?: number;
  frequencyHz?: number;
  amplitude?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export class BeepSynthesizer implements SpeechSynthesizer {
  private readonly sampleRate: number;
  private readonly durationMs: number;
  private readonly frequencyHz: number;
  private readonly amplitude: number;

  public constructor(options: BeepSynthesizerOptions = {}) {
    this.sampleRate = options.sampleRate ?? 48_000;
    this.durationMs = options.durationMs ?? 180;
    this.frequencyHz = options.frequencyHz ?? 880;
    this.amplitude = clamp(options.amplitude ?? 0.28, 0.05, 0.95);
  }

  public async synthesize(_: string): Promise<Buffer> {
    const channels = 1;
    const bytesPerSample = 2;
    const sampleCount = Math.max(
      1,
      Math.floor((this.sampleRate * this.durationMs) / 1000)
    );

    const pcm = Buffer.alloc(sampleCount * channels * bytesPerSample);
    const attackSamples = Math.floor(this.sampleRate * 0.01);
    const releaseSamples = Math.floor(this.sampleRate * 0.02);

    for (let i = 0; i < sampleCount; i += 1) {
      let envelope = 1;

      if (i < attackSamples) {
        envelope = i / Math.max(1, attackSamples);
      } else if (i > sampleCount - releaseSamples) {
        envelope = (sampleCount - i) / Math.max(1, releaseSamples);
      }

      const radians =
        (2 * Math.PI * this.frequencyHz * i) / this.sampleRate;
      const sample = Math.sin(radians) * this.amplitude * envelope;
      const intSample = Math.round(sample * 32767);

      pcm.writeInt16LE(intSample, i * bytesPerSample);
    }

    const dataSize = pcm.length;
    const byteRate = this.sampleRate * channels * bytesPerSample;
    const blockAlign = channels * bytesPerSample;

    const header = Buffer.alloc(44);
    header.write("RIFF", 0, 4, "ascii");
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8, 4, "ascii");
    header.write("fmt ", 12, 4, "ascii");
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bytesPerSample * 8, 34);
    header.write("data", 36, 4, "ascii");
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcm]);
  }
}