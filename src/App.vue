<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import BonusSettlementPanel from "@/components/BonusSettlementPanel.vue";
import CellEditorDialog from "@/components/CellEditorDialog.vue";
import LoginPage from "@/components/LoginPage.vue";
import ManagementDrawer from "@/components/ManagementDrawer.vue";
import PasswordChangeDialog from "@/components/PasswordChangeDialog.vue";
import PrintViews from "@/components/PrintViews.vue";
import ScheduleGrid from "@/components/ScheduleGrid.vue";
import ScheduleQueryResults from "@/components/ScheduleQueryResults.vue";
import ShiftPalette from "@/components/ShiftPalette.vue";
import WeeklySummary from "@/components/WeeklySummary.vue";
import {
  bulkUpdateWeekSchedule,
  changePassword,
  copyPreviousWeekSchedule,
  deleteUser,
  deleteStaff,
  deleteHoliday,
  deleteMonthlySettlement,
  getCurrentUser,
  listAuditLogs,
  listUsers,
  loadData,
  login,
  logout,
  saveHoliday,
  saveMonthlySettlement,
  saveScheduleEntry,
  saveShift,
  saveStaff,
  saveUser
} from "@/api/client";
import type {
  AuditLogEntry,
  AuditLogQuery,
  AuthUser,
  BulkWeekSchedulePayload,
  CopyPreviousWeekMode,
  ManagedAuthUser,
  PasswordChangeInput,
  PublicAppData,
  SaveAuthUserInput
} from "@/api/client";
import type { Holiday, MonthlySettlement, Shift, StaffMember } from "@/types/domain";
import { calculateMonthlySummary, calculateWeeklySummary } from "@/lib/calculation";
import { getMonthDays, getWeekDays, getWeekRange, parseDateKey, toDateKey } from "@/lib/date";
import { createPrintPdfFile } from "@/lib/print-pdf";
import { calculateRangeBonusSummary, monthRangeToDates } from "@/lib/range-bonus";
import { validateScheduleQueryRange } from "@/lib/schedule-query";
import { calculateSettlementChecks } from "@/lib/settlement-checks";

type PrintMode = "month" | "week";
type WorkbenchTab = "schedule" | "query" | "weekly" | "bonus";

const today = toDateKey(new Date());
const data = ref<PublicAppData | null>(null);
const error = ref("");
const currentUser = ref<AuthUser | null>(null);
const users = ref<ManagedAuthUser[]>([]);
const auditLogs = ref<AuditLogEntry[]>([]);
const authChecking = ref(true);
const loginSubmitting = ref(false);
const loginError = ref("");
const selectedDate = ref(today);
const managementOpen = ref(false);
const selectedShiftId = ref("");
const scheduleStaffQuery = ref("");
const scheduleQueryStartDate = ref(getWeekRange(today).start);
const scheduleQueryEndDate = ref(getWeekRange(today).end);
const scheduleQueryStaffQuery = ref("");
const scheduleQueryRangeDirty = ref(false);
const editorOpen = ref(false);
const editingStaffId = ref("");
const editingDate = ref("");
const staffSaveVersion = ref(0);
const shiftSaveVersion = ref(0);
const holidaySaveVersion = ref(0);
const staffSaving = ref(false);
const shiftSaving = ref(false);
const holidaySaving = ref(false);
const userSaving = ref(false);
const auditLoading = ref(false);
const settlementSaving = ref(false);
const settlementCanceling = ref(false);
const printPreviewMode = ref<PrintMode | null>(null);
const printPreviewContentRef = ref<HTMLElement | null>(null);
const pdfGenerating = ref(false);
const pdfDownloadUrl = ref("");
const pdfDownloadName = ref("");
const printPdfStatus = ref("");
const activeWorkbenchTab = ref<WorkbenchTab>("schedule");
const passwordDialogOpen = ref(false);
const passwordChanging = ref(false);
const passwordChangeError = ref("");
const copyingPreviousWeek = ref(false);
const bulkUpdatingWeek = ref(false);

const workbenchTabs: Array<{ key: WorkbenchTab; label: string }> = [
  { key: "schedule", label: "排班" },
  { key: "query", label: "查询" },
  { key: "weekly", label: "周统计" },
  { key: "bonus", label: "月结与奖金" }
];

const selectedWeek = computed(() => getWeekRange(selectedDate.value));
const selectedMonth = computed(() => selectedDate.value.slice(0, 7));
const bonusStartMonth = ref(selectedMonth.value);
const bonusEndMonth = ref(selectedMonth.value);
const scheduleDays = computed(() => getWeekDays(selectedDate.value));
const printMonthDays = computed(() => {
  const date = parseDateKey(selectedDate.value);
  return getMonthDays(date.getFullYear(), date.getMonth() + 1);
});
const bonusMonthDays = computed(() => {
  if (!monthRangeToDates(bonusStartMonth.value, bonusStartMonth.value)) {
    return [];
  }

  const [year, monthNumber] = bonusStartMonth.value.split("-").map(Number);
  return getMonthDays(year, monthNumber);
});
const weeklySummary = computed(() => (data.value ? calculateWeeklySummary(data.value, selectedDate.value) : null));
const monthlySummary = computed(() => (data.value ? calculateMonthlySummary(data.value, printMonthDays.value) : null));
const bonusMonthlySummary = computed(() => (data.value ? calculateMonthlySummary(data.value, bonusMonthDays.value) : null));
const bonusRangeSummary = computed(() => {
  if (!data.value) {
    return null;
  }

  return calculateRangeBonusSummary(data.value, bonusStartMonth.value, bonusEndMonth.value);
});
const isBonusRangeMode = computed(
  () => bonusStartMonth.value !== bonusEndMonth.value || bonusRangeSummary.value?.isValidRange === false
);
const isBonusRangeValid = computed(() => !isBonusRangeMode.value || bonusRangeSummary.value?.isValidRange !== false);
const displayedBonusSummary = computed(() => (isBonusRangeMode.value ? bonusRangeSummary.value : bonusMonthlySummary.value));
const currentMonthlySettlement = computed<MonthlySettlement | null>(() => {
  return data.value?.monthlySettlements.find((settlement) => settlement.month === selectedMonth.value) ?? null;
});
const currentBonusMonthlySettlement = computed<MonthlySettlement | null>(() => {
  return data.value?.monthlySettlements.find((settlement) => settlement.month === bonusStartMonth.value) ?? null;
});
const editingStaff = computed(() => data.value?.staff.find((staff) => staff.id === editingStaffId.value) ?? null);
const editingEntry = computed(
  () =>
    data.value?.scheduleEntries.find((entry) => entry.staffId === editingStaffId.value && entry.date === editingDate.value) ??
    null
);
const currentWeekScheduleDateKeys = computed(() => new Set(scheduleDays.value.map((day) => day.key)));
const scheduleStaffWithVisibleEntries = computed(() => {
  if (!data.value) {
    return new Set<string>();
  }

  return new Set(
    data.value.scheduleEntries
      .filter((entry) => currentWeekScheduleDateKeys.value.has(entry.date))
      .map((entry) => entry.staffId)
  );
});
const scheduleVisibleStaff = computed<StaffMember[]>(() => {
  if (!data.value) {
    return [];
  }

  return data.value.staff.filter((staff) => staff.enabled || scheduleStaffWithVisibleEntries.value.has(staff.id));
});
const normalizedScheduleStaffQuery = computed(() => scheduleStaffQuery.value.trim().toLowerCase());
const filteredScheduleStaff = computed<StaffMember[]>(() => {
  const query = normalizedScheduleStaffQuery.value;

  if (!query) {
    return scheduleVisibleStaff.value;
  }

  return scheduleVisibleStaff.value.filter(
    (staff) => staff.name.toLowerCase().includes(query) || staff.jobId.toLowerCase().includes(query)
  );
});
const hasScheduleStaffSearch = computed(() => normalizedScheduleStaffQuery.value.length > 0);
const hasScheduleStaffSearchResults = computed(() => filteredScheduleStaff.value.length > 0);
const scheduleQueryRange = computed(() =>
  validateScheduleQueryRange(scheduleQueryStartDate.value, scheduleQueryEndDate.value)
);
const scheduleQueryDays = computed(() => scheduleQueryRange.value.days);
const scheduleQueryWeekGroups = computed(() => scheduleQueryRange.value.weekGroups);
const scheduleQueryDateKeys = computed(() => new Set(scheduleQueryDays.value.map((day) => day.key)));
const scheduleQueryStaffWithEntries = computed(() => {
  if (!data.value || !scheduleQueryRange.value.ok) {
    return new Set<string>();
  }

  return new Set(
    data.value.scheduleEntries
      .filter((entry) => scheduleQueryDateKeys.value.has(entry.date))
      .map((entry) => entry.staffId)
  );
});
const scheduleQueryVisibleStaff = computed<StaffMember[]>(() => {
  if (!data.value || !scheduleQueryRange.value.ok) {
    return [];
  }

  return data.value.staff.filter((staff) => staff.enabled || scheduleQueryStaffWithEntries.value.has(staff.id));
});
const normalizedScheduleQueryStaffQuery = computed(() => scheduleQueryStaffQuery.value.trim().toLowerCase());
const filteredScheduleQueryStaff = computed<StaffMember[]>(() => {
  const query = normalizedScheduleQueryStaffQuery.value;

  if (!query) {
    return scheduleQueryVisibleStaff.value;
  }

  return scheduleQueryVisibleStaff.value.filter(
    (staff) => staff.name.toLowerCase().includes(query) || staff.jobId.toLowerCase().includes(query)
  );
});
const hasScheduleQueryStaffSearch = computed(() => normalizedScheduleQueryStaffQuery.value.length > 0);
const scheduleQueryEntries = computed(() => {
  if (!data.value || !scheduleQueryRange.value.ok) {
    return [];
  }

  const visibleStaffIds = new Set(filteredScheduleQueryStaff.value.map((staff) => staff.id));
  return data.value.scheduleEntries.filter(
    (entry) => scheduleQueryDateKeys.value.has(entry.date) && visibleStaffIds.has(entry.staffId)
  );
});
const hasScheduleQueryResults = computed(() => scheduleQueryRange.value.ok && filteredScheduleQueryStaff.value.length > 0);
const scheduleQuerySummary = computed(
  () =>
    `已显示 ${filteredScheduleQueryStaff.value.length} / ${scheduleQueryVisibleStaff.value.length} 人；日期 ${scheduleQueryDays.value.length} 天；共 ${scheduleQueryWeekGroups.value.length} 周`
);
const scheduleQueryWarning = computed(() =>
  scheduleQueryRange.value.ok && scheduleQueryRange.value.isLongRange
    ? "当前查询范围较长，结果较多，加载和滚动可能变慢。"
    : ""
);
const scheduleQueryError = computed(() => (scheduleQueryRange.value.ok ? "" : scheduleQueryRange.value.message));
const shiftCoefficientDescriptions = computed(() =>
  (data.value?.shifts ?? [])
    .filter((shift) => shift.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((shift) => `${shift.name} ${shift.countsAttendance ? shift.coefficient.toFixed(2) : "不计出勤"}`)
    .join("；")
);
const managedStaffIdSet = computed(() => new Set(currentUser.value?.managedStaffIds ?? []));
const editableStaffIds = computed(() => {
  if (!data.value || !currentUser.value) {
    return [];
  }

  if (currentUser.value.role === "admin") {
    return data.value.staff.filter((staff) => staff.enabled).map((staff) => staff.id);
  }

  if (currentUser.value.role === "scheduler") {
    return data.value.staff
      .filter((staff) => staff.enabled && managedStaffIdSet.value.has(staff.id))
      .map((staff) => staff.id);
  }

  return [];
});
const canEditSchedule = computed(() => editableStaffIds.value.length > 0);
const currentWeekEditableEntryCount = computed(() => {
  if (!data.value) {
    return 0;
  }

  const weekDayKeys = new Set(scheduleDays.value.map((day) => day.key));
  const editableIds = new Set(editableStaffIds.value);
  return data.value.scheduleEntries.filter((entry) => weekDayKeys.has(entry.date) && editableIds.has(entry.staffId)).length;
});
const restShift = computed(() => findEnabledShift(["休"], ["休息"]));
const officeShift = computed(() => findEnabledShift(["办公"], ["办公"]));
const scheduleActionBusy = computed(() => copyingPreviousWeek.value || bulkUpdatingWeek.value);
const canOperateCurrentSettlement = computed(() => {
  if (!currentUser.value || isBonusRangeMode.value) {
    return false;
  }

  if (currentUser.value.role === "admin") {
    return true;
  }

  if (currentUser.value.role !== "scheduler") {
    return false;
  }

  const rows = currentBonusMonthlySettlement.value?.rows ?? displayedBonusSummary.value?.rows;

  return rows ? rows.every((row) => managedStaffIdSet.value.has(row.staffId)) : false;
});
const canManageConfig = computed(() => currentUser.value?.role === "admin");
const printPreviewOpen = computed({
  get: () => printPreviewMode.value !== null,
  set: (isOpen: boolean) => {
    if (!isOpen) {
      closePrintPreview();
    }
  }
});
const printPreviewTitle = computed(() => {
  if (printPreviewMode.value === "week") {
    return "周表打印预览";
  }

  if (printPreviewMode.value === "month") {
    return "月表打印预览";
  }

  return "打印预览";
});
const isSystemPrintSupported = computed(() => typeof window !== "undefined" && typeof window.print === "function");

watch(selectedMonth, (nextMonth, previousMonth) => {
  if (nextMonth === previousMonth) {
    return;
  }

  bonusStartMonth.value = nextMonth;
  bonusEndMonth.value = nextMonth;
});

watch(selectedWeek, (nextWeek) => {
  if (scheduleQueryRangeDirty.value) {
    return;
  }

  scheduleQueryStartDate.value = nextWeek.start;
  scheduleQueryEndDate.value = nextWeek.end;
});

async function refreshData(): Promise<void> {
  data.value = await loadData();
}

async function refreshUsers(): Promise<void> {
  users.value = (await listUsers()).rows;
}

async function refreshAuditLogs(query: AuditLogQuery = { limit: 100 }): Promise<void> {
  auditLoading.value = true;
  try {
    auditLogs.value = (await listAuditLogs(query)).rows;
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "审计日志加载失败");
  } finally {
    auditLoading.value = false;
  }
}

async function refreshLatestAuditLogs(): Promise<void> {
  await refreshAuditLogs({ limit: 100 });
}

async function refreshLatestAuditLogsIfManaging(): Promise<void> {
  if (!managementOpen.value || !canManageConfig.value) {
    return;
  }

  await refreshLatestAuditLogs();
}

async function refreshManagementData(): Promise<void> {
  if (!canManageConfig.value) {
    return;
  }

  auditLoading.value = true;
  try {
    const [usersResponse, auditResponse] = await Promise.all([listUsers(), listAuditLogs({ limit: 100 })]);
    users.value = usersResponse.rows;
    auditLogs.value = auditResponse.rows;
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "系统配置加载失败");
  } finally {
    auditLoading.value = false;
  }
}

async function openManagementDrawer(): Promise<void> {
  managementOpen.value = true;
  try {
    await refreshData();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "系统配置加载失败");
  }
  await refreshManagementData();
}

async function handleLogin(payload: { username: string; password: string }): Promise<void> {
  if (loginSubmitting.value) {
    return;
  }

  loginSubmitting.value = true;
  loginError.value = "";
  try {
    currentUser.value = await login(payload.username, payload.password);
    await refreshData();
    ElMessage.success("登录成功");
  } catch (caughtError) {
    loginError.value = caughtError instanceof Error ? caughtError.message : "登录失败";
  } finally {
    loginSubmitting.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await logout();
  currentUser.value = null;
  data.value = null;
  users.value = [];
  auditLogs.value = [];
  ElMessage.success("已退出登录");
}

async function handleChangePassword(payload: PasswordChangeInput): Promise<void> {
  if (passwordChanging.value) {
    return;
  }

  passwordChanging.value = true;
  passwordChangeError.value = "";
  try {
    await changePassword(payload);
    passwordDialogOpen.value = false;
    await logout();
    currentUser.value = null;
    data.value = null;
    users.value = [];
    auditLogs.value = [];
    ElMessage.success("密码已修改，请重新登录");
  } catch (caughtError) {
    passwordChangeError.value = caughtError instanceof Error ? caughtError.message : "密码修改失败";
  } finally {
    passwordChanging.value = false;
  }
}

async function resolveCopyPreviousWeekMode(): Promise<CopyPreviousWeekMode | null> {
  if (currentWeekEditableEntryCount.value === 0) {
    return "skip";
  }

  try {
    await ElMessageBox.confirm(
      "当前周已有排班。选择覆盖会用上一周同人员同星期的排班替换已有格子，选择跳过会保留当前周已有格子。",
      "复制上一周排班",
      {
        type: "warning",
        confirmButtonText: "覆盖已有排班",
        cancelButtonText: "跳过已有排班",
        distinguishCancelAndClose: true
      }
    );
    return "overwrite";
  } catch (action) {
    return action === "cancel" ? "skip" : null;
  }
}

function findEnabledShift(shortNames: string[], nameKeywords: string[]): Shift | null {
  return (
    data.value?.shifts.find((shift) => {
      if (!shift.enabled) {
        return false;
      }

      return shortNames.includes(shift.shortName) || nameKeywords.some((keyword) => shift.name.includes(keyword));
    }) ?? null
  );
}

async function resolveBatchSetMode(label: string): Promise<CopyPreviousWeekMode | null> {
  if (currentWeekEditableEntryCount.value === 0) {
    return "overwrite";
  }

  try {
    await ElMessageBox.confirm(
      `当前周已有排班。选择覆盖会将当前周可编辑格子设置为${label}，选择跳过会保留已有格子。`,
      `批量设置${label}`,
      {
        type: "warning",
        confirmButtonText: "覆盖已有排班",
        cancelButtonText: "跳过已有排班",
        distinguishCancelAndClose: true
      }
    );
    return "overwrite";
  } catch (action) {
    return action === "cancel" ? "skip" : null;
  }
}

async function handleCopyPreviousWeek(): Promise<void> {
  if (!data.value || !canEditSchedule.value || scheduleActionBusy.value) {
    return;
  }

  const mode = await resolveCopyPreviousWeekMode();
  if (!mode) {
    return;
  }

  copyingPreviousWeek.value = true;
  try {
    const response = await copyPreviousWeekSchedule({ weekStart: selectedWeek.value.start, mode });
    data.value = response.data;
    const { copied, skipped } = response.result;
    if (copied > 0) {
      const skippedText = skipped > 0 ? `，跳过 ${skipped} 个已有排班` : "";
      ElMessage.success(`已复制 ${copied} 个排班${skippedText}`);
      return;
    }

    if (skipped > 0) {
      ElMessage.info(`没有新的排班可复制，已跳过 ${skipped} 个已有排班`);
      return;
    }

    ElMessage.info("上一周没有可复制的排班");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "复制上一周排班失败");
  } finally {
    copyingPreviousWeek.value = false;
  }
}

async function submitBulkWeek(payload: BulkWeekSchedulePayload, actionLabel: "更新" | "清空"): Promise<void> {
  bulkUpdatingWeek.value = true;
  try {
    const response = await bulkUpdateWeekSchedule(payload);
    data.value = response.data;
    const { updated, skipped } = response.result;

    if (updated > 0) {
      const skippedText = skipped > 0 ? `，跳过 ${skipped} 个已有排班` : "";
      ElMessage.success(`已批量${actionLabel} ${updated} 个排班${skippedText}`);
      return;
    }

    if (skipped > 0) {
      ElMessage.info(`没有新的排班可${actionLabel}，已跳过 ${skipped} 个已有排班`);
      return;
    }

    ElMessage.info(`当前周没有可${actionLabel}的排班`);
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : `批量${actionLabel}排班失败`);
  } finally {
    bulkUpdatingWeek.value = false;
  }
}

async function handleBatchSetWeekShift(kind: "rest" | "office"): Promise<void> {
  if (!data.value || !canEditSchedule.value || scheduleActionBusy.value) {
    return;
  }

  const label = kind === "rest" ? "休息" : "办公";
  const shift = kind === "rest" ? restShift.value : officeShift.value;
  if (!shift) {
    ElMessage.error(`未找到启用的${label}班次，请先在系统配置中维护。`);
    return;
  }

  const mode = await resolveBatchSetMode(label);
  if (!mode) {
    return;
  }

  await submitBulkWeek(
    {
      weekStart: selectedWeek.value.start,
      operation: "set-shift",
      shiftId: shift.id,
      mode
    },
    "更新"
  );
}

async function handleClearWeek(): Promise<void> {
  if (!data.value || !canEditSchedule.value || scheduleActionBusy.value) {
    return;
  }

  if (currentWeekEditableEntryCount.value === 0) {
    ElMessage.info("当前周没有可清空的排班");
    return;
  }

  try {
    await ElMessageBox.confirm("将清空当前周可编辑人员的排班记录，此操作不可撤销。", "批量清空排班", {
      type: "warning",
      confirmButtonText: "确认清空",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }

  await submitBulkWeek(
    {
      weekStart: selectedWeek.value.start,
      operation: "clear"
    },
    "清空"
  );
}

async function handleFullscreen(): Promise<void> {
  const root = document.documentElement;

  if (!document.fullscreenEnabled || !root.requestFullscreen || !document.exitFullscreen) {
    ElMessage.error("当前浏览器不支持全屏模式");
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await root.requestFullscreen();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "全屏切换失败");
  }
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  return window.innerWidth <= 768;
}

function invokeSystemPrint(mode: PrintMode): void {
  if (!isSystemPrintSupported.value) {
    ElMessage.warning("当前浏览器不支持直接调用系统打印，请使用浏览器菜单中的打印或分享功能。");
    return;
  }

  document.body.dataset.printMode = mode;
  window.print();
  window.setTimeout(() => {
    delete document.body.dataset.printMode;
  }, 200);
}

function revokePdfDownloadUrl(): void {
  if (pdfDownloadUrl.value) {
    URL.revokeObjectURL(pdfDownloadUrl.value);
  }

  pdfDownloadUrl.value = "";
  pdfDownloadName.value = "";
  printPdfStatus.value = "";
}

function openPrintPreview(mode: PrintMode): void {
  revokePdfDownloadUrl();
  printPreviewMode.value = mode;
}

function closePrintPreview(): void {
  printPreviewMode.value = null;
  revokePdfDownloadUrl();
}

function printWithMode(mode: PrintMode): void {
  if (isMobileViewport() || !isSystemPrintSupported.value) {
    openPrintPreview(mode);
    return;
  }

  invokeSystemPrint(mode);
}

function handlePreviewPrint(): void {
  if (!printPreviewMode.value) {
    return;
  }

  invokeSystemPrint(printPreviewMode.value);
}

function getPrintPdfFilename(mode: PrintMode): string {
  return mode === "week" ? "week-schedule.pdf" : "month-schedule.pdf";
}

function canSharePdfFile(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [file] })
  );
}

function preparePdfDownload(file: File, message: string): void {
  pdfDownloadName.value = file.name;
  pdfDownloadUrl.value = URL.createObjectURL(file);
  printPdfStatus.value = message;
}

async function handlePreviewPdfShare(): Promise<void> {
  if (!printPreviewMode.value || pdfGenerating.value) {
    return;
  }

  const activePrintView = printPreviewContentRef.value?.querySelector(".print-preview-active");
  if (!(activePrintView instanceof HTMLElement)) {
    ElMessage.error("打印内容不可用");
    return;
  }

  pdfGenerating.value = true;
  revokePdfDownloadUrl();

  try {
    const filename = getPrintPdfFilename(printPreviewMode.value);
    const pdfFile = await createPrintPdfFile({ element: activePrintView, filename });

    if (canSharePdfFile(pdfFile)) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: printPreviewTitle.value
        });
        ElMessage.success("PDF 已发送到系统分享");
      } catch (shareError) {
        preparePdfDownload(pdfFile, "系统分享未完成，请点击下方链接下载 PDF。");
        ElMessage.warning(shareError instanceof Error ? shareError.message : "系统分享未完成");
      }
      return;
    }

    preparePdfDownload(pdfFile, "当前浏览器不支持直接分享 PDF，请点击下方链接下载。");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "PDF 生成失败");
  } finally {
    pdfGenerating.value = false;
  }
}

async function saveEntry(staffId: string, date: string, shiftIds: string[], note = ""): Promise<boolean> {
  try {
    data.value = await saveScheduleEntry({ staffId, date, shiftIds, note });
    return true;
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "排班保存失败");
    return false;
  }
}

function canEditStaffId(staffId: string): boolean {
  return editableStaffIds.value.includes(staffId);
}

function clearScheduleStaffSearch(): void {
  scheduleStaffQuery.value = "";
}

function markScheduleQueryRangeDirty(): void {
  scheduleQueryRangeDirty.value = true;
}

function clearScheduleQuery(): void {
  scheduleQueryStaffQuery.value = "";
  scheduleQueryStartDate.value = selectedWeek.value.start;
  scheduleQueryEndDate.value = selectedWeek.value.end;
  scheduleQueryRangeDirty.value = false;
}

async function handleQuickFill(staffId: string, date: string): Promise<void> {
  if (!canEditStaffId(staffId) || !selectedShiftId.value) {
    return;
  }

  await saveEntry(staffId, date, [selectedShiftId.value], "");
}

function handleEditCell(staffId: string, date: string): void {
  if (!canEditStaffId(staffId)) {
    return;
  }

  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string): Promise<void> {
  if (!canEditStaffId(editingStaffId.value)) {
    editorOpen.value = false;
    return;
  }

  if (await saveEntry(editingStaffId.value, editingDate.value, shiftIds, note)) {
    editorOpen.value = false;
  }
}

async function handleSaveStaff(staff: StaffMember): Promise<void> {
  if (staffSaving.value) {
    return;
  }

  staffSaving.value = true;
  try {
    data.value = await saveStaff(staff);
    staffSaveVersion.value += 1;
    await refreshLatestAuditLogsIfManaging();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "人员保存失败");
  } finally {
    staffSaving.value = false;
  }
}

async function handleDeleteStaff(staffId: string): Promise<void> {
  if (staffSaving.value) {
    return;
  }

  staffSaving.value = true;
  try {
    data.value = await deleteStaff(staffId);
    staffSaveVersion.value += 1;
    await refreshLatestAuditLogsIfManaging();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "人员删除失败");
  } finally {
    staffSaving.value = false;
  }
}

async function handleSaveShift(shift: Shift): Promise<void> {
  if (shiftSaving.value) {
    return;
  }

  shiftSaving.value = true;
  try {
    data.value = await saveShift(shift);
    shiftSaveVersion.value += 1;
    await refreshLatestAuditLogsIfManaging();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "班次保存失败");
  } finally {
    shiftSaving.value = false;
  }
}

async function handleSaveHoliday(holiday: Holiday): Promise<void> {
  if (holidaySaving.value) {
    return;
  }

  holidaySaving.value = true;
  try {
    data.value = await saveHoliday(holiday);
    holidaySaveVersion.value += 1;
    await refreshLatestAuditLogsIfManaging();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "节假日保存失败");
  } finally {
    holidaySaving.value = false;
  }
}

async function handleDeleteHoliday(holidayId: string): Promise<void> {
  if (holidaySaving.value) {
    return;
  }

  holidaySaving.value = true;
  try {
    data.value = await deleteHoliday(holidayId);
    holidaySaveVersion.value += 1;
    await refreshLatestAuditLogsIfManaging();
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "节假日删除失败");
  } finally {
    holidaySaving.value = false;
  }
}

async function handleSaveUser(user: SaveAuthUserInput): Promise<void> {
  if (userSaving.value) {
    return;
  }

  userSaving.value = true;
  try {
    await saveUser(user);
    await refreshUsers();
    await refreshLatestAuditLogs();
    ElMessage.success("账号已保存");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "账号保存失败");
  } finally {
    userSaving.value = false;
  }
}

async function handleDeleteUser(userId: string): Promise<void> {
  if (userSaving.value) {
    return;
  }

  userSaving.value = true;
  try {
    await deleteUser(userId);
    await refreshUsers();
    await refreshLatestAuditLogs();
    ElMessage.success("账号已删除");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "账号删除失败");
  } finally {
    userSaving.value = false;
  }
}

async function handleConfirmSettlement(payload: { month: string; bonusPool: number }): Promise<void> {
  if (settlementSaving.value || settlementCanceling.value) {
    return;
  }

  if (!canOperateCurrentSettlement.value) {
    ElMessage.warning("当前账号没有月结权限");
    return;
  }

  settlementSaving.value = true;
  try {
    if (data.value && displayedBonusSummary.value) {
      const settlementChecks = calculateSettlementChecks(data.value, displayedBonusSummary.value);

      if (settlementChecks.length > 0) {
        await ElMessageBox.confirm(settlementChecks.map((item) => item.message).join("\n"), "月结前数据检查", {
          cancelButtonText: "返回核对",
          confirmButtonText: "继续月结",
          type: "warning"
        });
      }
    }

    await ElMessageBox.confirm(
      `${payload.month} 月结奖金总额 ${payload.bonusPool.toFixed(2)}。确认后该月排班会被锁定，不能继续修改。`,
      "确认月结",
      {
        cancelButtonText: "再检查一下",
        confirmButtonText: "确认月结",
        type: "warning"
      }
    );
  } catch {
    settlementSaving.value = false;
    return;
  }

  try {
    data.value = await saveMonthlySettlement(payload.month, payload.bonusPool);
    ElMessage.success("月结已完成");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "月结失败");
  } finally {
    settlementSaving.value = false;
  }
}

async function handleCancelSettlement(month: string): Promise<void> {
  if (settlementSaving.value || settlementCanceling.value) {
    return;
  }

  if (!canOperateCurrentSettlement.value) {
    ElMessage.warning("当前账号没有月结权限");
    return;
  }

  try {
    settlementCanceling.value = true;
    data.value = await deleteMonthlySettlement(month);
    ElMessage.success("月结已取消");
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "取消月结失败");
  } finally {
    settlementCanceling.value = false;
  }
}

onMounted(async () => {
  try {
    currentUser.value = await getCurrentUser();
    if (currentUser.value) {
      await refreshData();
    }
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : "系统加载失败";
  } finally {
    authChecking.value = false;
  }
});
</script>

<template>
  <section v-if="authChecking" class="state-message">正在检查登录状态...</section>
  <LoginPage v-else-if="!currentUser" :loading="loginSubmitting" :error="loginError" @login="handleLogin" />
  <main v-else class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">国际医学部</p>
        <h1>护理排班管理系统</h1>
      </div>
      <div class="week-chip">{{ selectedWeek.start }} 至 {{ selectedWeek.end }}</div>
    </header>

    <section class="app-info-panel" aria-label="系统使用说明与核算规则">
      <div class="app-info-block">
        <h2>快速上手</h2>
        <p>
          所有登录账号可查看全科排班；排班员只能编辑账号可管理人员范围内的格子，其他格子为只读。绑定人员只用于标识账号本人，
          不会自动授予排班权限，编辑范围由账号可管理人员决定。
        </p>
      </div>
      <div class="app-info-block">
        <h2>核算规则</h2>
        <p>
          按班次而不是自然日计出勤；满勤默认 5 个班次，影响满勤的节假日会扣减；加班 = max(0, 出勤班次 -
          满勤标准)；总系数按班次系数累加，护士长绩效系数单独核算。
        </p>
        <p v-if="shiftCoefficientDescriptions">班次系数：{{ shiftCoefficientDescriptions }}</p>
      </div>
    </section>

    <AppToolbar
      v-model:selected-date="selectedDate"
      :admin-mode="canEditSchedule"
      :can-manage-config="canManageConfig"
      :current-user="currentUser"
      @open-management="openManagementDrawer"
      @open-password-change="passwordDialogOpen = true"
      @print-month="printWithMode('month')"
      @print-week="printWithMode('week')"
      @fullscreen="handleFullscreen"
      @logout="handleLogout"
    />

    <PasswordChangeDialog
      v-model="passwordDialogOpen"
      :loading="passwordChanging"
      :error="passwordChangeError"
      @change-password="handleChangePassword"
    />

    <section v-if="currentUser.role === 'admin' || currentUser.role === 'scheduler'" class="admin-mode-banner" role="status">
      当前账号可查看全科排班{{ canManageConfig ? "，并可维护人员、班次、节假日和账号" : "；可编辑范围由账号可管理人员决定" }}。
    </section>

    <el-dialog
      v-model="printPreviewOpen"
      class="print-preview-dialog"
      :title="printPreviewTitle"
      width="960px"
      append-to-body
    >
      <p v-if="!isSystemPrintSupported" class="print-preview-warning">
        当前浏览器不支持直接调用系统打印，可先核对预览内容，再使用浏览器菜单中的打印或分享功能。
      </p>
      <p class="print-preview-tip">
        预览内容确认无误后可生成 PDF；手机端优先使用系统分享，不支持时可下载 PDF 后打印。
      </p>
      <section ref="printPreviewContentRef" class="print-preview-content" aria-label="打印预览内容">
        <PrintViews
          v-if="data && weeklySummary"
          :data="data"
          :days="printMonthDays"
          :monthly-summary="monthlySummary"
          :monthly-settlement="currentMonthlySettlement"
          :summary="weeklySummary"
          :preview-mode="printPreviewMode"
        />
      </section>
      <p v-if="printPdfStatus" class="print-pdf-status">{{ printPdfStatus }}</p>
      <p v-if="pdfDownloadUrl" class="print-pdf-download">
        <a data-testid="print-pdf-download-link" :href="pdfDownloadUrl" :download="pdfDownloadName">下载 PDF</a>
      </p>
      <template #footer>
        <el-button @click="closePrintPreview">关闭预览</el-button>
        <el-button
          type="primary"
          data-testid="print-preview-pdf-button"
          :loading="pdfGenerating"
          @click="handlePreviewPdfShare"
        >
          生成/分享 PDF
        </el-button>
        <el-button
          v-if="!isMobileViewport() && isSystemPrintSupported"
          data-testid="print-preview-system-button"
          @click="handlePreviewPrint"
        >
          调用系统打印
        </el-button>
      </template>
    </el-dialog>

    <section v-if="error" class="state-message">
      {{ error }}
    </section>
    <section v-else-if="!data" class="state-message">正在加载排班数据...</section>
    <template v-else>
      <section class="workbench">
        <ManagementDrawer
          v-if="data"
          v-model="managementOpen"
          :data="data"
          :users="users"
          :audit-logs="auditLogs"
          :admin-mode="canManageConfig"
          :staff-save-version="staffSaveVersion"
          :shift-save-version="shiftSaveVersion"
          :holiday-save-version="holidaySaveVersion"
          :staff-saving="staffSaving"
          :shift-saving="shiftSaving"
          :holiday-saving="holidaySaving"
          :user-saving="userSaving"
          :audit-loading="auditLoading"
          @save-staff="handleSaveStaff"
          @delete-staff="handleDeleteStaff"
          @save-shift="handleSaveShift"
          @save-holiday="handleSaveHoliday"
          @delete-holiday="handleDeleteHoliday"
          @save-user="handleSaveUser"
          @delete-user="handleDeleteUser"
          @refresh-audit-logs="refreshAuditLogs"
        />

        <nav class="workbench-tabs" aria-label="工作台分区">
          <button
            v-for="tab in workbenchTabs"
            :key="tab.key"
            :data-testid="`workbench-tab-${tab.key}`"
            type="button"
            :class="{ active: activeWorkbenchTab === tab.key }"
            @click="activeWorkbenchTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>

        <section class="workbench-panel">
          <section
            v-show="activeWorkbenchTab === 'schedule'"
            class="workbench-tab-panel"
            data-testid="workbench-panel-schedule"
          >
            <div class="schedule-actions">
              <button
                data-testid="copy-previous-week-button"
                type="button"
                :disabled="!canEditSchedule || scheduleActionBusy"
                @click="handleCopyPreviousWeek"
              >
                {{ copyingPreviousWeek ? "复制中..." : "复制上一周" }}
              </button>
              <button
                data-testid="batch-rest-week-button"
                type="button"
                :disabled="!canEditSchedule || scheduleActionBusy"
                @click="handleBatchSetWeekShift('rest')"
              >
                批量休息
              </button>
              <button
                data-testid="batch-office-week-button"
                type="button"
                :disabled="!canEditSchedule || scheduleActionBusy"
                @click="handleBatchSetWeekShift('office')"
              >
                批量办公
              </button>
              <button
                class="danger-action"
                data-testid="clear-week-button"
                type="button"
                :disabled="!canEditSchedule || scheduleActionBusy"
                @click="handleClearWeek"
              >
                批量清空
              </button>
            </div>
            <div class="schedule-search" role="search" aria-label="排班人员搜索">
              <label class="schedule-search-label" for="schedule-staff-search">搜索人员</label>
              <input
                id="schedule-staff-search"
                v-model="scheduleStaffQuery"
                class="schedule-search-input"
                data-testid="schedule-staff-search"
                type="search"
                placeholder="输入姓名或工号"
              />
              <span class="schedule-search-count" data-testid="schedule-staff-search-count">
                已显示 {{ filteredScheduleStaff.length }} / {{ scheduleVisibleStaff.length }} 人
              </span>
              <button
                v-if="hasScheduleStaffSearch"
                class="schedule-search-clear"
                data-testid="clear-schedule-staff-search"
                type="button"
                @click="clearScheduleStaffSearch"
              >
                清空
              </button>
              <p
                v-if="hasScheduleStaffSearch && !hasScheduleStaffSearchResults"
                class="schedule-search-empty"
                data-testid="schedule-staff-search-empty"
              >
                未找到匹配人员
              </p>
            </div>
            <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
            <ScheduleGrid
              v-if="!hasScheduleStaffSearch || hasScheduleStaffSearchResults"
              :staff="filteredScheduleStaff"
              :days="scheduleDays"
              :holidays="data.holidays"
              :shifts="data.shifts"
              :entries="data.scheduleEntries"
              :selected-shift-id="selectedShiftId"
              :editable-staff-ids="editableStaffIds"
              @quick-fill="handleQuickFill"
              @edit-cell="handleEditCell"
            />
          </section>
          <section v-show="activeWorkbenchTab === 'query'" class="workbench-tab-panel" data-testid="workbench-panel-query">
            <section class="schedule-query-panel">
              <div class="schedule-search schedule-query-controls" role="search" aria-label="排班区间查询">
                <label class="schedule-search-label schedule-query-date-field" for="schedule-query-start-date">
                  开始日期
                  <input
                    id="schedule-query-start-date"
                    v-model="scheduleQueryStartDate"
                    class="schedule-search-input"
                    data-testid="schedule-query-start-date"
                    type="date"
                    @input="markScheduleQueryRangeDirty"
                  />
                </label>
                <label class="schedule-search-label schedule-query-date-field" for="schedule-query-end-date">
                  结束日期
                  <input
                    id="schedule-query-end-date"
                    v-model="scheduleQueryEndDate"
                    class="schedule-search-input"
                    data-testid="schedule-query-end-date"
                    type="date"
                    @input="markScheduleQueryRangeDirty"
                  />
                </label>
                <label class="schedule-search-label schedule-query-staff-field" for="schedule-query-staff-search">
                  搜索人员
                  <input
                    id="schedule-query-staff-search"
                    v-model="scheduleQueryStaffQuery"
                    class="schedule-search-input"
                    data-testid="schedule-query-staff-search"
                    type="search"
                    placeholder="输入姓名或工号"
                  />
                </label>
                <button
                  class="schedule-search-clear"
                  data-testid="clear-schedule-query"
                  type="button"
                  @click="clearScheduleQuery"
                >
                  清空
                </button>
                <span class="schedule-query-meta" data-testid="schedule-query-summary">
                  {{ scheduleQuerySummary }}
                </span>
              </div>
              <p v-if="scheduleQueryError" class="schedule-search-empty schedule-query-error" data-testid="schedule-query-error">
                {{ scheduleQueryError }}
              </p>
              <p v-if="scheduleQueryWarning" class="schedule-query-warning" data-testid="schedule-query-warning">
                {{ scheduleQueryWarning }}
              </p>
              <p
                v-if="scheduleQueryRange.ok && hasScheduleQueryStaffSearch && !hasScheduleQueryResults"
                class="schedule-search-empty"
                data-testid="schedule-query-empty"
              >
                未找到匹配人员
              </p>
              <ScheduleQueryResults
                v-if="hasScheduleQueryResults"
                :week-groups="scheduleQueryWeekGroups"
                :staff="filteredScheduleQueryStaff"
                :holidays="data.holidays"
                :shifts="data.shifts"
                :entries="scheduleQueryEntries"
              />
            </section>
          </section>
          <section v-show="activeWorkbenchTab === 'weekly'" class="workbench-tab-panel" data-testid="workbench-panel-weekly">
            <WeeklySummary v-if="weeklySummary" :summary="weeklySummary" />
          </section>
          <section v-show="activeWorkbenchTab === 'bonus'" class="workbench-tab-panel" data-testid="workbench-panel-bonus">
            <BonusSettlementPanel
              v-if="displayedBonusSummary"
              v-model:start-month="bonusStartMonth"
              v-model:end-month="bonusEndMonth"
              :can-operate-settlement="canOperateCurrentSettlement"
              :month="bonusStartMonth"
              :monthly-summary="displayedBonusSummary"
              :settlement="isBonusRangeMode ? null : currentBonusMonthlySettlement"
              :saving="settlementSaving"
              :canceling="settlementCanceling"
              :is-range-mode="isBonusRangeMode"
              :is-range-valid="isBonusRangeValid"
              :source-months="bonusRangeSummary?.sourceMonths ?? []"
              @confirm-settlement="handleConfirmSettlement"
              @cancel-settlement="handleCancelSettlement"
            />
          </section>
        </section>

        <CellEditorDialog
          v-model="editorOpen"
          :staff="editingStaff"
          :date="editingDate"
          :entry="editingEntry"
          :shifts="data.shifts"
          @save="handleEditorSave"
        />
      </section>
      <PrintViews
        v-if="weeklySummary"
        :data="data"
        :days="printMonthDays"
        :monthly-summary="monthlySummary"
        :monthly-settlement="currentMonthlySettlement"
        :summary="weeklySummary"
      />
    </template>
  </main>
</template>
