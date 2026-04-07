import type { FastifyReply, FastifyRequest } from "fastify";

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