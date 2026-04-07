import pino from "pino";
import { ActionExecutor } from "./agent/executor.js";
import { GuildConfigStore } from "./agent/config-store.js";
import { createIntentEngine } from "./agent/intent.js";
import { AgentOrchestrator } from "./agent/orchestrator.js";
import { env } from "./config/env.js";
import { DiscordRuntime } from "./discord/client.js";
import { createHttpServer } from "./server/http.js";
import { BeepSynthesizer } from "./tts/beep-synthesizer.js";
import { DiscordVoiceResponder } from "./tts/discord-voice-responder.js";
import { DiscordTextResponder } from "./tts/responder.js";
import { LiveKitSpeechSynthesizer } from "./tts/synthesizer.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info"
});

const start = async (): Promise<void> => {
  const discord = new DiscordRuntime();
  await discord.start(env.DISCORD_BOT_TOKEN);

  discord.client.once("ready", () => {
    logger.info({ user: discord.client.user?.tag }, "Discord bot connected");
  });

  const configStore = new GuildConfigStore({
    ...(env.CONTROL_PLANE_URL
      ? { controlPlaneUrl: env.CONTROL_PLANE_URL }
      : {}),
    ...(env.CONTROL_PLANE_API_KEY
      ? { controlPlaneApiKey: env.CONTROL_PLANE_API_KEY }
      : {})
  });

  const intentEngine = createIntentEngine({
    model: env.LIVEKIT_LLM_MODEL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    ...(env.LIVEKIT_INFERENCE_URL
      ? { baseURL: env.LIVEKIT_INFERENCE_URL }
      : {}),
    ...(env.LIVEKIT_LLM_PROVIDER ? { provider: env.LIVEKIT_LLM_PROVIDER } : {})
  });

  const textResponder = new DiscordTextResponder(discord);
  const responderMode = env.ENABLE_VOICE_TTS
    ? "tts"
    : env.ENABLE_VOICE_BEEP
      ? "beep"
      : "text";

  const responder = (() => {
    switch (responderMode) {
      case "tts":
        return new DiscordVoiceResponder(
          logger,
          discord,
          new LiveKitSpeechSynthesizer({
            apiKey: env.LIVEKIT_API_KEY,
            apiSecret: env.LIVEKIT_API_SECRET,
            model: env.LIVEKIT_TTS_MODEL,
            voice: env.LIVEKIT_TTS_VOICE,
            maxChars: env.TTS_MAX_CHARS,
            ...(env.LIVEKIT_INFERENCE_URL
              ? { baseURL: env.LIVEKIT_INFERENCE_URL }
              : {})
          }),
          textResponder
        );
      case "beep":
        return new DiscordVoiceResponder(
          logger,
          discord,
          new BeepSynthesizer(),
          textResponder
        );
      default:
        return textResponder;
    }
  })();

  logger.info(
    {
      responderMode,
      ttsModel: responderMode === "tts" ? env.LIVEKIT_TTS_MODEL : null,
      ttsVoice: responderMode === "tts" ? env.LIVEKIT_TTS_VOICE : null
    },
    "Responder mode configured"
  );
  const executor = new ActionExecutor(discord, responder);
  const orchestrator = new AgentOrchestrator(
    logger,
    configStore,
    intentEngine,
    executor
  );

  const app = createHttpServer({
    logger,
    orchestrator,
    internalApiKey: env.INTERNAL_API_KEY
  });

  await app.listen({
    port: env.PORT,
    host: "0.0.0.0"
  });

  logger.info({ port: env.PORT }, "Bot service listening");

  const shutdown = async () => {
    logger.info("Shutting down bot service");
    await app.close();
    await discord.client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

start().catch((error) => {
  logger.error({ err: error }, "Failed to start bot service");
  process.exit(1);
});
