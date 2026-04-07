import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  DISCORD_APPLICATION_ID: z.string().min(1, "DISCORD_APPLICATION_ID is required"),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be set"),
  CONTROL_PLANE_URL: z.string().url().optional(),
  CONTROL_PLANE_API_KEY: z.string().optional(),
  LIVEKIT_API_KEY: z.string().min(1, "LIVEKIT_API_KEY is required"),
  LIVEKIT_API_SECRET: z.string().min(1, "LIVEKIT_API_SECRET is required"),
  LIVEKIT_INFERENCE_URL: z.string().url().optional(),
  LIVEKIT_LLM_MODEL: z.string().default("google/gemini-2.0-flash"),
  LIVEKIT_LLM_PROVIDER: z.string().optional(),
  ENABLE_VOICE_BEEP: booleanFromEnv.default(true),
  ENABLE_VOICE_TTS: booleanFromEnv.default(false),
  LIVEKIT_TTS_MODEL: z.string().default("cartesia/sonic-2"),
  LIVEKIT_TTS_VOICE: z.string().default("6f84f4b8-58a2-430c-8c79-688dad597532"),
  TTS_MAX_CHARS: z.coerce.number().int().positive().default(280)
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
