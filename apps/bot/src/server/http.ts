import {
  dispatchRequestSchema,
  transcriptEventSchema
} from "@mars/contracts";
import Fastify from "fastify";
import pino from "pino";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { mapLiveKitToTranscriptEvent } from "../livekit/adapter.js";

interface HttpServerOptions {
  logger: pino.Logger;
  orchestrator: AgentOrchestrator;
  internalApiKey: string;
}

export const createHttpServer = ({
  logger: _logger,
  orchestrator,
  internalApiKey
}: HttpServerOptions) => {
  const app = Fastify({
    logger: true
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") {
      return;
    }

    const apiKey = request.headers["x-api-key"];

    if (apiKey !== internalApiKey) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.post("/v1/transcript", async (request, reply) => {
    const parsed = transcriptEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid transcript payload",
        detail: parsed.error.flatten()
      });
    }

    const result = await orchestrator.handleTranscript(parsed.data);
    return reply.send(result);
  });

  app.post("/v1/dispatch", async (request, reply) => {
    const parsed = dispatchRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid dispatch payload",
        detail: parsed.error.flatten()
      });
    }

    const result = await orchestrator.handleTranscript({
      guildId: parsed.data.guildId,
      channelId: parsed.data.channelId,
      transcript: parsed.data.transcript,
      speakerName: parsed.data.speakerName,
      locale: "en-US",
      responseMode: parsed.data.responseMode
    });

    return reply.send(result);
  });

  app.post("/v1/livekit/webhook", async (request, reply) => {
    const event = mapLiveKitToTranscriptEvent(request.body as Record<string, unknown>);

    if (!event) {
      return reply.status(400).send({
        error: "Payload does not include transcript or guild/channel metadata"
      });
    }

    const result = await orchestrator.handleTranscript(event);
    return reply.send(result);
  });

  return app;
};
