<script setup lang="ts">
import { ElMessage } from "element-plus";
import { computed, onMounted, ref } from "vue";
import AppToolbar from "@/components/AppToolbar.vue";
import BonusSettlementPanel from "@/components/BonusSettlementPanel.vue";
import CellEditorDialog from "@/components/CellEditorDialog.vue";
import ManagementDrawer from "@/components/ManagementDrawer.vue";
import PrintViews from "@/components/PrintViews.vue";
import ScheduleGrid from "@/components/ScheduleGrid.vue";
import ShiftPalette from "@/components/ShiftPalette.vue";
import WeeklySummary from "@/components/WeeklySummary.vue";
import {
  deleteHoliday,
  deleteMonthlySettlement,
  enterAdminMode,
  loadData,
  saveHoliday,
  saveMonthlySettlement,
  saveScheduleEntry,
  saveShift,
  saveStaff
} from "@/api/client";
import type { PublicAppData } from "@/api/client";
import type { Holiday, MonthlySettlement, Shift, StaffMember } from "@/types/domain";
import { calculateMonthlySummary, calculateWeeklySummary } from "@/lib/calculation";
import { getMonthDays, getWeekDays, getWeekRange, parseDateKey, toDateKey } from "@/lib/date";
import { createPrintPdfFile } from "@/lib/print-pdf";

type PrintMode = "month" | "week";

const today = toDateKey(new Date());
const data = ref<PublicAppData | null>(null);
const error = ref("");
const adminMode = ref(false);
const adminLoginOpen = ref(false);
const adminPassword = ref("");
const adminSubmitting = ref(false);
const selectedDate = ref(today);
const managementOpen = ref(false);
const selectedShiftId = ref("");
const editorOpen = ref(false);
const editingStaffId = ref("");
const editingDate = ref("");
const staffSaveVersion = ref(0);
const shiftSaveVersion = ref(0);
const holidaySaveVersion = ref(0);
const staffSaving = ref(false);
const shiftSaving = ref(false);
const holidaySaving = ref(false);
const settlementSaving = ref(false);
const settlementCanceling = ref(false);
const printPreviewMode = ref<PrintMode | null>(null);
const printPreviewContentRef = ref<HTMLElement | null>(null);
const pdfGenerating = ref(false);
const pdfDownloadUrl = ref("");
const pdfDownloadName = ref("");
const printPdfStatus = ref("");

const selectedWeek = computed(() => getWeekRange(selectedDate.value));
const selectedMonth = computed(() => selectedDate.value.slice(0, 7));
const scheduleDays = computed(() => getWeekDays(selectedDate.value));
const printMonthDays = computed(() => {
  const date = parseDateKey(selectedDate.value);
  return getMonthDays(date.getFullYear(), date.getMonth() + 1);
});
const weeklySummary = computed(() => (data.value ? calculateWeeklySummary(data.value, selectedDate.value) : null));
const monthlySummary = computed(() => (data.value ? calculateMonthlySummary(data.value, printMonthDays.value) : null));
const currentMonthlySettlement = computed<MonthlySettlement | null>(() => {
  return data.value?.monthlySettlements.find((settlement) => settlement.month === selectedMonth.value) ?? null;
});
const editingStaff = computed(() => data.value?.staff.find((staff) => staff.id === editingStaffId.value) ?? null);
const editingEntry = computed(
  () =>
    data.value?.scheduleEntries.find((entry) => entry.staffId === editingStaffId.value && entry.date === editingDate.value) ??
    null
);
const shiftCoefficientDescriptions = computed(() =>
  (data.value?.shifts ?? [])
    .filter((shift) => shift.enabled)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((shift) => `${shift.name} ${shift.countsAttendance ? shift.coefficient.toFixed(2) : "不计出勤"}`)
    .join("；")
);
const canSubmitAdminPassword = computed(() => adminPassword.value.trim().length > 0 && !adminSubmitting.value);
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

async function refreshData(): Promise<void> {
  data.value = await loadData();
}

async function handleEnterAdmin(): Promise<void> {
  if (adminMode.value) {
    return;
  }

  adminPassword.value = "";
  adminLoginOpen.value = true;
}

async function handleSubmitAdminPassword(): Promise<void> {
  if (!canSubmitAdminPassword.value) {
    return;
  }

  adminSubmitting.value = true;
  try {
    await enterAdminMode(adminPassword.value);
    adminMode.value = true;
    adminLoginOpen.value = false;
    adminPassword.value = "";
    ElMessage.success("编辑模式已开启");
  } catch (caughtError) {
    adminMode.value = false;
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "管理密码验证失败");
  } finally {
    adminSubmitting.value = false;
  }
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

async function handleQuickFill(staffId: string, date: string): Promise<void> {
  if (!selectedShiftId.value) {
    return;
  }

  await saveEntry(staffId, date, [selectedShiftId.value], "");
}

function handleEditCell(staffId: string, date: string): void {
  editingStaffId.value = staffId;
  editingDate.value = date;
  editorOpen.value = true;
}

async function handleEditorSave(shiftIds: string[], note: string): Promise<void> {
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
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "人员保存失败");
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
  } catch (caughtError) {
    ElMessage.error(caughtError instanceof Error ? caughtError.message : "节假日删除失败");
  } finally {
    holidaySaving.value = false;
  }
}

async function handleConfirmSettlement(payload: { month: string; bonusPool: number }): Promise<void> {
  if (settlementSaving.value || settlementCanceling.value) {
    return;
  }

  if (!adminMode.value) {
    ElMessage.warning("请先进入编辑模式");
    return;
  }

  try {
    settlementSaving.value = true;
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

  if (!adminMode.value) {
    ElMessage.warning("请先进入编辑模式");
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
    await refreshData();
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : "系统加载失败";
  }
});
</script>

<template>
  <main class="app-shell">
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
        <p>选择日期查看所在周；选择班次画笔后点击格子快速排班，点击格子可编辑一天最多两个班次。</p>
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
      :admin-mode="adminMode"
      @enter-admin="handleEnterAdmin"
      @open-management="managementOpen = true"
      @print-month="printWithMode('month')"
      @print-week="printWithMode('week')"
      @fullscreen="handleFullscreen"
    />

    <section v-if="adminMode" class="admin-mode-banner" role="status">
      编辑模式已开启，可以维护排班、人员、班次和节假日。
    </section>

    <el-dialog
      v-model="adminLoginOpen"
      class="admin-login-dialog"
      title="进入编辑模式"
      width="420px"
      :close-on-click-modal="!adminSubmitting"
      :close-on-press-escape="!adminSubmitting"
    >
      <p class="admin-login-tip">请输入服务端配置的管理密码，验证通过后即可编辑排班和系统配置。</p>
      <el-input
        v-model="adminPassword"
        type="password"
        placeholder="管理密码"
        show-password
        :disabled="adminSubmitting"
        @keyup.enter="handleSubmitAdminPassword"
      />
      <template #footer>
        <el-button :disabled="adminSubmitting" @click="adminLoginOpen = false">取消</el-button>
        <el-button
          type="primary"
          data-testid="admin-submit-button"
          :disabled="!canSubmitAdminPassword"
          :loading="adminSubmitting"
          @click="handleSubmitAdminPassword"
        >
          进入编辑模式
        </el-button>
      </template>
    </el-dialog>

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
          :admin-mode="adminMode"
          :staff-save-version="staffSaveVersion"
          :shift-save-version="shiftSaveVersion"
          :holiday-save-version="holidaySaveVersion"
          :staff-saving="staffSaving"
          :shift-saving="shiftSaving"
          :holiday-saving="holidaySaving"
          @save-staff="handleSaveStaff"
          @save-shift="handleSaveShift"
          @save-holiday="handleSaveHoliday"
          @delete-holiday="handleDeleteHoliday"
        />
        <ShiftPalette :shifts="data.shifts" :selected-shift-id="selectedShiftId" @select="selectedShiftId = $event" />
        <ScheduleGrid
          :staff="data.staff"
          :days="scheduleDays"
          :holidays="data.holidays"
          :shifts="data.shifts"
          :entries="data.scheduleEntries"
          :selected-shift-id="selectedShiftId"
          :admin-mode="adminMode"
          @quick-fill="handleQuickFill"
          @edit-cell="handleEditCell"
        />
        <WeeklySummary v-if="weeklySummary" :summary="weeklySummary" />
        <BonusSettlementPanel
          v-if="monthlySummary"
          :admin-mode="adminMode"
          :month="selectedMonth"
          :monthly-summary="monthlySummary"
          :settlement="currentMonthlySettlement"
          :saving="settlementSaving"
          :canceling="settlementCanceling"
          @confirm-settlement="handleConfirmSettlement"
          @cancel-settlement="handleCancelSettlement"
        />
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
