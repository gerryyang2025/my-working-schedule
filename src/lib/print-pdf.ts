interface CreatePrintPdfFileOptions {
  element: HTMLElement;
  filename: string;
}

const PDF_MARGIN_MM = 8;
const PDF_CAPTURE_MIN_WIDTH_PX = 960;

interface PdfCaptureTarget {
  element: HTMLElement;
  width: number;
  height: number;
  cleanup: () => void;
}

function getElementDimension(element: HTMLElement, dimensionNames: Array<"clientWidth" | "offsetWidth" | "scrollWidth">): number;
function getElementDimension(element: HTMLElement, dimensionNames: Array<"clientHeight" | "offsetHeight" | "scrollHeight">): number;
function getElementDimension(
  element: HTMLElement,
  dimensionNames: Array<
    "clientWidth" | "offsetWidth" | "scrollWidth" | "clientHeight" | "offsetHeight" | "scrollHeight"
  >
): number {
  return Math.max(0, ...dimensionNames.map((dimensionName) => element[dimensionName] || 0));
}

function createPdfCaptureTarget(sourceElement: HTMLElement): PdfCaptureTarget {
  const width = Math.max(
    PDF_CAPTURE_MIN_WIDTH_PX,
    getElementDimension(sourceElement, ["scrollWidth", "offsetWidth", "clientWidth"])
  );
  const sourceHeight = getElementDimension(sourceElement, ["scrollHeight", "offsetHeight", "clientHeight"]);
  const host = document.createElement("div");
  const clonedElement = sourceElement.cloneNode(true) as HTMLElement;

  host.className = "print-preview-content print-pdf-capture-host";
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    top: "0",
    left: "0",
    zIndex: "-1",
    width: `${width}px`,
    maxHeight: "none",
    overflow: "visible",
    border: "0",
    padding: "0",
    background: "#ffffff",
    pointerEvents: "none"
  });
  Object.assign(clonedElement.style, {
    display: "block",
    width: "100%"
  });

  host.appendChild(clonedElement);
  document.body.appendChild(host);

  const height = Math.max(
    sourceHeight,
    getElementDimension(clonedElement, ["scrollHeight", "offsetHeight", "clientHeight"])
  );

  return {
    element: clonedElement,
    width,
    height,
    cleanup: () => {
      host.remove();
    }
  };
}

export async function createPrintPdfFile({ element, filename }: CreatePrintPdfFileOptions): Promise<File> {
  if (!element) {
    throw new Error("打印内容不可用");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const captureTarget = createPdfCaptureTarget(element);
  const canvas = await html2canvas(captureTarget.element, {
    backgroundColor: "#ffffff",
    scale: 2,
    width: captureTarget.width,
    height: captureTarget.height,
    windowWidth: captureTarget.width,
    windowHeight: captureTarget.height,
    scrollX: 0,
    scrollY: 0
  }).finally(captureTarget.cleanup);

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
