import { inference } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";

export interface SpeechSynthesizer {
  synthesize(input: string): Promise<Buffer>;
}

interface LiveKitSpeechSynthesizerOptions {
  apiKey: string;
  apiSecret: string;
  model: string;
  voice: string;
  maxChars: number;
  baseURL?: string;
}

const audioFrameToWav = (frame: AudioFrame): Buffer => {
  const bytesPerSample = 2;
  const data = Buffer.from(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength
  );

  const header = Buffer.alloc(44);
  const dataSize = data.length;
  const byteRate = frame.sampleRate * frame.channels * bytesPerSample;
  const blockAlign = frame.channels * bytesPerSample;

  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, 4, "ascii");
  header.write("fmt ", 12, 4, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(frame.channels, 22);
  header.writeUInt32LE(frame.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write("data", 36, 4, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, data]);
};

export class LiveKitSpeechSynthesizer implements SpeechSynthesizer {
  private readonly client: inference.TTS<string>;

  public constructor(private readonly options: LiveKitSpeechSynthesizerOptions) {
    this.client = new inference.TTS({
      model: options.model,
      voice: options.voice,
      apiKey: options.apiKey,
      apiSecret: options.apiSecret,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      encoding: "pcm_s16le",
      sampleRate: 48_000
    });
  }

  public async synthesize(input: string): Promise<Buffer> {
    const normalized = input.replace(/\s+/g, " ").trim();
    const text = normalized.slice(0, this.options.maxChars);

    const chunked = this.client.synthesize(text);
    const frame = await chunked.collect();

    return audioFrameToWav(frame);
  }
}