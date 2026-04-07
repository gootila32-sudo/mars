import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel
} from "@discordjs/voice";
import type { TranscriptEvent } from "@mars/contracts";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import type pino from "pino";
import { DiscordRuntime } from "../discord/client.js";
import { VoiceResponder } from "./responder.js";
import { SpeechSynthesizer } from "./synthesizer.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

if (typeof ffmpegPath === "string" && ffmpegPath && !process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

export class DiscordVoiceResponder implements VoiceResponder {
  private readonly players = new Map<string, AudioPlayer>();

  public constructor(
    private readonly logger: pino.Logger,
    private readonly discord: DiscordRuntime,
    private readonly synthesizer: SpeechSynthesizer,
    private readonly textFallback: VoiceResponder
  ) {}

  public async respond(event: TranscriptEvent, spokenText: string): Promise<void> {
    try {
      await this.playVoice(event, spokenText);
    } catch (error) {
      this.logger.warn(
        { err: error, guildId: event.guildId, channelId: event.channelId },
        "Voice TTS failed, falling back to text reply"
      );
      await this.textFallback.respond(event, spokenText);
    }
  }

  private async playVoice(event: TranscriptEvent, spokenText: string): Promise<void> {
    const channel = await this.discord.resolveVoiceChannel(event.guildId, event.channelId);

    if (!channel) {
      throw new Error("Target voice channel not found");
    }

    const connection = await this.getOrCreateConnection(event.guildId, channel.id);
    const player = this.getOrCreatePlayer(event.guildId);
    connection.subscribe(player);

    const buffer = await this.synthesizer.synthesize(spokenText);
    const stream = Readable.from(buffer);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary
    });

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 10_000);
  }

  private getOrCreatePlayer(guildId: string): AudioPlayer {
    const existing = this.players.get(guildId);

    if (existing) {
      return existing;
    }

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
      }
    });

    player.on("error", (error) => {
      this.logger.error({ err: error, guildId }, "Audio player error");
    });

    this.players.set(guildId, player);
    return player;
  }

  private async getOrCreateConnection(
    guildId: string,
    channelId: string
  ): Promise<VoiceConnection> {
    const existing = getVoiceConnection(guildId);

    if (existing && existing.joinConfig.channelId === channelId) {
      await entersState(existing, VoiceConnectionStatus.Ready, 10_000);
      return existing;
    }

    if (existing) {
      existing.destroy();
    }

    const guild = await this.discord.getGuild(guildId);

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator as any,
      selfDeaf: true,
      selfMute: false
    });

    connection.on("error", (error) => {
      this.logger.error({ err: error, guildId }, "Voice connection error");
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    return connection;
  }
}
