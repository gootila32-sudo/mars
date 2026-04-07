import { ResponseMode, TranscriptEvent } from "@mars/contracts";
import { DiscordRuntime } from "../discord/client.js";

export interface VoiceResponder {
  respond(event: TranscriptEvent, spokenText: string): Promise<void>;
}

export class DiscordTextResponder implements VoiceResponder {
  public constructor(private readonly discord: DiscordRuntime) {}

  public async respond(event: TranscriptEvent, spokenText: string): Promise<void> {
    const message = `Agent: ${spokenText}`;
    const sentToChannel = await this.discord.sendText(event.channelId, message);

    if (sentToChannel) {
      return;
    }

    await this.discord.sendGuildFallbackText(event.guildId, message);
  }
}

interface RoutedResponderOptions {
  defaultMode: ResponseMode;
  textResponder: VoiceResponder;
  beepResponder: VoiceResponder;
  ttsResponder: VoiceResponder;
}

export class RoutedResponder implements VoiceResponder {
  public constructor(private readonly options: RoutedResponderOptions) {}

  public async respond(event: TranscriptEvent, spokenText: string): Promise<void> {
    const mode = event.responseMode ?? this.options.defaultMode;

    switch (mode) {
      case "text":
        return this.options.textResponder.respond(event, spokenText);
      case "tts":
        return this.options.ttsResponder.respond(event, spokenText);
      case "beep":
      default:
        return this.options.beepResponder.respond(event, spokenText);
    }
  }
}
