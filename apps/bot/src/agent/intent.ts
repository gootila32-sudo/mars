import {
  GuildConfig,
  IntentDecision,
  intentDecisionSchema,
  TranscriptEvent
} from "@mars/contracts";
import { inference, llm as agentsLlm } from "@livekit/agents";

export interface IntentEngine {
  decide(event: TranscriptEvent, config: GuildConfig): Promise<IntentDecision>;
}

const noop = (spokenResponse = "Standing by."): IntentDecision =>
  intentDecisionSchema.parse({
    action: "NOOP",
    confidence: 0,
    spokenResponse
  });

const extractJsonObject = (raw: string): string | null => {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return raw.slice(firstBrace, lastBrace + 1).trim();
};

const parseWithRules = (input: string): IntentDecision => {
  const transcript = input.trim();

  const patterns: Array<{
    action: IntentDecision["action"];
    regex: RegExp;
    response: (target: string) => string;
  }> = [
    {
      action: "UNMUTE_MEMBER",
      regex: /unmute\s+([a-z0-9_\- ]+)/i,
      response: (target) => `Done. Unmuting ${target}.`
    },
    {
      action: "UNDEAFEN_MEMBER",
      regex: /undeafen\s+([a-z0-9_\- ]+)/i,
      response: (target) => `Done. Undeafening ${target}.`
    },
    {
      action: "MUTE_MEMBER",
      regex: /mute\s+([a-z0-9_\- ]+)/i,
      response: (target) => `Done. Muting ${target}.`
    },
    {
      action: "DEAFEN_MEMBER",
      regex: /deafen\s+([a-z0-9_\- ]+)/i,
      response: (target) => `Done. Deafening ${target}.`
    }
  ];

  for (const pattern of patterns) {
    const match = transcript.match(pattern.regex);

    if (!match) {
      continue;
    }

    const targetName = match[1]?.trim();

    if (!targetName) {
      continue;
    }

    return intentDecisionSchema.parse({
      action: pattern.action,
      targetName,
      confidence: 0.7,
      spokenResponse: pattern.response(targetName)
    });
  }

  const moveMatch = transcript.match(/move\s+([a-z0-9_\- ]+)\s+to\s+<#?(\d+)>/i);
  if (moveMatch) {
    const targetName = moveMatch[1]?.trim();
    const destinationChannelId = moveMatch[2]?.trim();

    if (targetName && destinationChannelId) {
      return intentDecisionSchema.parse({
        action: "MOVE_MEMBER",
        targetName,
        destinationChannelId,
        confidence: 0.75,
        spokenResponse: `Done. Moving ${targetName}.`
      });
    }
  }

  return noop("I heard you, but no allowed action matched.");
};

export class RuleBasedIntentEngine implements IntentEngine {
  public async decide(
    event: TranscriptEvent,
    config: GuildConfig
  ): Promise<IntentDecision> {
    if (!event.transcript.toLowerCase().includes(config.wakeWord.toLowerCase())) {
      return noop(`Waiting for wake word: ${config.wakeWord}.`);
    }

    const decision = parseWithRules(event.transcript);

    if (
      decision.action !== "NOOP" &&
      !config.allowedActions.includes(decision.action)
    ) {
      return noop("That action is not allowed in this server.");
    }

    return decision;
  }
}

interface LiveKitIntentEngineOptions {
  model: string;
  apiKey: string;
  apiSecret: string;
  baseURL?: string;
  provider?: string;
}

export class LiveKitIntentEngine implements IntentEngine {
  private readonly client: inference.LLM;

  public constructor(private readonly options: LiveKitIntentEngineOptions) {
    this.client = new inference.LLM({
      model: options.model,
      apiKey: options.apiKey,
      apiSecret: options.apiSecret,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      modelOptions: {
        temperature: 0,
        response_format: { type: "json_object" }
      }
    });
  }

  public async decide(
    event: TranscriptEvent,
    config: GuildConfig
  ): Promise<IntentDecision> {
    if (!event.transcript.toLowerCase().includes(config.wakeWord.toLowerCase())) {
      return noop(`Waiting for wake word: ${config.wakeWord}.`);
    }

    try {
      const chatCtx = agentsLlm.ChatContext.empty();
      chatCtx.addMessage({
        role: "system",
        content:
          "Extract a Discord moderation action from spoken transcript. Return raw JSON only with keys: action, targetName, destinationChannelId, confidence, spokenResponse. Use action NOOP when not confident."
      });
      chatCtx.addMessage({
        role: "user",
        content: JSON.stringify({
          transcript: event.transcript,
          speakerName: event.speakerName,
          wakeWord: config.wakeWord,
          allowedActions: config.allowedActions,
          systemPrompt: config.systemPrompt
        })
      });

      const stream = this.client.chat({ chatCtx });
      let content = "";

      for await (const chunk of stream) {
        if (chunk.delta?.content) {
          content += chunk.delta.content;
        }
      }

      const rawJson = extractJsonObject(content);

      if (!rawJson) {
        return parseWithRules(event.transcript);
      }

      const parsed = intentDecisionSchema.parse(JSON.parse(rawJson));

      if (
        parsed.action !== "NOOP" &&
        !config.allowedActions.includes(parsed.action)
      ) {
        return noop("That action is blocked by policy.");
      }

      return parsed;
    } catch {
      return parseWithRules(event.transcript);
    }
  }
}

export const createIntentEngine = (options: {
  model: string;
  apiKey: string;
  apiSecret: string;
  baseURL?: string;
  provider?: string;
}): IntentEngine =>
  new LiveKitIntentEngine({
    model: options.model,
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    ...(options.provider ? { provider: options.provider } : {})
  });