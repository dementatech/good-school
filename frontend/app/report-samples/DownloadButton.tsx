'use client';

import { Download } from 'lucide-react';

/**
 * Opens the browser's print dialog; choosing "Save as PDF" there downloads the
 * report exactly as it prints (one A4 landscape page). The tab title is the
 * suggested file name, so it's swapped for the print and put back after.
 */
export function DownloadButton({ fileName }: { fileName: string }) {
  function download() {
    const title = document.title;
    document.title = fileName;
    window.addEventListener('afterprint', () => (document.title = title), { once: true });
    window.print();
  }
  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 bg-[#1d4f91] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163d70] print:hidden"
    >
      <Download className="h-4 w-4" aria-hidden />
      Download PDF
    </button>
  );
}
