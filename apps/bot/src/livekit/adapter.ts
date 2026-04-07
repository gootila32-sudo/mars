import { TranscriptEvent } from "@mars/contracts";

interface LiveKitWebhookPayload {
  event?: string;
  room?: {
    name?: string;
    metadata?: string;
  };
  participant?: {
    identity?: string;
    name?: string;
  };
  transcript?: {
    text?: string;
    language?: string;
  };
}

interface RoomMetadata {
  guildId?: string;
  channelId?: string;
}

export const mapLiveKitToTranscriptEvent = (
  payload: LiveKitWebhookPayload
): TranscriptEvent | null => {
  const transcriptText = payload.transcript?.text?.trim();

  if (!transcriptText) {
    return null;
  }

  let metadata: RoomMetadata = {};

  try {
    metadata = payload.room?.metadata
      ? (JSON.parse(payload.room.metadata) as RoomMetadata)
      : {};
  } catch {
    metadata = {};
  }

  if (!metadata.guildId || !metadata.channelId) {
    return null;
  }

  return {
    guildId: metadata.guildId,
    channelId: metadata.channelId,
    speakerName:
      payload.participant?.name ?? payload.participant?.identity ?? "unknown",
    transcript: transcriptText,
    locale: payload.transcript?.language ?? "en-US"
  };
};