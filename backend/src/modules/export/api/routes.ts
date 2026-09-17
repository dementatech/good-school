import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/index.js";
import { fail } from "../../../shared/envelope.js";
import { buildExcelWorkbook } from "../domain/excel-builder.js";
import { buildPdfBuffer } from "../domain/pdf-builder.js";
import type { ExportCell } from "../domain/types.js";

const AUTHENTICATED = requireAuth();

interface TableExportBody {
  filename?: string;
  headers?: string[];
  rows?: ExportCell[][];
}

interface PdfExportBody extends TableExportBody {
  title?: string;
}

function isValidTable(headers: unknown, rows: unknown): boolean {
  return (
    Array.isArray(headers) &&
    headers.every((h) => typeof h === "string") &&
    Array.isArray(rows) &&
    rows.every((row) => Array.isArray(row))
  );
}

// Filenames come from the current page/table name, not user free text, but a
// sanitize pass keeps the Content-Disposition header well-formed regardless.
function sanitizeFilename(name: string | undefined, fallback: string): string {
  const base = (name ?? fallback).trim().replace(/[^a-zA-Z0-9-_ ]/g, "");
  return base || fallback;
}

export async function exportRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: TableExportBody }>("/excel", { preHandler: AUTHENTICATED }, async (request, reply) => {
    const { filename, headers, rows } = request.body ?? {};
    if (!isValidTable(headers, rows)) {
      return reply.status(400).send(fail("headers and rows are required"));
    }

    const buffer = await buildExcelWorkbook(headers as string[], rows as ExportCell[][]);
    const name = sanitizeFilename(filename, "export");
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${name}.xlsx"`)
      .send(buffer);
  });

  fastify.post<{ Body: PdfExportBody }>("/pdf", { preHandler: AUTHENTICATED }, async (request, reply) => {
    const { filename, title, headers, rows } = request.body ?? {};
    if (!isValidTable(headers, rows)) {
      return reply.status(400).send(fail("headers and rows are required"));
    }

    const buffer = await buildPdfBuffer(title ?? "Export", headers as string[], rows as ExportCell[][]);
    const name = sanitizeFilename(filename, "export");
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${name}.pdf"`)
      .send(buffer);
  });
}
