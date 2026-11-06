import type { FastifyInstance } from "fastify";
import { communicationsRoutes } from "./api/routes.js";
import { directPartners } from "./domain/rooms.repository.js";
import { onPresenceChange, pushToUser } from "../realtime/index.js";

export async function registerCommunicationsModule(fastify: FastifyInstance) {
  await fastify.register(communicationsRoutes, { prefix: "/api/v1/communications" });

  // Online dots: tell the people someone has a private chat with when they
  // come online or go offline.
  onPresenceChange((userId, online) => {
    directPartners(userId)
      .then((partners) => {
        for (const partner of partners) pushToUser(partner, { type: "chat_presence", userId, online });
      })
      .catch(() => {});
  });
}

/** For modules that change classes, enrollment or staff and want chat groups to follow at once. */
export { markSchoolStale } from "./domain/auto-rooms.js";
