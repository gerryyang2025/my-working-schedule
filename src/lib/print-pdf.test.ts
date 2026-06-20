import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrintPdfFile } from "./print-pdf";

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  drawImage: vi.fn(),
  output: vi.fn(),
  pageSize: {
    getWidth: vi.fn(),
    getHeight: vi.fn()
  }
}));

vi.mock("html2canvas", () => ({
  default: vi.fn()
}));

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(() => ({
    addImage: pdfMocks.addImage,
    addPage: pdfMocks.addPage,
    output: pdfMocks.output,
    internal: {
      pageSize: pdfMocks.pageSize
    }
  }))
}));

function createCanvasMock(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "width", { configurable: true, value: width });
  Object.defineProperty(canvas, "height", { configurable: true, value: height });
  Object.defineProperty(canvas, "toDataURL", {
    configurable: true,
    value: vi.fn(() => "data:image/png;base64,preview")
  });
  return canvas;
}

describe("createPrintPdfFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: pdfMocks.drawImage,
      fillRect: vi.fn(),
      fillStyle: ""
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,page");
    pdfMocks.output.mockReturnValue(new Blob(["pdf-bytes"], { type: "application/pdf" }));
    pdfMocks.pageSize.getWidth.mockReturnValue(297);
    pdfMocks.pageSize.getHeight.mockReturnValue(210);
  });

  it("captures a preview element and returns a named PDF file", async () => {
    const preview = document.createElement("section");
    Object.defineProperties(preview, {
      clientWidth: { configurable: true, value: 960 },
      offsetWidth: { configurable: true, value: 960 },
      scrollWidth: { configurable: true, value: 960 },
      clientHeight: { configurable: true, value: 640 },
      offsetHeight: { configurable: true, value: 640 },
      scrollHeight: { configurable: true, value: 640 }
    });
    const canvas = createCanvasMock(1200, 800);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    const file = await createPrintPdfFile({ element: preview, filename: "week-schedule.pdf" });

    const [capturedElement, captureOptions] = vi.mocked(html2canvas).mock.calls[0];
    expect(capturedElement).toBeInstanceOf(HTMLElement);
    expect(captureOptions).toEqual(
      expect.objectContaining({
        backgroundColor: "#ffffff",
        scale: 2,
        width: 960,
        height: 640
      })
    );
    expect(jsPDF).toHaveBeenCalledWith({ orientation: "landscape", unit: "mm", format: "a4" });
    expect(pdfMocks.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,page",
      "PNG",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    expect(pdfMocks.output).toHaveBeenCalledWith("blob");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("week-schedule.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("slices tall print captures into visible PDF pages without negative offsets", async () => {
    const preview = document.createElement("section");
    const canvas = createCanvasMock(1000, 3000);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    await createPrintPdfFile({ element: preview, filename: "month-schedule.pdf" });

    expect(pdfMocks.addPage).toHaveBeenCalled();
    for (const call of pdfMocks.addImage.mock.calls) {
      expect(call[3]).toBeGreaterThanOrEqual(8);
      expect(call[5]).toBeLessThanOrEqual(194);
    }
  });

  it("tiles wide and tall print captures across PDF pages without clipping content", async () => {
    const preview = document.createElement("section");
    Object.defineProperties(preview, {
      clientWidth: { configurable: true, value: 1200 },
      offsetWidth: { configurable: true, value: 1200 },
      scrollWidth: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 850 },
      offsetHeight: { configurable: true, value: 850 },
      scrollHeight: { configurable: true, value: 850 }
    });
    const canvas = createCanvasMock(2400, 1700);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    await createPrintPdfFile({ element: preview, filename: "month-schedule.pdf" });

    expect(pdfMocks.addImage).toHaveBeenCalledTimes(4);
    expect(pdfMocks.addPage).toHaveBeenCalledTimes(3);
    expect(pdfMocks.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 1920, 1325, 0, 0, 1920, 1325);
    expect(pdfMocks.drawImage).toHaveBeenCalledWith(canvas, 1920, 0, 480, 1325, 0, 0, 480, 1325);
    expect(pdfMocks.drawImage).toHaveBeenCalledWith(canvas, 0, 1325, 1920, 375, 0, 0, 1920, 375);
    expect(pdfMocks.drawImage).toHaveBeenCalledWith(canvas, 1920, 1325, 480, 375, 0, 0, 480, 375);
  });

  it("captures a print-width clone instead of the narrow mobile preview", async () => {
    const preview = document.createElement("section");
    preview.className = "print-view print-week print-preview-active";
    Object.defineProperties(preview, {
      clientWidth: { configurable: true, value: 360 },
      offsetWidth: { configurable: true, value: 360 },
      scrollWidth: { configurable: true, value: 760 },
      clientHeight: { configurable: true, value: 620 },
      offsetHeight: { configurable: true, value: 620 },
      scrollHeight: { configurable: true, value: 620 }
    });
    const canvas = createCanvasMock(1200, 800);
    let captureHostClass = "";

    vi.mocked(html2canvas).mockImplementation(async (target) => {
      captureHostClass = (target as HTMLElement).parentElement?.className ?? "";
      return canvas;
    });

    await createPrintPdfFile({ element: preview, filename: "week-schedule.pdf" });

    const [capturedElement, options] = vi.mocked(html2canvas).mock.calls[0];
    expect(capturedElement).not.toBe(preview);
    expect(captureHostClass).toContain("print-preview-content");
    expect(captureHostClass).toContain("print-pdf-capture-host");
    expect(options).toEqual(
      expect.objectContaining({
        width: 960,
        height: 620,
        windowWidth: 960,
        windowHeight: 620,
        scrollX: 0,
        scrollY: 0
      })
    );
    expect(document.body.contains(capturedElement as HTMLElement)).toBe(false);
  });

  it("expands cloned print content before PDF capture", async () => {
    const preview = document.createElement("section");
    preview.className = "print-view print-month print-preview-active";
    Object.assign(preview.style, {
      maxHeight: "320px",
      overflow: "auto"
    });
    Object.defineProperties(preview, {
      clientWidth: { configurable: true, value: 360 },
      offsetWidth: { configurable: true, value: 360 },
      scrollWidth: { configurable: true, value: 1120 },
      clientHeight: { configurable: true, value: 320 },
      offsetHeight: { configurable: true, value: 320 },
      scrollHeight: { configurable: true, value: 1400 }
    });
    const canvas = createCanvasMock(2240, 2800);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    await createPrintPdfFile({ element: preview, filename: "month-schedule.pdf" });

    const [capturedElement] = vi.mocked(html2canvas).mock.calls[0];
    expect((capturedElement as HTMLElement).style.maxHeight).toBe("none");
    expect((capturedElement as HTMLElement).style.overflow).toBe("visible");
    expect((capturedElement as HTMLElement).style.height).toBe("auto");
  });

  it("rejects missing print content with a clear error", async () => {
    await expect(
      createPrintPdfFile({ element: undefined as unknown as HTMLElement, filename: "empty.pdf" })
    ).rejects.toThrow("打印内容不可用");
  });
});
