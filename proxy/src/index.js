import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { anonymizeSections } from "./anonymize.js";
import { verifyToken } from "./auth.js";

const PORT = Number(process.env.PORT ?? 3000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "https://signflow.coach";

const app = Fastify({
  logger: {
    level: "info",
    redact: {
      paths: ["req.body", "res.body", "body", "req.headers.authorization"],
      remove: true,
    },
  },
  bodyLimit: 256 * 1024,
});

await app.register(cors, {
  origin: ALLOWED_ORIGIN,
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
});

app.get("/healthz", async () => ({ ok: true }));

app.post("/v1/anonymize", async (req, reply) => {
  const auth = verifyToken(req.headers.authorization);
  if (!auth.ok) {
    return reply.status(401).send({ error: `unauthorized: ${auth.reason}` });
  }

  const body = req.body;
  const sections = body?.sections;
  if (
    !sections ||
    typeof sections.teilnahme !== "string" ||
    typeof sections.ablauf !== "string" ||
    typeof sections.fazit !== "string"
  ) {
    return reply.status(400).send({
      error: "Body must be { sections: { teilnahme, ablauf, fazit } } with string values.",
    });
  }

  const total = sections.teilnahme.length + sections.ablauf.length + sections.fazit.length;
  if (total > 100_000) {
    return reply.status(413).send({ error: "Sections total too long." });
  }

  const result = await anonymizeSections(sections);
  return reply.send(result);
});

app.listen({ port: PORT, host: "127.0.0.1" }).then(() => {
  app.log.info(`anon-proxy listening on 127.0.0.1:${PORT}`);
});
