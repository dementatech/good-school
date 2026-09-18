import ExcelJS from "exceljs";
import type { ExportCell } from "./types.js";

export async function buildExcelWorkbook(headers: string[], rows: ExportCell[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

  sheet.columns.forEach((column) => {
    let maxLength = headers.length ? 10 : 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const length = cell.value === null || cell.value === undefined ? 0 : String(cell.value).length;
      if (length > maxLength) maxLength = length;
    });
    column.width = Math.min(maxLength + 2, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
