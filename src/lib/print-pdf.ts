interface CreatePrintPdfFileOptions {
  element: HTMLElement;
  filename: string;
}

const PDF_MARGIN_MM = 8;

export async function createPrintPdfFile({ element, filename }: CreatePrintPdfFileOptions): Promise<File> {
  if (!element) {
    throw new Error("打印内容不可用");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2
  });

  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error("打印内容不可用");
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageData = canvas.toDataURL("image/png");
  const printableWidth = pageWidth - PDF_MARGIN_MM * 2;
  const printableHeight = pageHeight - PDF_MARGIN_MM * 2;
  const imageHeight = (canvas.height * printableWidth) / canvas.width;
  const pageCount = Math.max(1, Math.ceil(imageHeight / printableHeight));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(imageData, "PNG", PDF_MARGIN_MM, PDF_MARGIN_MM - pageIndex * printableHeight, printableWidth, imageHeight);
  }

  const pdfBlob = pdf.output("blob");
  return new File([pdfBlob], filename, { type: "application/pdf" });
}
