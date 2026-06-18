import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/main.css", "utf8");

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBlocks(selector: string): string[] {
  return ruleBlocksIn(css, selector);
}

function ruleBlocksIn(source: string, selector: string): string[] {
  const pattern = new RegExp(`${escapeSelector(selector)}\\s*\\{([^}]+)\\}`, "g");
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function ruleBlockIn(source: string, selector: string): string {
  return ruleBlocksIn(source, selector)[0] ?? "";
}

function mediaBlock(query: string): string {
  const marker = `@media ${query}`;
  const markerIndex = css.indexOf(marker);
  const openBraceIndex = css.indexOf("{", markerIndex);

  if (markerIndex === -1 || openBraceIndex === -1) {
    return "";
  }

  let depth = 0;

  for (let index = openBraceIndex; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return css.slice(openBraceIndex + 1, index);
      }
    }
  }

  return "";
}

describe("main.css schedule grid sticky column rules", () => {
  it("keeps the shift palette compact in one horizontal toolbar", () => {
    const paletteRules = ruleBlocks(".shift-palette");
    const paletteTitle = ruleBlocks(".shift-palette h2")[0] ?? "";
    const shiftListRules = ruleBlocks(".shift-list")[0] ?? "";
    const shiftButtonRules = ruleBlocks(".shift-button")[0] ?? "";

    expect(paletteRules[0]).toContain("display: flex");
    expect(paletteRules[0]).toContain("align-items: center");
    expect(paletteRules[0]).toContain("gap: 8px");
    expect(paletteTitle).toContain("white-space: nowrap");
    expect(shiftListRules).toContain("display: flex");
    expect(shiftListRules).toContain("overflow-x: auto");
    expect(shiftButtonRules).toContain("min-width: 44px");
    expect(shiftButtonRules).toContain("height: 30px");
    expect(shiftButtonRules).toContain("border: 0");
    expect(shiftButtonRules).toContain("border-bottom: 2px solid currentColor");
    expect(ruleBlocks(".shift-dot")).toHaveLength(0);
  });

  it("keeps the staff column fixed and layered above scrolling day headers", () => {
    const stickyColumn = ruleBlocks(".sticky-col")[0] ?? "";
    const stickyHeader = ruleBlocks(".schedule-grid thead .sticky-col")[0] ?? "";
    const personColumnRules = ruleBlocks(".schedule-grid .person-col");

    expect(stickyColumn).toContain("position: sticky");
    expect(stickyColumn).toContain("left: 0");
    expect(stickyHeader).toContain("z-index: 6");
    expect(personColumnRules).toHaveLength(2);
    expect(personColumnRules[0]).toContain("width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("min-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("max-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("text-align: left");
    expect(personColumnRules[0]).toContain("padding: 0 6px");
    expect(personColumnRules[1]).toContain("width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("min-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("max-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("padding: 0 5px");
  });

  it("renders live shift marks as centered text without chip boxes", () => {
    const shiftChipRules = ruleBlocks(".shift-chip");

    expect(shiftChipRules).toHaveLength(2);
    expect(shiftChipRules[0]).toContain("display: inline-flex");
    expect(shiftChipRules[0]).toContain("justify-content: center");
    expect(shiftChipRules[0]).toContain("border: 0");
    expect(shiftChipRules[0]).toContain("padding: 0");
    expect(shiftChipRules[0]).toContain("font-size: 15px");
    expect(shiftChipRules[0]).toContain("font-weight: 800");
    expect(shiftChipRules[0]).toContain("line-height: 1.2");
    expect(shiftChipRules[0]).toContain("background: transparent");
    expect(shiftChipRules[1]).toContain("font-size: 14px");
  });
});

describe("main.css print month layout rules", () => {
  it("keeps the month PDF table within the print capture width", () => {
    const monthTable = ruleBlocks(".print-preview-content .print-month .print-table")[0] ?? "";
    const monthCells =
      ruleBlocks(
        ".print-preview-content .print-month .print-table th,\n.print-preview-content .print-month .print-table td"
      )[0] ?? "";

    expect(monthTable).toContain("width: 100%");
    expect(monthTable).toContain("min-width: 100%");
    expect(monthTable).toContain("table-layout: fixed");
    expect(monthCells).toContain("padding: 4px 2px");
  });

  it("renders preview and print shift marks without chip boxes", () => {
    const previewShiftChip = ruleBlockIn(css, ".print-preview-content .print-shift-chip");
    const printShiftChip = ruleBlockIn(mediaBlock("print"), ".print-shift-chip");

    expect(previewShiftChip).toContain("min-width: 0;");
    expect(previewShiftChip).toContain("min-height: 0;");
    expect(previewShiftChip).toContain("border: 0;");
    expect(previewShiftChip).toContain("background: transparent;");
    expect(previewShiftChip).not.toContain("border: 1px solid");
    expect(previewShiftChip).not.toContain("background: #ffffff");

    expect(printShiftChip).toContain("min-width: 0;");
    expect(printShiftChip).toContain("min-height: 0;");
    expect(printShiftChip).toContain("border: 0;");
    expect(printShiftChip).toContain("background: transparent;");
    expect(printShiftChip).toContain("print-color-adjust: exact;");
    expect(printShiftChip).toContain("-webkit-print-color-adjust: exact;");
    expect(printShiftChip).not.toContain("border: 1px solid");
    expect(printShiftChip).not.toContain("background: #ffffff");
  });

  it("clips long print person labels inside narrow cells", () => {
    const printMedia = mediaBlock("print");
    const previewName = ruleBlockIn(css, ".print-preview-content .print-person strong");
    const previewMeta = ruleBlockIn(css, ".print-preview-content .print-person small");
    const printName = ruleBlockIn(printMedia, ".print-person strong");
    const printMeta = ruleBlockIn(printMedia, ".print-person small");
    const overflowGuards = [
      "display: block;",
      "max-width: 100%;",
      "overflow: hidden;",
      "text-overflow: ellipsis;",
      "white-space: nowrap;",
    ];

    for (const rule of [previewName, previewMeta, printName, printMeta]) {
      for (const guard of overflowGuards) {
        expect(rule).toContain(guard);
      }
    }
  });
});
