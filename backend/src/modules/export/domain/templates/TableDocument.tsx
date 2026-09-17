import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ExportCell } from "../types.js";

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 8, color: "#64748b", marginBottom: 16 },
  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#cbd5e1" },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: "#f1f5f9" },
  cell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
  },
  headerCell: { fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#94a3b8",
    textAlign: "center",
  },
});

function cellText(value: ExportCell): string {
  return value === null || value === undefined ? "" : String(value);
}

export interface TableDocumentProps {
  title: string;
  headers: string[];
  rows: ExportCell[][];
  generatedAt: Date;
}

/**
 * Default table layout used by the generic "Export as PDF" action. Swap or
 * extend this component (or add sibling templates in this folder) for
 * report-specific layouts — the export route just needs a Buffer back,
 * however the document is composed.
 */
export function TableDocument({ title, headers, rows, generatedAt }: TableDocumentProps) {
  const orientation = headers.length > 6 ? "landscape" : "portrait";

  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          Generated {generatedAt.toLocaleString()} · {rows.length} row{rows.length === 1 ? "" : "s"}
        </Text>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]} fixed>
            {headers.map((header, i) => (
              <Text key={i} style={[styles.cell, styles.headerCell]}>
                {header}
              </Text>
            ))}
          </View>

          {rows.map((row, rowIndex) => (
            <View style={styles.row} key={rowIndex} wrap={false}>
              {row.map((value, cellIndex) => (
                <Text key={cellIndex} style={styles.cell}>
                  {cellText(value)}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
