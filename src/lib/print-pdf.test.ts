import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrintPdfFile } from "./print-pdf";

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
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
    pdfMocks.output.mockReturnValue(new Blob(["pdf-bytes"], { type: "application/pdf" }));
    pdfMocks.pageSize.getWidth.mockReturnValue(297);
    pdfMocks.pageSize.getHeight.mockReturnValue(210);
  });

  it("captures a preview element and returns a named PDF file", async () => {
    const preview = document.createElement("section");
    const canvas = createCanvasMock(1200, 800);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    const file = await createPrintPdfFile({ element: preview, filename: "week-schedule.pdf" });

    expect(html2canvas).toHaveBeenCalledWith(
      preview,
      expect.objectContaining({
        backgroundColor: "#ffffff",
        scale: 2
      })
    );
    expect(jsPDF).toHaveBeenCalledWith({ orientation: "landscape", unit: "mm", format: "a4" });
    expect(pdfMocks.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,preview",
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

  it("adds pages when the captured preview is taller than one PDF page", async () => {
    const preview = document.createElement("section");
    const canvas = createCanvasMock(1000, 3000);
    vi.mocked(html2canvas).mockResolvedValue(canvas);

    await createPrintPdfFile({ element: preview, filename: "month-schedule.pdf" });

    expect(pdfMocks.addPage).toHaveBeenCalled();
  });

  it("rejects missing print content with a clear error", async () => {
    await expect(
      createPrintPdfFile({ element: undefined as unknown as HTMLElement, filename: "empty.pdf" })
    ).rejects.toThrow("打印内容不可用");
  });
});
