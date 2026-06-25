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

function expectSelectorAbsent(selector: string): void {
  expect(css).not.toMatch(new RegExp(`(^|[,\\s])${escapeSelector(selector)}(?=[\\s,{])`, "m"));
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

describe("main.css layout rules", () => {
  it("styles compact header actions and account dropdown", () => {
    const appTitleRules = ruleBlocks(".app-title")[0] || "";
    const openUserMenuHeaderRules = ruleBlocks(".app-header.user-menu-open");
    const headerActionsRules = ruleBlocks(".app-header-actions")[0] || "";
    const userMenuRules = ruleBlocks(".header-user-menu")[0] || "";
    const userMenuButtonRules = ruleBlocks(".app-header-actions .header-user-menu-button")[0] || "";
    const userDropdownRules = ruleBlocks(".header-user-dropdown")[0] || "";

    expect(appTitleRules).not.toBe("");
    expect(openUserMenuHeaderRules).toHaveLength(0);
    expect(headerActionsRules).toContain("display: flex");
    expect(headerActionsRules).toContain("justify-content: flex-end");
    expect(headerActionsRules).toContain("align-items: center");
    expect(userMenuRules).toContain("position: relative");
    expect(userMenuButtonRules).toContain("max-width:");
    expect(userMenuButtonRules).toContain("overflow: hidden");
    expect(userMenuButtonRules).toContain("text-overflow: ellipsis");
    expect(userDropdownRules).toContain("position: absolute");
    expect(userDropdownRules).toContain("right: 0");
    expect(userDropdownRules).toContain("top: calc(100% + 6px)");
    expect(userDropdownRules).toContain("z-index:");
    expect(ruleBlocks(".week-chip")).toHaveLength(0);
    expect(ruleBlocks(".toolbar")).toHaveLength(0);
    expect(ruleBlocks(".toolbar-group")).toHaveLength(0);
    expect(ruleBlocks(".toolbar-actions")).toHaveLength(0);
    expect(ruleBlocks(".toolbar-week-range")).toHaveLength(0);
    expect(ruleBlocks(".toolbar-user")).toHaveLength(0);
    expect(ruleBlocks(".header-user")).toHaveLength(0);
    expectSelectorAbsent(".week-chip");
    expectSelectorAbsent(".toolbar");
    expectSelectorAbsent(".toolbar-group");
    expectSelectorAbsent(".toolbar-actions");
    expectSelectorAbsent(".toolbar-week-range");
    expectSelectorAbsent(".toolbar-user");
    expectSelectorAbsent(".header-user");
    expectSelectorAbsent(".app-info-panel");
    expectSelectorAbsent(".admin-mode-banner");
  });

  it("styles the help page as compact full-width guidance content", () => {
    const helpPageRules = ruleBlocks(".help-page")[0] || "";
    const helpSectionRules = ruleBlocks(".help-section")[0] || "";
    const helpHeadingRules = ruleBlocks(".help-section h2")[0] || "";
    const helpListRules = ruleBlocks(".help-list")[0] || "";
    const helpRuleListRules = ruleBlocks(".help-rule-list")[0] || "";

    expect(helpPageRules).toContain("display: grid");
    expect(helpPageRules).toContain("gap: 12px");
    expect(helpPageRules).toContain("border: 1px solid #dbe3ef");
    expect(helpPageRules).toContain("background: #ffffff");
    expect(helpSectionRules).toContain("display: grid");
    expect(helpSectionRules).toContain("gap: 8px");
    expect(helpHeadingRules).toContain("font-size: 15px");
    expect(helpHeadingRules).toContain("font-weight: 900");
    expect(helpListRules).toContain("margin: 0");
    expect(helpListRules).toContain("line-height: 1.7");
    expect(helpRuleListRules).toContain("margin: 0");
    expect(helpRuleListRules).toContain("color: #475569");
  });

  it("styles inline management as a workbench panel", () => {
    const panelRules = ruleBlocks(".management-panel")[0] || "";
    const inlineRules = ruleBlocks(".management-inline-panel")[0] || "";
    const headerRules = ruleBlocks(".management-inline-header")[0] || "";

    expect(panelRules).toContain("min-width: 0");
    expect(inlineRules).toContain("border: 1px solid #dbe3ef");
    expect(inlineRules).toContain("background: #ffffff");
    expect(inlineRules).toContain("padding:");
    expect(headerRules).toContain("display: flex");
  });

  it("lets compact header actions wrap naturally on mobile", () => {
    const mobileCss = mediaBlock("(max-width: 768px)");
    const mobileHeaderActions = ruleBlockIn(mobileCss, ".app-header-actions");
    const mobileHeaderUserMenu = ruleBlockIn(mobileCss, ".header-user-menu");

    expect(mobileHeaderActions).toContain("width: 100%");
    expect(mobileHeaderActions).toContain("justify-content: flex-start");
    expect(mobileHeaderUserMenu).toContain("min-width: 0");
    expect(mobileHeaderUserMenu).toContain("max-width: 100%");
  });

  it("lays out the shift palette as grouped wrapping rows", () => {
    const paletteRules = ruleBlocks(".shift-palette");
    const paletteTitle = ruleBlocks(".shift-palette h2")[0] ?? "";
    const paletteBodyRules = ruleBlocks(".shift-palette-body")[0] ?? "";
    const paletteGroupRules = ruleBlocks(".shift-palette-group")[0] ?? "";
    const paletteGroupLabelRules = ruleBlocks(".shift-palette-group-label")[0] ?? "";
    const shiftListRules = ruleBlocks(".shift-list")[0] ?? "";
    const shiftButtonRules = ruleBlocks(".shift-button")[0] ?? "";

    expect(paletteRules[0]).toContain("display: grid");
    expect(paletteRules[0]).toContain("gap: 8px");
    expect(paletteTitle).toContain("white-space: nowrap");
    expect(paletteBodyRules).toContain("display: grid");
    expect(paletteBodyRules).toContain("gap: 8px");
    expect(paletteGroupRules).toContain("display: grid");
    expect(paletteGroupRules).toContain("grid-template-columns: 44px minmax(0, 1fr)");
    expect(paletteGroupRules).toContain("align-items: start");
    expect(paletteGroupLabelRules).toContain("font-weight: 800");
    expect(paletteGroupLabelRules).toContain("white-space: nowrap");
    expect(shiftListRules).toContain("display: flex");
    expect(shiftListRules).toContain("flex-wrap: wrap");
    expect(shiftListRules).not.toContain("overflow-x: auto");
    expect(shiftButtonRules).toContain("min-width: 44px");
    expect(shiftButtonRules).toContain("height: 30px");
    expect(shiftButtonRules).toContain("border: 0");
    expect(shiftButtonRules).toContain("border-bottom: 2px solid currentColor");
    expect(ruleBlocks(".shift-dot")).toHaveLength(0);
  });

  it("lays out the schedule staff search controls without crowding the grid", () => {
    const searchRules = ruleBlocks(".schedule-search")[0] ?? "";
    const inputRules = ruleBlocks(".schedule-search-input")[0] ?? "";
    const countRules = ruleBlocks(".schedule-search-count")[0] ?? "";
    const clearRules = ruleBlocks(".schedule-search-clear")[0] ?? "";
    const emptyRules = ruleBlocks(".schedule-search-empty")[0] ?? "";

    expect(searchRules).toContain("display: flex");
    expect(searchRules).toContain("flex-wrap: wrap");
    expect(searchRules).toContain("align-items: center");
    expect(searchRules).toContain("gap: 8px");
    expect(searchRules).toContain("margin: 0 0 8px");
    expect(inputRules).toContain("flex: 1 1 220px");
    expect(inputRules).toContain("min-height: 34px");
    expect(countRules).toContain("white-space: nowrap");
    expect(clearRules).toContain("min-height: 34px");
    expect(emptyRules).toContain("text-align: center");
  });

  it("lays out compact schedule operation row controls", () => {
    const operationRowRules = ruleBlocks(".schedule-operation-row")[0] ?? "";
    const weekControlsRules = ruleBlocks(".schedule-week-controls")[0] ?? "";
    const weekFieldsRules = ruleBlocks(".schedule-week-fields")[0] ?? "";
    const weekNumberRules = ruleBlocks(".schedule-week-number")[0] ?? "";
    const weekRangeRules = ruleBlocks(".schedule-week-range")[0] ?? "";
    const rowSearchRules = ruleBlockIn(css, ".schedule-operation-row .schedule-search");
    const rowSearchInputRules = ruleBlockIn(css, ".schedule-operation-row .schedule-search-input");
    const rowActionsRules = ruleBlockIn(css, ".schedule-operation-row .schedule-actions");

    expect(operationRowRules).toContain("display: flex");
    expect(operationRowRules).toContain("flex-wrap: wrap");
    expect(operationRowRules).toContain("align-items: center");
    expect(operationRowRules).toContain("gap: 8px");
    expect(operationRowRules).toContain("position: relative");
    expect(operationRowRules).toContain("padding: 8px");
    expect(operationRowRules).toContain("border: 1px solid #dbeafe");
    expect(operationRowRules).toContain("background: #f8fbff");
    expect(operationRowRules).toContain("margin: 0 0 8px");
    expect(weekControlsRules).toContain("display: flex");
    expect(weekControlsRules).toContain("flex-wrap: wrap");
    expect(weekControlsRules).toContain("align-items: center");
    expect(weekControlsRules).toContain("gap: 8px");
    expect(weekControlsRules).toContain("flex: 0 1 auto");
    expect(weekFieldsRules).toContain("display: flex");
    expect(weekFieldsRules).toContain("flex-wrap: wrap");
    expect(weekFieldsRules).toContain("align-items: center");
    expect(weekFieldsRules).toContain("gap: 8px");
    expect(weekNumberRules).toContain("background: #ecfdf5");
    expect(weekNumberRules).toContain("color: #15803d");
    expect(weekNumberRules).toContain("font-weight: 900");
    expect(weekNumberRules).toContain("white-space: nowrap");
    expect(weekRangeRules).toContain("white-space: nowrap");
    expect(weekRangeRules).toContain("color: #475569");
    expect(weekRangeRules).toContain("font-size: 13px");
    expect(rowSearchRules).toContain("display: flex");
    expect(rowSearchRules).toContain("flex: 0 1 auto");
    expect(rowSearchRules).toContain("margin: 0");
    expect(rowSearchRules).toContain("padding: 0");
    expect(rowSearchRules).toContain("border: 0");
    expect(rowSearchRules).toContain("background: transparent");
    expect(rowSearchInputRules).toContain("flex: 0 0 280px");
    expect(rowSearchInputRules).toContain("width: 280px");
    expect(rowSearchInputRules).toContain("max-width: 100%");
    expect(rowActionsRules).toContain("margin-left: auto");
    expect(rowActionsRules).toContain("margin-bottom: 0");
    expect(rowActionsRules).toContain("justify-content: flex-end");
  });

  it("stacks the schedule staff search controls on mobile", () => {
    const mobileCss = mediaBlock("(max-width: 768px)");
    const mobileSearch = ruleBlockIn(mobileCss, ".schedule-search");
    const mobileInput = ruleBlockIn(mobileCss, ".schedule-search-input");
    const mobileClear = ruleBlockIn(mobileCss, ".schedule-search-clear");
    const mobileOperationRow = ruleBlockIn(mobileCss, ".schedule-operation-row");
    const mobileWeekControls = ruleBlockIn(mobileCss, ".schedule-week-controls");
    const mobileWeekFields = ruleBlockIn(mobileCss, ".schedule-week-fields");
    const mobileWeekRange = ruleBlockIn(mobileCss, ".schedule-week-range");
    const mobileRowSearch = ruleBlockIn(mobileCss, ".schedule-operation-row .schedule-search");
    const mobileRowSearchInput = ruleBlockIn(mobileCss, ".schedule-operation-row .schedule-search-input");
    const mobileActions = ruleBlockIn(mobileCss, ".schedule-actions");

    expect(mobileSearch).toContain("display: grid");
    expect(mobileSearch).toContain("grid-template-columns: 1fr");
    expect(mobileInput).toContain("width: 100%");
    expect(mobileInput).toContain("min-width: 0");
    expect(mobileClear).toContain("width: 100%");
    expect(mobileOperationRow).toContain("align-items: stretch");
    expect(mobileOperationRow).toContain("flex-direction: column");
    expect(mobileWeekControls).toContain("width: 100%");
    expect(mobileWeekFields).toContain("flex-wrap: wrap");
    expect(mobileWeekRange).toContain("white-space: normal");
    expect(mobileRowSearch).toContain("display: grid");
    expect(mobileRowSearch).toContain("grid-template-columns: 1fr");
    expect(mobileRowSearch).toContain("width: 100%");
    expect(mobileRowSearchInput).toContain("width: 100%");
    expect(mobileRowSearchInput).toContain("flex: 1 1 auto");
    expect(mobileActions).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("hides compact app controls for print", () => {
    const printMedia = mediaBlock("print");
    const hiddenControls = ruleBlockIn(
      printMedia,
      ".app-header,\n  .app-header-actions,\n  .state-message,\n  .schedule-operation-row,\n  .workbench,\n  .el-overlay,\n  .el-drawer"
    );

    expect(hiddenControls).toContain("display: none !important");
    expect(printMedia).not.toContain(".header-user");
    expect(printMedia).not.toContain(".toolbar");
  });

  it("styles the schedule query controls and week blocks", () => {
    const panelRules = ruleBlocks(".schedule-query-panel")[0] ?? "";
    const controlsRules = ruleBlocks(".schedule-query-controls")[0] ?? "";
    const fieldRules = ruleBlockIn(css, ".schedule-query-date-field,\n.schedule-query-staff-field");
    const dateFieldRules = ruleBlocks(".schedule-query-date-field").find((rules) => rules.includes("flex:")) ?? "";
    const staffFieldRules = ruleBlocks(".schedule-query-staff-field").find((rules) => rules.includes("flex:")) ?? "";
    const metaRules = ruleBlocks(".schedule-query-meta")[0] ?? "";
    const warningRules = ruleBlocks(".schedule-query-warning")[0] ?? "";
    const resultsRules = ruleBlocks(".schedule-query-results")[0] ?? "";
    const weekRules = ruleBlocks(".schedule-query-week")[0] ?? "";
    const titleRules = ruleBlocks(".schedule-query-week-title")[0] ?? "";
    const gridWrapRules = ruleBlocks(".schedule-query-grid-wrap")[0] ?? "";
    const gridRules = ruleBlocks(".schedule-query-grid")[0] ?? "";
    const gridCellRules = ruleBlocks(".schedule-query-grid td")[0] ?? "";

    expect(panelRules).toContain("display: grid");
    expect(panelRules).toContain("gap: 12px");
    expect(controlsRules).toContain("align-items: end");
    expect(fieldRules).toContain("display: grid");
    expect(fieldRules).toContain("gap: 4px");
    expect(dateFieldRules).toContain("flex: 0 1 170px");
    expect(staffFieldRules).toContain("flex: 1 1 220px");
    expect(metaRules).toContain("color: #334155");
    expect(metaRules).toContain("font-size: 13px");
    expect(metaRules).toContain("font-weight: 800");
    expect(metaRules).toContain("white-space: nowrap");
    expect(warningRules).toContain("margin: 0");
    expect(warningRules).toContain("border: 1px solid #fde68a");
    expect(warningRules).toContain("background: #fffbeb");
    expect(warningRules).toContain("padding: 10px 12px");
    expect(warningRules).toContain("color: #92400e");
    expect(warningRules).toContain("font-weight: 800");
    expect(resultsRules).toContain("display: grid");
    expect(resultsRules).toContain("gap: 12px");
    expect(weekRules).toContain("border: 1px solid #dbe3ef");
    expect(weekRules).toContain("background: #ffffff");
    expect(titleRules).toContain("margin: 0");
    expect(titleRules).toContain("border-bottom: 1px solid #dbe3ef");
    expect(titleRules).toContain("background: #f8fafc");
    expect(titleRules).toContain("padding: 10px 12px");
    expect(titleRules).toContain("color: #1e3a8a");
    expect(titleRules).toContain("font-size: 15px");
    expect(titleRules).toContain("font-weight: 900");
    expect(gridWrapRules).toContain("border: 0");
    expect(gridRules).toContain("margin: 0");
    expect(gridCellRules).toContain("cursor: default");
  });

  it("stacks schedule query controls on mobile", () => {
    const mobileCss = mediaBlock("(max-width: 768px)");
    const mobileControls = ruleBlockIn(mobileCss, ".schedule-query-controls");
    const mobileField = ruleBlockIn(mobileCss, ".schedule-query-date-field,\n  .schedule-query-staff-field");
    const mobileMeta = ruleBlockIn(mobileCss, ".schedule-query-meta");

    expect(mobileControls).toContain("display: grid");
    expect(mobileControls).toContain("grid-template-columns: 1fr");
    expect(mobileField).toContain("width: 100%");
    expect(mobileMeta).toContain("white-space: normal");
  });

  it("keeps sort id, staff and type columns fixed above scrolling day headers", () => {
    const stickyColumn = ruleBlocks(".sticky-col")[0] ?? "";
    const stickyHeader = ruleBlocks(".schedule-grid thead .sticky-col")[0] ?? "";
    const sortColumnRules = ruleBlocks(".schedule-grid .sort-col");
    const personColumnRules = ruleBlocks(".schedule-grid .person-col");
    const typeColumnRules = ruleBlocks(".schedule-grid .type-col");

    expect(stickyColumn).toContain("position: sticky");
    expect(stickyColumn).toContain("left: 0");
    expect(stickyHeader).toContain("z-index: 6");

    expect(sortColumnRules).toHaveLength(2);
    expect(sortColumnRules[0]).toContain("width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("min-width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("max-width: var(--sort-col-width, 54px)");
    expect(sortColumnRules[0]).toContain("left: 0");
    expect(sortColumnRules[1]).toContain("width: var(--sort-col-mobile-width, 42px)");
    expect(sortColumnRules[1]).toContain("min-width: var(--sort-col-mobile-width, 42px)");
    expect(sortColumnRules[1]).toContain("max-width: var(--sort-col-mobile-width, 42px)");

    expect(personColumnRules).toHaveLength(2);
    expect(personColumnRules[0]).toContain("width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("min-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("max-width: var(--person-col-width, 88px)");
    expect(personColumnRules[0]).toContain("left: var(--person-col-left, 54px)");
    expect(personColumnRules[0]).toContain("text-align: left");
    expect(personColumnRules[0]).toContain("padding: 0 6px");
    expect(personColumnRules[1]).toContain("width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("min-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("max-width: var(--person-col-mobile-width, 72px)");
    expect(personColumnRules[1]).toContain("left: var(--person-col-mobile-left, 42px)");
    expect(personColumnRules[1]).toContain("padding: 0 5px");

    expect(typeColumnRules).toHaveLength(2);
    expect(typeColumnRules[0]).toContain("width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("min-width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("max-width: var(--type-col-width, 58px)");
    expect(typeColumnRules[0]).toContain("left: var(--type-col-left, 142px)");
    expect(typeColumnRules[1]).toContain("width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("min-width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("max-width: var(--type-col-mobile-width, 46px)");
    expect(typeColumnRules[1]).toContain("left: var(--type-col-mobile-left, 114px)");
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
  it("styles in-page print panels with readable controls", () => {
    const panelRules = ruleBlocks(".print-panel")[0] || "";
    const headerRules = ruleBlocks(".print-panel-header")[0] || "";
    const actionRules = ruleBlocks(".print-panel-actions")[0] || "";

    expect(panelRules).toContain("display: grid");
    expect(panelRules).toContain("border: 1px solid #dbe3ef");
    expect(panelRules).toContain("background: #ffffff");
    expect(headerRules).toContain("display: flex");
    expect(headerRules).toContain("justify-content: space-between");
    expect(actionRules).toContain("display: flex");
    expect(actionRules).toContain("flex-wrap: wrap");
  });

  it("keeps the month detail table on a scrollable print canvas instead of squeezing it on mobile", () => {
    const monthTable = ruleBlocks(".print-preview-content .print-month .print-month-detail-table")[0] ?? "";
    const monthCells =
      ruleBlocks(
        ".print-preview-content .print-month .print-month-detail-table th,\n.print-preview-content .print-month .print-month-detail-table td"
      )[0] ?? "";

    expect(monthTable).toContain("width: max-content");
    expect(monthTable).toContain("min-width: 1120px");
    expect(monthTable).toContain("table-layout: fixed");
    expect(monthCells).toContain("padding: 4px 2px");
  });

  it("keeps legacy month detail width fallbacks before class width rules", () => {
    const previewPersonFallbackSelector =
      ".print-preview-content .print-month .print-month-detail-table :where(th:first-child, td:first-child)";
    const previewDayFallbackSelector =
      ".print-preview-content .print-month .print-month-detail-table :where(th:not(:first-child), td:not(:first-child))";
    const previewSortSelector = ".print-preview-content .print-month .print-month-detail-table .print-sort-col";
    const printMedia = mediaBlock("print");
    const printPersonFallbackSelector = ".print-month-detail-table :where(th:first-child, td:first-child)";
    const printSortSelector = ".print-month-detail-table .print-sort-col,\n  .print-week-detail-table .print-sort-col";

    const previewPersonFallback = ruleBlockIn(css, previewPersonFallbackSelector);
    const previewDayFallback = ruleBlockIn(css, previewDayFallbackSelector);
    const previewSortColumn = ruleBlockIn(css, previewSortSelector);
    const printPersonFallback = ruleBlockIn(printMedia, printPersonFallbackSelector);
    const printSortColumn = ruleBlockIn(printMedia, printSortSelector);

    expect(previewPersonFallbackSelector).toContain(":where(");
    expect(previewDayFallbackSelector).toContain(":where(");
    expect(printPersonFallbackSelector).toContain(":where(");
    expect(previewPersonFallback).toContain("width: 86px");
    expect(previewPersonFallback).toContain("min-width: 86px");
    expect(previewPersonFallback).toContain("max-width: 86px");
    expect(previewDayFallback).toContain("width: 34px");
    expect(previewDayFallback).toContain("min-width: 34px");
    expect(previewDayFallback).toContain("max-width: 34px");
    expect(previewSortColumn).toContain("width: 42px");
    expect(css.indexOf(previewPersonFallbackSelector)).toBeLessThan(css.indexOf(previewSortSelector));
    expect(css.indexOf(previewDayFallbackSelector)).toBeLessThan(css.indexOf(previewSortSelector));

    expect(printPersonFallback).toContain("width: 68px");
    expect(printSortColumn).toContain("width: 34px");
    expect(printMedia.indexOf(printPersonFallbackSelector)).toBeLessThan(printMedia.indexOf(printSortSelector));
  });

  it("sets explicit preview widths for month detail sort, person, type and day columns", () => {
    const sortColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-sort-col");
    const personColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-person-col");
    const typeColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-type-col");
    const dayColumn = ruleBlockIn(css, ".print-preview-content .print-month .print-month-detail-table .print-day-col");

    expect(sortColumn).toContain("width: 42px");
    expect(sortColumn).toContain("min-width: 42px");
    expect(sortColumn).toContain("max-width: 42px");
    expect(personColumn).toContain("width: 86px");
    expect(typeColumn).toContain("width: 52px");
    expect(dayColumn).toContain("width: 34px");
  });

  it("sets print widths for month and week detail identity columns", () => {
    const printMedia = mediaBlock("print");

    expect(ruleBlockIn(printMedia, ".print-month-detail-table .print-sort-col,\n  .print-week-detail-table .print-sort-col")).toContain("width: 34px");
    expect(ruleBlockIn(printMedia, ".print-month-detail-table .print-person-col,\n  .print-week-detail-table .print-person-col")).toContain("width: 68px");
    expect(ruleBlockIn(printMedia, ".print-month-detail-table .print-type-col,\n  .print-week-detail-table .print-type-col")).toContain("width: 42px");
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
