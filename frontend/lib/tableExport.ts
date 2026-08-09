export type ExportCell = string | number | null | undefined;

function cellText(cell: ExportCell): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(filename: string, headers: string[], rows: ExportCell[][]): void {
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [headers, ...rows.map((row) => row.map(cellText))].map((line) =>
    line.map(escape).join(","),
  );

  downloadBlob(`${filename}.csv`, new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }));
}

// xlsx/jspdf are only imported when actually used, so exporting rarely-used
// formats doesn't add weight to every page load.
export async function exportToExcel(
  filename: string,
  headers: string[],
  rows: ExportCell[][],
): Promise<void> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row) => row.map(cellText))]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportToPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: ExportCell[][],
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: rows.length && headers.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(12);
  doc.text(title, 14, 14);
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map(cellText)),
    startY: 20,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [64, 64, 64] },
  });
  doc.save(`${filename}.pdf`);
}
