interface CreatePrintPdfFileOptions {
  element: HTMLElement;
  filename: string;
}

const PDF_MARGIN_MM = 8;
const PDF_CAPTURE_MIN_WIDTH_PX = 960;
const PDF_PAGE_SELECTOR = ".print-pdf-page";

interface PdfCaptureTarget {
  element: HTMLElement;
  width: number;
  height: number;
  cleanup: () => void;
}

interface PdfImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
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

function getPrintViewContextClasses(sourceElement: HTMLElement): string[] {
  const printView = sourceElement.closest<HTMLElement>(".print-view");

  if (!printView || printView === sourceElement) {
    return [];
  }

  return Array.from(printView.classList).filter((className) => className !== "print-preview-active");
}

function createPdfCaptureTarget(sourceElement: HTMLElement): PdfCaptureTarget {
  let width = Math.max(
    PDF_CAPTURE_MIN_WIDTH_PX,
    getElementDimension(sourceElement, ["scrollWidth", "offsetWidth", "clientWidth"])
  );
  const sourceHeight = getElementDimension(sourceElement, ["scrollHeight", "offsetHeight", "clientHeight"]);
  const host = document.createElement("div");
  const clonedElement = sourceElement.cloneNode(true) as HTMLElement;
  clonedElement.classList.add(...getPrintViewContextClasses(sourceElement));

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
    width: "100%",
    height: "auto",
    maxHeight: "none",
    overflow: "visible"
  });

  host.appendChild(clonedElement);
  document.body.appendChild(host);

  width = Math.max(width, getElementDimension(clonedElement, ["scrollWidth", "offsetWidth", "clientWidth"]));
  host.style.width = `${width}px`;

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

function getLogicalPrintPages(sourceElement: HTMLElement): HTMLElement[] {
  if (sourceElement.matches(PDF_PAGE_SELECTOR)) {
    return [sourceElement];
  }

  const pages = Array.from(sourceElement.querySelectorAll<HTMLElement>(PDF_PAGE_SELECTOR));
  return pages.length ? pages : [sourceElement];
}

function calculatePdfImagePlacement(
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  printableWidth: number,
  printableHeight: number
): PdfImagePlacement {
  const imageRatio = canvas.width / Math.max(1, canvas.height);
  let imageWidth = printableWidth;
  let imageHeight = imageWidth / imageRatio;

  if (imageHeight > printableHeight) {
    imageHeight = printableHeight;
    imageWidth = imageHeight * imageRatio;
  }

  return {
    x: (pageWidth - imageWidth) / 2,
    y: (pageHeight - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight
  };
}

export async function createPrintPdfFile({ element, filename }: CreatePrintPdfFileOptions): Promise<File> {
  if (!element) {
    throw new Error("打印内容不可用");
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - PDF_MARGIN_MM * 2;
  const printableHeight = pageHeight - PDF_MARGIN_MM * 2;
  const logicalPages = getLogicalPrintPages(element);

  for (const [pageIndex, logicalPage] of logicalPages.entries()) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    const captureTarget = createPdfCaptureTarget(logicalPage);
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

    const placement = calculatePdfImagePlacement(canvas, pageWidth, pageHeight, printableWidth, printableHeight);

    pdf.addImage(
      canvas.toDataURL("image/png"),
      "PNG",
      placement.x,
      placement.y,
      placement.width,
      placement.height
    );
  }

  const pdfBlob = pdf.output("blob");
  return new File([pdfBlob], filename, { type: "application/pdf" });
}
