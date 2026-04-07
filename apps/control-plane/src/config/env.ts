import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BOT_SERVICE_URL: z.string().url(),
  INTERNAL_API_KEY: z.string().min(8, "INTERNAL_API_KEY must be at least 8 chars")
});

export const env = envSchema.parse(process.env);