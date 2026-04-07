import path from "node:path";
import { dispatchRequestSchema, guildConfigSchema } from "@mars/contracts";
import fastifyStatic from "@fastify/static";
import type { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { z } from "zod";
import { env } from "./config/env.js";
import { assertInternalApiKey } from "./lib/auth.js";
import { prisma } from "./lib/db.js";
import { toGuildConfig } from "./lib/guild-config.js";

const createGuildPayloadSchema = guildConfigSchema.extend({
  guildName: z.string().min(1).optional()
});

const updateGuildPayloadSchema = guildConfigSchema
  .omit({ guildId: true })
  .partial()
  .extend({ guildName: z.string().min(1).optional() });

const dispatchResultSchema = z.object({
  action: z.string(),
  detail: z.string()
});

const queryGuildSchema = z.object({
  guildId: z.string().min(1)
});

const app = Fastify({
  logger: true
});

app.register(fastifyStatic, {
  root: path.join(process.cwd(), "public"),
  prefix: "/"
});

app.get("/", async (_request, reply) => {
  return reply.sendFile("index.html");
});

app.get("/health", async () => ({ status: "ok" }));

app.get("/api/guilds", async () => {
  try {
    const guilds = await prisma.guildIntegration.findMany({
      orderBy: { updatedAt: "desc" }
    });

    return guilds.map(toGuildConfig);
  } catch (error) {
    app.log.error({ err: error }, "Failed to load guild configs");
    return [];
  }
});

app.post("/api/guilds", async (request, reply) => {
  const parsed = createGuildPayloadSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid guild config",
      detail: parsed.error.flatten()
    });
  }

  const guildNamePatch =
    parsed.data.guildName === undefined
      ? {}
      : { guildName: parsed.data.guildName };

  const saved = await prisma.guildIntegration.upsert({
    where: { guildId: parsed.data.guildId },
    update: {
      enabled: parsed.data.enabled,
      wakeWord: parsed.data.wakeWord,
      systemPrompt: parsed.data.systemPrompt,
      allowedActions: parsed.data.allowedActions,
      ...guildNamePatch
    },
    create: {
      guildId: parsed.data.guildId,
      enabled: parsed.data.enabled,
      wakeWord: parsed.data.wakeWord,
      systemPrompt: parsed.data.systemPrompt,
      allowedActions: parsed.data.allowedActions,
      ...guildNamePatch
    }
  });

  return toGuildConfig(saved);
});

app.get("/api/guilds/:guildId", async (request, reply) => {
  const params = queryGuildSchema.safeParse({ guildId: (request.params as { guildId?: string }).guildId });

  if (!params.success) {
    return reply.code(400).send({
      error: "guildId is required"
    });
  }

  const existing = await prisma.guildIntegration.findUnique({
    where: { guildId: params.data.guildId }
  });

  if (!existing) {
    const created = await prisma.guildIntegration.create({
      data: {
        guildId: params.data.guildId
      }
    });

    return toGuildConfig(created);
  }

  return toGuildConfig(existing);
});

app.patch("/api/guilds/:guildId", async (request, reply) => {
  const params = queryGuildSchema.safeParse({ guildId: (request.params as { guildId?: string }).guildId });

  if (!params.success) {
    return reply.code(400).send({
      error: "guildId is required"
    });
  }

  const parsed = updateGuildPayloadSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid update payload",
      detail: parsed.error.flatten()
    });
  }

  const guildNamePatch =
    parsed.data.guildName === undefined
      ? {}
      : { guildName: parsed.data.guildName };

  const updateData: Prisma.GuildIntegrationUpdateInput = {};

  if (parsed.data.enabled !== undefined) {
    updateData.enabled = parsed.data.enabled;
  }

  if (parsed.data.wakeWord !== undefined) {
    updateData.wakeWord = parsed.data.wakeWord;
  }

  if (parsed.data.systemPrompt !== undefined) {
    updateData.systemPrompt = parsed.data.systemPrompt;
  }

  if (parsed.data.allowedActions !== undefined) {
    updateData.allowedActions = parsed.data.allowedActions;
  }

  if (parsed.data.guildName !== undefined) {
    updateData.guildName = parsed.data.guildName;
  }

  const updated = await prisma.guildIntegration.upsert({
    where: { guildId: params.data.guildId },
    update: updateData,
    create: {
      guildId: params.data.guildId,
      enabled: parsed.data.enabled ?? true,
      wakeWord: parsed.data.wakeWord ?? "agent",
      systemPrompt:
        parsed.data.systemPrompt ??
        "You are a Discord voice operations agent.",
      allowedActions:
        parsed.data.allowedActions ?? [
          "MUTE_MEMBER",
          "UNMUTE_MEMBER",
          "DEAFEN_MEMBER",
          "UNDEAFEN_MEMBER",
          "MOVE_MEMBER"
        ],
      ...guildNamePatch
    }
  });

  return toGuildConfig(updated);
});

app.get("/api/agent-config", async (request, reply) => {
  if (!assertInternalApiKey(request, reply, env.INTERNAL_API_KEY)) {
    return;
  }

  const parsed = queryGuildSchema.safeParse(request.query);

  if (!parsed.success) {
    return reply.code(400).send({
      error: "guildId is required"
    });
  }

  const existing = await prisma.guildIntegration.findUnique({
    where: { guildId: parsed.data.guildId }
  });

  if (!existing) {
    return guildConfigSchema.parse({ guildId: parsed.data.guildId });
  }

  return guildConfigSchema.parse({
    guildId: existing.guildId,
    enabled: existing.enabled,
    wakeWord: existing.wakeWord,
    systemPrompt: existing.systemPrompt,
    allowedActions: existing.allowedActions
  });
});

app.get("/api/dispatch", async () => {
  try {
    const logs = await prisma.dispatchLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25
    });

    return logs;
  } catch (error) {
    app.log.error({ err: error }, "Failed to load dispatch logs");
    return [];
  }
});

app.post("/api/dispatch", async (request, reply) => {
  const parsed = dispatchRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      error: "Invalid dispatch request",
      detail: parsed.error.flatten()
    });
  }

  await prisma.guildIntegration.upsert({
    where: { guildId: parsed.data.guildId },
    update: {},
    create: {
      guildId: parsed.data.guildId
    }
  });

  let botResponse: Response;

  try {
    botResponse = await fetch(`${env.BOT_SERVICE_URL}/v1/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.INTERNAL_API_KEY
      },
      body: JSON.stringify(parsed.data)
    });
  } catch (error) {
    await prisma.dispatchLog.create({
      data: {
        guildId: parsed.data.guildId,
        channelId: parsed.data.channelId,
        transcript: parsed.data.transcript,
        speakerName: parsed.data.speakerName,
        action: "ERROR",
        detail: "Bot service unreachable",
        ok: false
      }
    });

    app.log.error({ err: error }, "Bot service call failed");
    return reply.code(502).send({ error: "Bot service unavailable" });
  }

  if (!botResponse.ok) {
    await prisma.dispatchLog.create({
      data: {
        guildId: parsed.data.guildId,
        channelId: parsed.data.channelId,
        transcript: parsed.data.transcript,
        speakerName: parsed.data.speakerName,
        action: "ERROR",
        detail: `Bot service failed with status ${botResponse.status}`,
        ok: false
      }
    });

    return reply.code(502).send({
      error: "Bot service unavailable",
      status: botResponse.status
    });
  }

  const json = await botResponse.json();
  const dispatchResult = dispatchResultSchema.parse(json);

  await prisma.dispatchLog.create({
    data: {
      guildId: parsed.data.guildId,
      channelId: parsed.data.channelId,
      transcript: parsed.data.transcript,
      speakerName: parsed.data.speakerName,
      action: dispatchResult.action,
      detail: dispatchResult.detail,
      ok: dispatchResult.action !== "NOOP"
    }
  });

  return dispatchResult;
});

const start = async (): Promise<void> => {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT
    });

    app.log.info({ port: env.PORT }, "Control-plane service listening");
  } catch (error) {
    app.log.error({ err: error }, "Failed to start control-plane service");
    process.exit(1);
  }
};

void start();
