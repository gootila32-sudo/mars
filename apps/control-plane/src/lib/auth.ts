import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const SESSION_COOKIE_NAME = "mars_session";
const OAUTH_STATE_COOKIE_NAME = "mars_oauth_state";

interface SignedEnvelope<TPayload> {
  payload: TPayload;
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

const toBase64Url = (input: string): string =>
  Buffer.from(input, "utf8").toString("base64url");

const fromBase64Url = (input: string): string =>
  Buffer.from(input, "base64url").toString("utf8");

const sign = (value: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(value).digest("base64url");

const createSignedToken = <TPayload extends object>(
  payload: TPayload,
  secret: string,
  ttlSeconds: number
): string => {
  const now = Date.now();
  const envelope: SignedEnvelope<TPayload> = {
    payload,
    iat: now,
    exp: now + ttlSeconds * 1000
  };

  const body = toBase64Url(JSON.stringify(envelope));
  const signature = sign(body, secret);
  return `${body}.${signature}`;
};

const parseSignedToken = <TPayload>(
  token: string | undefined,
  secret: string
): TPayload | null => {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(body)) as SignedEnvelope<TPayload>;

    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      return null;
    }

    return parsed.payload;
  } catch {
    return null;
  }
};

export const assertInternalApiKey = (
  request: FastifyRequest,
  reply: FastifyReply,
  expectedApiKey: string
): boolean => {
  const apiKey = request.headers["x-api-key"];

  if (apiKey !== expectedApiKey) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }

  return true;
};

export const setSessionCookie = (
  reply: FastifyReply,
  user: AuthUser,
  secret: string,
  secure: boolean
): void => {
  const token = createSignedToken(user, secret, 60 * 60 * 24 * 7);

  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60 * 60 * 24 * 7
  });
};

export const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
};

export const readSessionUser = (
  request: FastifyRequest,
  secret: string
): AuthUser | null => parseSignedToken<AuthUser>(request.cookies[SESSION_COOKIE_NAME], secret);

interface OAuthStatePayload {
  state: string;
}

export const setOAuthStateCookie = (
  reply: FastifyReply,
  state: string,
  secret: string,
  secure: boolean
): void => {
  const token = createSignedToken<OAuthStatePayload>({ state }, secret, 60 * 10);

  reply.setCookie(OAUTH_STATE_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 60 * 10
  });
};

export const readOAuthState = (
  request: FastifyRequest,
  secret: string
): string | null => {
  const payload = parseSignedToken<OAuthStatePayload>(
    request.cookies[OAUTH_STATE_COOKIE_NAME],
    secret
  );

  return payload?.state ?? null;
};

export const clearOAuthStateCookie = (reply: FastifyReply): void => {
  reply.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });
};