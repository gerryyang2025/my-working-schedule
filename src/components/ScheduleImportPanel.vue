<script setup lang="ts">
import { computed, ref } from "vue";
import type { PublicAppData } from "@/api/client";
import { validateScheduleImportText, type ScheduleImportValidationResult } from "@/lib/schedule-import";
import type { StaffType } from "@/types/domain";

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  nurse: "护士",
  clerk: "文员",
  head_nurse: "护士长"
};

const props = defineProps<{
  data: PublicAppData;
  saving: boolean;
}>();

const emit = defineEmits<{
  confirmImport: [rawText: string];
}>();

const rawText = ref("");
const validation = ref<ScheduleImportValidationResult | null>(null);
const validatedRawText = ref("");

const canConfirm = computed(
  () =>
    validation.value?.ok === true &&
    !validation.value.noImportableCells &&
    validatedRawText.value === rawText.value &&
    !props.saving
);

function validateInput(): void {
  validation.value = validateScheduleImportText({ rawText: rawText.value, data: props.data });
  validatedRawText.value = rawText.value;
}

function clearInput(): void {
  rawText.value = "";
  validation.value = null;
  validatedRawText.value = "";
}

function confirmImport(): void {
  if (!canConfirm.value) {
    return;
  }

  emit("confirmImport", rawText.value);
}

function staffTypeLabel(type: StaffType): string {
  return STAFF_TYPE_LABELS[type] ?? type;
}
</script>

<template>
  <section class="schedule-import-panel" data-testid="schedule-import-panel">
    <section class="schedule-import-guide">
      <h2>导入排班</h2>
      <p>请从表格复制完整的周期说明和排班内容。系统会先校验格式、人员和班次，确认预览后才会写入。</p>
      <h3>导入数据格式示例：</h3>
      <pre class="schedule-import-example">当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

姓名	周一(7/20)	周二(7/21)	周三(7/22)	周四(7/23)	周五(7/24)	周六(7/25)	周日(7/26)
段鸿露	常班	常班	常班	常班	常班	休	休
张曼曼	N1	/	休	P3	A4	A4	N1
陈佩燕	N2	/	休	P2	A5	A2	N2
王亚婷	A5	N1	/	休	P2	A3组长	休
李丹青	P2	N2	/	休	婚假	婚假	婚假
时银丽	A4	A4	N1	/	休	P2	A3组长</pre>
      <p class="schedule-import-note">已有排班会自动跳过，不会覆盖；人员按姓名精确匹配，工号由系统自动反查。</p>
    </section>

    <section class="schedule-import-input-card">
      <label class="schedule-import-input-label" for="schedule-import-input">粘贴排班数据</label>
      <textarea
        id="schedule-import-input"
        v-model="rawText"
        class="schedule-import-input"
        data-testid="schedule-import-input"
        rows="10"
        placeholder="请粘贴周期说明和排班表格"
      />
      <div class="schedule-import-actions">
        <button data-testid="schedule-import-validate" type="button" @click="validateInput">校验数据</button>
        <button data-testid="schedule-import-clear" type="button" @click="clearInput">清空</button>
      </div>
    </section>

    <div v-if="validation && !validation.ok" class="schedule-import-errors" data-testid="schedule-import-errors" role="alert">
      <span
        v-for="error in validation.errors"
        :key="`${error.scope}-${error.rowNumber ?? 0}-${error.columnLabel ?? ''}-${error.message}`"
      >
        {{ error.message }}
      </span>
    </div>

    <section v-if="validation?.ok" class="schedule-import-preview" data-testid="schedule-import-preview">
      <h3 data-testid="schedule-import-period">
        第{{ validation.period.weekNumber }}周 {{ validation.period.start }} 至 {{ validation.period.end }}
      </h3>
      <p class="schedule-import-summary" data-testid="schedule-import-summary">
        识别 {{ validation.summary.staffCount }} 人；待导入 {{ validation.summary.importableCells }} 个；跳过已有
        {{ validation.summary.skippedExistingCells }} 个；别名 {{ validation.summary.aliasMappedCells }} 个。
      </p>
      <p v-if="validation.noImportableCells" class="schedule-import-noop" data-testid="schedule-import-noop">没有可导入内容</p>

      <section class="schedule-grid-wrap schedule-import-preview-wrap">
        <table class="schedule-import-preview-table">
          <thead>
            <tr>
              <th>行号</th>
              <th>姓名</th>
              <th>工号</th>
              <th>类型</th>
              <th v-for="day in validation.period.days" :key="day.key">{{ day.columnLabel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in validation.rows" :key="row.staffId">
              <th>{{ row.rowNumber }}</th>
              <th>{{ row.staffName }}</th>
              <td>{{ row.staffJobId }}</td>
              <td>{{ staffTypeLabel(row.staffType) }}</td>
              <td
                v-for="cell in row.cells"
                :key="`${row.staffId}-${cell.date}`"
                :class="`schedule-import-cell-${cell.status}`"
              >
                <strong :style="{ color: cell.shiftColor }">{{ cell.shiftShortName }}</strong>
                <small v-if="cell.resolvedBy === 'alias'">{{ cell.rawValue }} → {{ cell.aliasTarget }}</small>
                <small v-else>{{ cell.rawValue }} → {{ cell.shiftShortName }}</small>
                <small>{{ cell.status === "import" ? "待导入" : "跳过已有" }}</small>
                <small v-if="cell.existingShiftLabels.length > 0">已有：{{ cell.existingShiftLabels.join("、") }}</small>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <button data-testid="schedule-import-confirm" type="button" :disabled="!canConfirm" @click="confirmImport">
        {{ saving ? "导入中..." : "确认导入" }}
      </button>
    </section>
  </section>
</template>
