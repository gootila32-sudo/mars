import { z } from "zod";

export const agentActionSchema = z.enum([
  "MUTE_MEMBER",
  "UNMUTE_MEMBER",
  "DEAFEN_MEMBER",
  "UNDEAFEN_MEMBER",
  "MOVE_MEMBER",
  "NOOP"
]);

export type AgentAction = z.infer<typeof agentActionSchema>;

export const responseModeSchema = z.enum(["text", "beep", "tts"]);

export type ResponseMode = z.infer<typeof responseModeSchema>;

export const transcriptEventSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  speakerName: z.string().min(1),
  transcript: z.string().min(1),
  locale: z.string().default("en-US"),
  responseMode: responseModeSchema.default("beep")
});

export type TranscriptEvent = z.infer<typeof transcriptEventSchema>;

export const intentDecisionSchema = z.object({
  action: agentActionSchema,
  targetName: z.string().optional(),
  destinationChannelId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0),
  spokenResponse: z.string().min(1)
});

export type IntentDecision = z.infer<typeof intentDecisionSchema>;

export const guildConfigSchema = z.object({
  guildId: z.string().min(1),
  enabled: z.boolean().default(true),
  wakeWord: z.string().default("agent"),
  systemPrompt: z
    .string()
    .default(
      "You are a Discord voice operations agent. Only execute safe moderation actions in this server."
    ),
  allowedActions: z.array(agentActionSchema).default([
    "MUTE_MEMBER",
    "UNMUTE_MEMBER",
    "DEAFEN_MEMBER",
    "UNDEAFEN_MEMBER",
    "MOVE_MEMBER"
  ])
});

export type GuildConfig = z.infer<typeof guildConfigSchema>;

export const dispatchRequestSchema = z.object({
  guildId: z.string(),
  channelId: z.string(),
  transcript: z.string(),
  speakerName: z.string().default("unknown"),
  responseMode: responseModeSchema.default("beep")
});

export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;
