import { Channel, Client, GatewayIntentBits, Guild, GuildMember, VoiceBasedChannel } from "discord.js";

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export class DiscordRuntime {
  public readonly client: Client;

  public constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
      ]
    });
  }

  public async start(token: string): Promise<void> {
    await this.client.login(token);
  }

  public async getGuild(guildId: string): Promise<Guild> {
    return this.client.guilds.fetch(guildId);
  }

  public async resolveVoiceMember(
    guildId: string,
    targetName: string,
    channelId?: string
  ): Promise<GuildMember | null> {
    const guild = await this.getGuild(guildId);
    await guild.members.fetch();

    const target = normalize(targetName);
    if (!target) {
      return null;
    }

    const members = [...guild.members.cache.values()].filter((member) => {
      if (member.user.bot) {
        return false;
      }

      if (!member.voice.channelId) {
        return false;
      }

      if (channelId && member.voice.channelId !== channelId) {
        return false;
      }

      return true;
    });

    let best: GuildMember | null = null;
    let bestScore = -1;

    for (const member of members) {
      const candidates = [member.displayName, member.user.username].map(normalize);

      for (const candidate of candidates) {
        let score = 0;

        if (candidate === target) {
          score = 100;
        } else if (candidate.startsWith(target)) {
          score = 70;
        } else if (candidate.includes(target)) {
          score = 50;
        }

        if (score > bestScore) {
          bestScore = score;
          best = member;
        }
      }
    }

    return best;
  }

  public async resolveVoiceChannel(
    guildId: string,
    channelId: string
  ): Promise<VoiceBasedChannel | null> {
    const guild = await this.getGuild(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isVoiceBased()) {
      return null;
    }

    return channel;
  }

  public async sendText(channelId: string, message: string): Promise<boolean> {
    const channel: Channel | null = await this.client.channels.fetch(channelId);

    if (!channel) {
      return false;
    }

    if (!channel.isTextBased()) {
      return false;
    }

    if ("send" in channel) {
      await channel.send({ content: message });
      return true;
    }

    return false;
  }

  public async sendGuildFallbackText(
    guildId: string,
    message: string
  ): Promise<boolean> {
    const guild = await this.getGuild(guildId);
    await guild.channels.fetch();

    const systemChannel = guild.systemChannel;
    if (systemChannel && systemChannel.isTextBased()) {
      await systemChannel.send({ content: message });
      return true;
    }

    const fallbackChannel = guild.channels.cache.find(
      (candidate) =>
        candidate.isTextBased() &&
        "viewable" in candidate &&
        candidate.viewable === true &&
        "send" in candidate
    );

    if (!fallbackChannel || !fallbackChannel.isTextBased() || !("send" in fallbackChannel)) {
      return false;
    }

    await fallbackChannel.send({ content: message });
    return true;
  }
}
