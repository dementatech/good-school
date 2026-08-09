import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import {
  createAcademicLevel,
  deleteAcademicLevel,
  getAcademicLevel,
  listAcademicLevels,
  updateAcademicLevel,
  type AcademicLevelInput,
} from "../domain/academic-levels.repository.js";
import {
  createAcademicYear,
  deleteAcademicYear,
  getAcademicYear,
  listAcademicYears,
  updateAcademicYear,
  type AcademicYearInput,
} from "../domain/academic-years.repository.js";
import {
  createTerm,
  deleteTerm,
  getTerm,
  listTerms,
  TermLimitExceededError,
  updateTerm,
  type TermInput,
} from "../domain/terms.repository.js";
import {
  createClass,
  deleteClass,
  getClass,
  listClasses,
  updateClass,
  type ClassInput,
} from "../domain/classes.repository.js";
import {
  createStream,
  deleteStream,
  getStream,
  listStreams,
  updateStream,
  type StreamInput,
} from "../domain/streams.repository.js";
import {
  academicLevelBodySchema,
  academicLevelResponseSchema,
  academicYearBodySchema,
  academicYearResponseSchema,
  classBodySchema,
  classResponseSchema,
  listAcademicLevelsResponseSchema,
  listAcademicYearsResponseSchema,
  listClassesResponseSchema,
  listStreamsResponseSchema,
  listTermsResponseSchema,
  streamBodySchema,
  streamResponseSchema,
  termBodySchema,
  termResponseSchema,
} from "./schemas.js";

// Every route here is admin-only and scoped to the admin's own school_id
// (from the verified JWT), matching the students module's convention.
export async function academicStructureRoutes(fastify: FastifyInstance) {
  // -- Academic levels -------------------------------------------------------

  fastify.get(
    "/levels",
    { preHandler: requireAuth(["admin"]), schema: { response: listAcademicLevelsResponseSchema } },
    async (request) => listAcademicLevels(request.authUser!.school_id!),
  );

  fastify.get<{ Params: { id: string } }>(
    "/levels/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: academicLevelResponseSchema } },
    async (request, reply) => {
      const level = await getAcademicLevel(request.authUser!.school_id!, request.params.id);
      if (!level) return reply.status(404).send({ error: "not_found" });
      return level;
    },
  );

  fastify.post<{ Body: AcademicLevelInput }>(
    "/levels",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: academicLevelBodySchema, response: academicLevelResponseSchema },
    },
    async (request, reply) => {
      const level = await createAcademicLevel(request.authUser!.school_id!, request.body);
      return reply.status(201).send(level);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: AcademicLevelInput }>(
    "/levels/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: academicLevelBodySchema, response: academicLevelResponseSchema },
    },
    async (request, reply) => {
      const level = await updateAcademicLevel(
        request.authUser!.school_id!,
        request.params.id,
        request.body,
      );
      if (!level) return reply.status(404).send({ error: "not_found" });
      return level;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/levels/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteAcademicLevel(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  // -- Academic years ----------------------------------------------------------

  fastify.get(
    "/years",
    { preHandler: requireAuth(["admin"]), schema: { response: listAcademicYearsResponseSchema } },
    async (request) => listAcademicYears(request.authUser!.school_id!),
  );

  fastify.get<{ Params: { id: string } }>(
    "/years/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: academicYearResponseSchema } },
    async (request, reply) => {
      const year = await getAcademicYear(request.authUser!.school_id!, request.params.id);
      if (!year) return reply.status(404).send({ error: "not_found" });
      return year;
    },
  );

  fastify.post<{ Body: AcademicYearInput }>(
    "/years",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: academicYearBodySchema, response: academicYearResponseSchema },
    },
    async (request, reply) => {
      const year = await createAcademicYear(
        request.authUser!.school_id!,
        request.body,
        request.authUser!.user_id,
      );
      return reply.status(201).send(year);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: AcademicYearInput }>(
    "/years/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: academicYearBodySchema, response: academicYearResponseSchema },
    },
    async (request, reply) => {
      const year = await updateAcademicYear(
        request.authUser!.school_id!,
        request.params.id,
        request.body,
      );
      if (!year) return reply.status(404).send({ error: "not_found" });
      return year;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/years/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteAcademicYear(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  // -- Terms ---------------------------------------------------------------------

  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/terms",
    { preHandler: requireAuth(["admin"]), schema: { response: listTermsResponseSchema } },
    async (request) => listTerms(request.authUser!.school_id!, request.query.academicYearId),
  );

  fastify.get<{ Params: { id: string } }>(
    "/terms/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: termResponseSchema } },
    async (request, reply) => {
      const term = await getTerm(request.authUser!.school_id!, request.params.id);
      if (!term) return reply.status(404).send({ error: "not_found" });
      return term;
    },
  );

  fastify.post<{ Body: TermInput }>(
    "/terms",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: termBodySchema, response: termResponseSchema },
    },
    async (request, reply) => {
      try {
        const term = await createTerm(
          request.authUser!.school_id!,
          request.body,
          request.authUser!.user_id,
        );
        if (!term) return reply.status(404).send({ error: "academic_year_not_found" });
        return reply.status(201).send(term);
      } catch (err) {
        if (err instanceof TermLimitExceededError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { id: string }; Body: TermInput }>(
    "/terms/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: termBodySchema, response: termResponseSchema },
    },
    async (request, reply) => {
      const term = await updateTerm(request.authUser!.school_id!, request.params.id, request.body);
      if (!term) return reply.status(404).send({ error: "not_found" });
      return term;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/terms/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteTerm(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  // -- Classes ---------------------------------------------------------------------

  fastify.get<{ Querystring: { academicYearId?: string } }>(
    "/classes",
    { preHandler: requireAuth(["admin"]), schema: { response: listClassesResponseSchema } },
    async (request) => listClasses(request.authUser!.school_id!, request.query.academicYearId),
  );

  fastify.get<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: classResponseSchema } },
    async (request, reply) => {
      const klass = await getClass(request.authUser!.school_id!, request.params.id);
      if (!klass) return reply.status(404).send({ error: "not_found" });
      return klass;
    },
  );

  fastify.post<{ Body: ClassInput }>(
    "/classes",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: classBodySchema, response: classResponseSchema },
    },
    async (request, reply) => {
      const klass = await createClass(
        request.authUser!.school_id!,
        request.body,
        request.authUser!.user_id,
      );
      if (!klass) return reply.status(404).send({ error: "academic_year_or_level_not_found" });
      return reply.status(201).send(klass);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: ClassInput }>(
    "/classes/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: classBodySchema, response: classResponseSchema },
    },
    async (request, reply) => {
      const klass = await updateClass(
        request.authUser!.school_id!,
        request.params.id,
        request.body,
      );
      if (!klass) return reply.status(404).send({ error: "not_found" });
      return klass;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/classes/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteClass(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );

  // -- Streams ---------------------------------------------------------------------

  fastify.get<{ Querystring: { classId?: string } }>(
    "/streams",
    { preHandler: requireAuth(["admin"]), schema: { response: listStreamsResponseSchema } },
    async (request) => listStreams(request.authUser!.school_id!, request.query.classId),
  );

  fastify.get<{ Params: { id: string } }>(
    "/streams/:id",
    { preHandler: requireAuth(["admin"]), schema: { response: streamResponseSchema } },
    async (request, reply) => {
      const stream = await getStream(request.authUser!.school_id!, request.params.id);
      if (!stream) return reply.status(404).send({ error: "not_found" });
      return stream;
    },
  );

  fastify.post<{ Body: StreamInput }>(
    "/streams",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: streamBodySchema, response: streamResponseSchema },
    },
    async (request, reply) => {
      const stream = await createStream(
        request.authUser!.school_id!,
        request.body,
        request.authUser!.user_id,
      );
      if (!stream) return reply.status(404).send({ error: "class_not_found" });
      return reply.status(201).send(stream);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: StreamInput }>(
    "/streams/:id",
    {
      preHandler: requireAuth(["admin"]),
      schema: { body: streamBodySchema, response: streamResponseSchema },
    },
    async (request, reply) => {
      const stream = await updateStream(
        request.authUser!.school_id!,
        request.params.id,
        request.body,
      );
      if (!stream) return reply.status(404).send({ error: "not_found" });
      return stream;
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    "/streams/:id",
    { preHandler: requireAuth(["admin"]) },
    async (request, reply) => {
      const deleted = await deleteStream(request.authUser!.school_id!, request.params.id);
      if (!deleted) return reply.status(404).send({ error: "not_found" });
      return reply.status(204).send();
    },
  );
}
