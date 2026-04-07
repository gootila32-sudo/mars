import { TranscriptEvent } from "@mars/contracts";
import pino from "pino";
import { ActionExecutor } from "./executor.js";
import { GuildConfigStore } from "./config-store.js";
import { IntentEngine } from "./intent.js";

export class AgentOrchestrator {
  public constructor(
    private readonly logger: pino.Logger,
    private readonly configStore: GuildConfigStore,
    private readonly intentEngine: IntentEngine,
    private readonly executor: ActionExecutor
  ) {}

  public async handleTranscript(event: TranscriptEvent): Promise<{
    action: string;
    detail: string;
  }> {
    const config = await this.configStore.get(event.guildId);

    if (!config.enabled) {
      return { action: "NOOP", detail: "Guild agent disabled." };
    }

    const decision = await this.intentEngine.decide(event, config);
    const execution = await this.executor.execute(event, decision);

    this.logger.info(
      {
        guildId: event.guildId,
        channelId: event.channelId,
        speakerName: event.speakerName,
        action: decision.action,
        ok: execution.ok,
        detail: execution.detail
      },
      "Processed transcript event"
    );

    return {
      action: decision.action,
      detail: execution.detail
    };
  }
}