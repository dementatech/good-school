import "dotenv/config";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { registerAuthModule } from "./modules/auth/index.js";
import { registerSchoolsModule } from "./modules/schools/index.js";
import { registerStudentsModule } from "./modules/students/index.js";
import { registerAcademicStructureModule } from "./modules/academic-structure/index.js";
import { registerTeachersModule } from "./modules/teachers/index.js";
import { registerOrganizationModule } from "./modules/organization/index.js";
import { registerExamsModule } from "./modules/exams/index.js";
import { registerEarlyYearsModule } from "./modules/early-years/index.js";
import { registerTimetableModule } from "./modules/timetable/index.js";
import { registerAttendanceModule } from "./modules/attendance/index.js";
import { registerLessonPrepModule } from "./modules/lesson-prep/index.js";
import { registerAdminModule } from "./modules/admin/index.js";
import { registerParentsModule } from "./modules/parents/index.js";
import { registerNotificationsModule } from "./modules/notifications/index.js";
import { registerEventsModule } from "./modules/events/index.js";
import { registerExportModule } from "./modules/export/index.js";
import { registerCommunicationsModule } from "./modules/communications/index.js";
import { registerRealtimeModule } from "./modules/realtime/index.js";
import { registerSupportModule } from "./modules/support/index.js";
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

await fastify.register(websocket);

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
await registerExamsModule(fastify);
await registerEarlyYearsModule(fastify);
await registerTimetableModule(fastify);
await registerAttendanceModule(fastify);
await registerLessonPrepModule(fastify);
await registerAdminModule(fastify);
await registerParentsModule(fastify);
await registerNotificationsModule(fastify);
await registerEventsModule(fastify);
await registerExportModule(fastify);
await registerRealtimeModule(fastify);
await registerCommunicationsModule(fastify);
await registerSupportModule(fastify);

const port = Number(process.env.PORT ?? 4000);

fastify
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
