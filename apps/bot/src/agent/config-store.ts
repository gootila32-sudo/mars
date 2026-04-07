import { GuildConfig, guildConfigSchema } from "@mars/contracts";

interface ConfigStoreOptions {
  controlPlaneUrl?: string;
  controlPlaneApiKey?: string;
  cacheMs?: number;
}

interface CachedEntry {
  expiresAt: number;
  value: GuildConfig;
}

export class GuildConfigStore {
  private readonly cache = new Map<string, CachedEntry>();
  private readonly cacheMs: number;

  public constructor(private readonly options: ConfigStoreOptions) {
    this.cacheMs = options.cacheMs ?? 30_000;
  }

  public async get(guildId: string): Promise<GuildConfig> {
    const now = Date.now();
    const cached = this.cache.get(guildId);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const fresh = await this.fetchFromControlPlane(guildId);
    this.cache.set(guildId, {
      value: fresh,
      expiresAt: now + this.cacheMs
    });

    return fresh;
  }

  private async fetchFromControlPlane(guildId: string): Promise<GuildConfig> {
    const { controlPlaneUrl, controlPlaneApiKey } = this.options;

    if (!controlPlaneUrl || !controlPlaneApiKey) {
      return guildConfigSchema.parse({ guildId });
    }

    const url = new URL("/api/agent-config", controlPlaneUrl);
    url.searchParams.set("guildId", guildId);

    const response = await fetch(url, {
      headers: {
        "x-api-key": controlPlaneApiKey
      }
    });

    if (!response.ok) {
      return guildConfigSchema.parse({ guildId });
    }

    const payload = await response.json();
    return guildConfigSchema.parse(payload);
  }
}