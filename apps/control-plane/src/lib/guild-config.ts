import { guildConfigSchema } from "@mars/contracts";
import type { GuildIntegration } from "@prisma/client";

export const toGuildConfig = (record: GuildIntegration) =>
  guildConfigSchema.parse({
    guildId: record.guildId,
    enabled: record.enabled,
    wakeWord: record.wakeWord,
    systemPrompt: record.systemPrompt,
    allowedActions: record.allowedActions
  });