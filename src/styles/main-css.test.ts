import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/main.css", "utf8");

function escapeSelector(selector: string): string {
  return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ruleBlocks(selector: string): string[] {
  const pattern = new RegExp(`${escapeSelector(selector)}\\s*\\{([^}]+)\\}`, "g");
  return [...css.matchAll(pattern)].map((match) => match[1]);
}

describe("main.css schedule grid sticky column rules", () => {
  it("keeps the staff column fixed and layered above scrolling day headers", () => {
    const stickyColumn = ruleBlocks(".sticky-col")[0] ?? "";
    const stickyHeader = ruleBlocks(".schedule-grid thead .sticky-col")[0] ?? "";
    const personColumnRules = ruleBlocks(".schedule-grid .person-col");

    expect(stickyColumn).toContain("position: sticky");
    expect(stickyColumn).toContain("left: 0");
    expect(stickyHeader).toContain("z-index: 6");
    expect(personColumnRules).toHaveLength(2);
    expect(personColumnRules[0]).toContain("width: 112px");
    expect(personColumnRules[0]).toContain("min-width: 112px");
    expect(personColumnRules[0]).toContain("max-width: 112px");
    expect(personColumnRules[0]).toContain("text-align: left");
    expect(personColumnRules[0]).toContain("padding: 0 6px");
    expect(personColumnRules[1]).toContain("width: 88px");
    expect(personColumnRules[1]).toContain("min-width: 88px");
    expect(personColumnRules[1]).toContain("max-width: 88px");
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
});
