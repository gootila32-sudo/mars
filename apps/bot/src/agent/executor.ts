import { IntentDecision, TranscriptEvent } from "@mars/contracts";
import { DiscordRuntime } from "../discord/client.js";
import { VoiceResponder } from "../tts/responder.js";

export interface ExecutionResult {
  ok: boolean;
  detail: string;
}

export class ActionExecutor {
  public constructor(
    private readonly discord: DiscordRuntime,
    private readonly responder: VoiceResponder
  ) {}

  public async execute(
    event: TranscriptEvent,
    decision: IntentDecision
  ): Promise<ExecutionResult> {
    if (decision.action === "NOOP") {
      await this.safeRespond(event, decision.spokenResponse);
      return { ok: true, detail: "No action executed." };
    }

    const targetName = decision.targetName?.trim();

    if (!targetName) {
      await this.safeRespond(event, "I need a target name for that action.");
      return { ok: false, detail: "Target name missing." };
    }

    const member = await this.discord.resolveVoiceMember(
      event.guildId,
      targetName,
      event.channelId
    );

    if (!member) {
      await this.safeRespond(
        event,
        `I could not find ${targetName} in the active voice channel.`
      );
      return { ok: false, detail: "Target user not found in voice." };
    }

    switch (decision.action) {
      case "MUTE_MEMBER": {
        await member.voice.setMute(true, `AI command by ${event.speakerName}`);
        await this.safeRespond(event, decision.spokenResponse);
        return { ok: true, detail: `${member.displayName} muted.` };
      }

      case "UNMUTE_MEMBER": {
        await member.voice.setMute(false, `AI command by ${event.speakerName}`);
        await this.safeRespond(event, decision.spokenResponse);
        return { ok: true, detail: `${member.displayName} unmuted.` };
      }

      case "DEAFEN_MEMBER": {
        await member.voice.setDeaf(true, `AI command by ${event.speakerName}`);
        await this.safeRespond(event, decision.spokenResponse);
        return { ok: true, detail: `${member.displayName} deafened.` };
      }

      case "UNDEAFEN_MEMBER": {
        await member.voice.setDeaf(false, `AI command by ${event.speakerName}`);
        await this.safeRespond(event, decision.spokenResponse);
        return { ok: true, detail: `${member.displayName} undeafened.` };
      }

      case "MOVE_MEMBER": {
        const destinationChannelId = decision.destinationChannelId;

        if (!destinationChannelId) {
          await this.safeRespond(
            event,
            "I need a destination channel mention for that move command."
          );
          return { ok: false, detail: "Destination channel missing." };
        }

        const destinationChannel = await this.discord.resolveVoiceChannel(
          event.guildId,
          destinationChannelId
        );

        if (!destinationChannel) {
          await this.safeRespond(event, "Destination channel is invalid.");
          return { ok: false, detail: "Destination channel invalid." };
        }

        await member.voice.setChannel(destinationChannel, `AI command by ${event.speakerName}`);
        await this.safeRespond(event, decision.spokenResponse);
        return { ok: true, detail: `${member.displayName} moved.` };
      }

      default: {
        await this.safeRespond(event, "Action not supported.");
        return { ok: false, detail: "Action unsupported." };
      }
    }
  }

  private async safeRespond(event: TranscriptEvent, spokenText: string): Promise<void> {
    try {
      await this.responder.respond(event, spokenText);
    } catch {
      // Keep moderation action flow alive even if reply channel fails.
    }
  }
}
