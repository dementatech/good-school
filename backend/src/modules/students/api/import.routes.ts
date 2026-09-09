import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { ok, fail } from "../../../shared/envelope.js";
import {
  buildImportTemplate,
  importStudents,
  parseImportFile,
  type ImportRow,
} from "../domain/student-import.repository.js";
import { importRowsBodySchema } from "./schemas.js";

const ADMIN = requireAuth(["admin", "school_admin", "super_admin"]);

// Bulk upload of pre-existing students, scoped to the caller's own school
// (from the verified JWT). Three steps, matching the UI:
//   GET  /import/template  → the .xlsx to fill in
//   POST /import/parse     → multipart upload → parsed, un-saved rows for review
//   POST /import           → { rows } → creates accounts, returns per-row results
export async function studentImportRoutes(fastify: FastifyInstance) {
  fastify.get("/import/template", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = request.authUser?.school_id;
    if (!schoolId) return reply.status(400).send(fail("no_school_context"));
    const buffer = await buildImportTemplate(schoolId);
    return reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header("Content-Disposition", 'attachment; filename="student-import-template.xlsx"')
      .send(buffer);
  });

  fastify.post("/import/parse", { preHandler: ADMIN }, async (request, reply) => {
    const schoolId = request.authUser?.school_id;
    if (!schoolId) return reply.status(400).send(fail("no_school_context"));

    const uploaded = await request.file();
    if (!uploaded) return reply.status(400).send(fail("No file uploaded"));

    const name = uploaded.filename.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      return reply.status(400).send(fail("Upload the .xlsx template or a .csv file"));
    }

    const buffer = await uploaded.toBuffer();
    try {
      const rows = await parseImportFile(buffer, uploaded.filename);
      if (rows.length === 0) {
        return reply.status(400).send(fail("No student rows found in the file"));
      }
      return ok(rows);
    } catch {
      return reply.status(400).send(fail("Could not read the file — is it the right template?"));
    }
  });

  fastify.post<{ Body: { rows: ImportRow[] } }>(
    "/import",
    { preHandler: ADMIN, schema: { body: importRowsBodySchema } },
    async (request, reply) => {
      const schoolId = request.authUser?.school_id;
      if (!schoolId) return reply.status(400).send(fail("no_school_context"));
      const results = await importStudents(
        schoolId,
        request.authUser!.user_id,
        request.body.rows,
      );
      return ok(results);
    },
  );
}
