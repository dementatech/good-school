import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { registerAuthModule } from "./modules/auth/index.js";
import { registerSchoolsModule } from "./modules/schools/index.js";
import { registerStudentsModule } from "./modules/students/index.js";
import { registerAcademicStructureModule } from "./modules/academic-structure/index.js";

const fastify = Fastify({
  logger:
    process.env.NODE_ENV === "production"
      ? true
      : { transport: { target: "pino-pretty" } },
});

await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET,
});

await registerAuthModule(fastify);
await registerSchoolsModule(fastify);
await registerStudentsModule(fastify);
await registerAcademicStructureModule(fastify);

const port = Number(process.env.PORT ?? 4000);

fastify
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
