import "dotenv/config";
import { buildApp } from "./app.js";

const fastify = await buildApp();

const port = Number(process.env.PORT ?? 4000);

fastify
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
