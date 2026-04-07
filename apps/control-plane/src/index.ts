import path from "node:path";
import crypto from "node:crypto";
import { dispatchRequestSchema, guildConfigSchema } from "@mars/contracts";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import type { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { z } from "zod";
import { env } from "./config/env.js";
import {
  assertInternalApiKey,
  clearOAuthStateCookie,
  clearSessionCookie,
  readOAuthState,
  readSessionUser,
  setOAuthStateCookie,
  setSessionCookie,
  type AuthUser
} from "./lib/auth.js";
import { prisma } from "./lib/db.js";
import { toGuildConfig } from "./lib/guild-config.js";

const LOGIN_SCOPE = "identify guilds";
const inviteScope = "bot applications.commands";

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

const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const discordTokenSchema = z.object({
  access_token: z.string().min(1)
});

const discordUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional()
});

const app = Fastify({
  logger: true
});

const isSecureCookie = env.NODE_ENV === "production";

const toAppUser = (payload: z.infer<typeof discordUserSchema>): AuthUser => ({
  id: payload.id,
  username: payload.username,
  globalName: payload.global_name ?? null,
  avatarUrl: payload.avatar
    ? `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png?size=128`
    : null
});

const getInviteUrl = (guildId?: string): string => {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("scope", inviteScope);
  url.searchParams.set("permissions", env.DISCORD_BOT_PERMISSIONS);
  url.searchParams.set("disable_guild_select", "false");

  if (guildId) {
    url.searchParams.set("guild_id", guildId);
  }

  return url.toString();
};

const getAuthUserOrReply = (
  request: Parameters<typeof readSessionUser>[0],
  reply: Parameters<typeof clearSessionCookie>[0]
): AuthUser | null => {
  const user = readSessionUser(request, env.SESSION_SECRET);

  if (!user) {
    void reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  return user;
};

app.register(fastifyCookie);

app.register(fastifyStatic, {
  root: path.join(process.cwd(), "public"),
  prefix: "/"
});

app.get("/", async (_request, reply) => reply.sendFile("index.html"));

app.get("/health", async () => ({ status: "ok" }));

app.get("/auth/me", async (request) => {
  const user = readSessionUser(request, env.SESSION_SECRET);

  if (!user) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    user,
    inviteUrl: getInviteUrl()
  };
});

app.get("/auth/discord/login", async (_request, reply) => {
  const state = crypto.randomBytes(16).toString("hex");
  setOAuthStateCookie(reply, state, env.SESSION_SECRET, isSecureCookie);

  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", LOGIN_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "consent");

  return reply.redirect(authorizeUrl.toString());
});

app.get("/auth/discord/callback", async (request, reply) => {
  const parsed = oauthCallbackSchema.safeParse(request.query);

  if (!parsed.success) {
    return reply.redirect("/?auth=error");
  }

  const cookieState = readOAuthState(request, env.SESSION_SECRET);

  if (!cookieState || cookieState !== parsed.data.state) {
    clearOAuthStateCookie(reply);
    clearSessionCookie(reply);
    return reply.redirect("/?auth=invalid_state");
  }

  const tokenBody = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: parsed.data.code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    scope: LOGIN_SCOPE
  });

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody
  });

  if (!tokenResponse.ok) {
    app.log.error({ status: tokenResponse.status }, "Discord token exchange failed");
    clearOAuthStateCookie(reply);
    clearSessionCookie(reply);
    return reply.redirect("/?auth=token_error");
  }

  const tokenData = discordTokenSchema.safeParse(await tokenResponse.json());

  if (!tokenData.success) {
    app.log.error({ detail: tokenData.error.flatten() }, "Discord token payload invalid");
    clearOAuthStateCookie(reply);
    clearSessionCookie(reply);
    return reply.redirect("/?auth=token_invalid");
  }

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${tokenData.data.access_token}`
    }
  });

  if (!userResponse.ok) {
    app.log.error({ status: userResponse.status }, "Discord user fetch failed");
    clearOAuthStateCookie(reply);
    clearSessionCookie(reply);
    return reply.redirect("/?auth=user_error");
  }

  const userData = discordUserSchema.safeParse(await userResponse.json());

  if (!userData.success) {
    app.log.error({ detail: userData.error.flatten() }, "Discord user payload invalid");
    clearOAuthStateCookie(reply);
    clearSessionCookie(reply);
    return reply.redirect("/?auth=user_invalid");
  }

  setSessionCookie(reply, toAppUser(userData.data), env.SESSION_SECRET, isSecureCookie);
  clearOAuthStateCookie(reply);

  return reply.redirect("/?auth=success");
});

app.post("/auth/logout", async (_request, reply) => {
  clearSessionCookie(reply);
  clearOAuthStateCookie(reply);
  return reply.code(204).send();
});

app.get("/auth/discord/invite", async (request, reply) => {
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

  const guildId =
    typeof (request.query as { guildId?: unknown }).guildId === "string"
      ? ((request.query as { guildId: string }).guildId.trim() || undefined)
      : undefined;

  return reply.redirect(getInviteUrl(guildId));
});

app.get("/api/guilds", async (request, reply) => {
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

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
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

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
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

  const params = queryGuildSchema.safeParse({
    guildId: (request.params as { guildId?: string }).guildId
  });

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
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

  const params = queryGuildSchema.safeParse({
    guildId: (request.params as { guildId?: string }).guildId
  });

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

app.get("/api/dispatch", async (request, reply) => {
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

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
  const user = getAuthUserOrReply(request, reply);

  if (!user) {
    return;
  }

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
    let detail = `Bot service failed with status ${botResponse.status}`;

    try {
      const payload = (await botResponse.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      // Keep the generic detail if the bot response is not JSON.
    }

    await prisma.dispatchLog.create({
      data: {
        guildId: parsed.data.guildId,
        channelId: parsed.data.channelId,
        transcript: parsed.data.transcript,
        speakerName: parsed.data.speakerName,
        action: "ERROR",
        detail,
        ok: false
      }
    });

    return reply.code(502).send({
      error: "Bot service unavailable",
      status: botResponse.status,
      detail
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
