import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { registerAuthModule } from "./modules/auth/index.js";
import { registerSchoolsModule } from "./modules/schools/index.js";
import { registerStudentsModule } from "./modules/students/index.js";
import { registerAcademicStructureModule } from "./modules/academic-structure/index.js";
import { registerTeachersModule } from "./modules/teachers/index.js";
import { registerOrganizationModule } from "./modules/organization/index.js";
import { ensureUploadsRoot, uploadsRoot } from "./shared/uploads.js";

const fastify = Fastify({
  logger:
    process.env.NODE_ENV === "production"
      ? true
      : { transport: { target: "pino-pretty" } },
});

await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET,
});

// A staff photo tops out here — plenty for a phone-camera headshot, small
// enough that one abusive upload can't fill the disk.
await fastify.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

await ensureUploadsRoot();
await fastify.register(fastifyStatic, {
  root: uploadsRoot(),
  prefix: "/uploads/",
});

await registerAuthModule(fastify);
await registerSchoolsModule(fastify);
await registerStudentsModule(fastify);
await registerAcademicStructureModule(fastify);
await registerTeachersModule(fastify);
await registerOrganizationModule(fastify);

const port = Number(process.env.PORT ?? 4000);

fastify
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
