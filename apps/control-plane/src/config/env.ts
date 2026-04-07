import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BOT_SERVICE_URL: z.string().url(),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be at least 8 chars"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 chars"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_CLIENT_SECRET: z.string().min(1, "DISCORD_CLIENT_SECRET is required"),
  DISCORD_REDIRECT_URI: z.string().url(),
  DISCORD_BOT_PERMISSIONS: z.string().default("32508928")
});

export const env = envSchema.parse(process.env);