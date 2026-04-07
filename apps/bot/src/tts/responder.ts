import { TranscriptEvent } from "@mars/contracts";
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
