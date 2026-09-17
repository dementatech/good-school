import { renderToBuffer } from "@react-pdf/renderer";
import { TableDocument } from "./templates/TableDocument.js";
import type { ExportCell } from "./types.js";

export async function buildPdfBuffer(title: string, headers: string[], rows: ExportCell[][]): Promise<Buffer> {
  return renderToBuffer(<TableDocument title={title} headers={headers} rows={rows} generatedAt={new Date()} />);
}
