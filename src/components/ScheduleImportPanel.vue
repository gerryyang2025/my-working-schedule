<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { previewScheduleImport, type PublicAppData } from "@/api/client";
import type { ScheduleImportValidationError, ScheduleImportValidationResult } from "@/lib/schedule-import";
import type { StaffType } from "@/types/domain";

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  nurse: "护士",
  clerk: "文员",
  head_nurse: "护士长"
};

const AI_IMPORT_PROMPT = `请提取上传图片中的排班表信息，按以下要求输出：

1. 当前排班周期为{年份}年{月份}月{起始日}日（周{起始星期}）至 {结束日}日（周{结束星期}）。

2. 输出格式为表格，包含以下列：
   - 姓名
   - 周一（月/日）
   - 周二（月/日）
   - 周三（月/日）
   - 周四（月/日）
   - 周五（月/日）
   - 周六（月/日）
   - 周日（月/日）

3. 提取规则：
   - 忽略图片中的序号列（第一列）
   - 忽略工号列
   - 忽略"周标准工时"列
   - 只提取"姓名"及其对应的七天排班内容
   - 排班内容按原样提取，不做修改或翻译

4. 输出示例格式：

当前排班周期为2026年7月20日（周一）至 7月26日（周日）：

| 姓名 | 周一(7/20) | 周二(7/21) | 周三(7/22) | 周四(7/23) | 周五(7/24) | 周六(7/25) | 周日(7/26) |
|------|------------|------------|------------|------------|------------|------------|------------|
| 段鸿露 | 常班 | 常班 | 常班 | 常班 | 常班 | 休 | 休 |
| 张曼曼 | N1 | / | 休 | P3 | A4 | A4 | N1 |
| ……（其余人员依次列出） |

5. 注意事项：
   - 日期和星期需根据图片中实际日期准确填写
   - 如遇"婚假"、"进修"、"备班1"、"跟班-办公"等特殊排班，按原文字保留
   - 表格中" / "表示夜班下休`;

const IMPORT_EXAMPLE_DAYS = [
  "周一(7/20)",
  "周二(7/21)",
  "周三(7/22)",
  "周四(7/23)",
  "周五(7/24)",
  "周六(7/25)",
  "周日(7/26)"
];

const IMPORT_EXAMPLE_ROWS = [
  ["段鸿露", "常班", "常班", "常班", "常班", "常班", "休", "休"],
  ["张曼曼", "N1", "/", "休", "P3", "A4", "A4", "N1"],
  ["陈佩燕", "N2", "/", "休", "P2", "A5", "A2", "N2"],
  ["王亚婷", "A5", "N1", "/", "休", "P2", "A3组长", "休"],
  ["李丹青", "P2", "N2", "/", "休", "婚假", "婚假", "婚假"],
  ["时银丽", "A4", "A4", "N1", "/", "休", "P2", "A3组长"]
];

const props = withDefaults(defineProps<{
  data: PublicAppData;
  saving: boolean;
  serverErrors?: ScheduleImportValidationError[];
}>(), {
  serverErrors: () => []
});

const emit = defineEmits<{
  confirmImport: [rawText: string];
}>();

const rawText = ref("");
const validation = ref<ScheduleImportValidationResult | null>(null);
const validatedRawText = ref("");
const previewing = ref(false);
const aiPromptCopied = ref(false);

const canConfirm = computed(
  () =>
    validation.value?.ok === true &&
    !validation.value.noImportableCells &&
    validatedRawText.value === rawText.value &&
    !previewing.value &&
    !props.saving
);

watch(
  () => props.serverErrors,
  (errors) => {
    if (errors.length === 0) {
      return;
    }

    validation.value = { ok: false, errors };
    validatedRawText.value = rawText.value;
  },
  { deep: true }
);

async function validateInput(): Promise<void> {
  const currentRawText = rawText.value;
  previewing.value = true;
  try {
    const response = await previewScheduleImport(currentRawText);
    validation.value = response.preview;
  } catch (caughtError) {
    validation.value = {
      ok: false,
      errors: scheduleImportErrorsFromError(caughtError)
    };
  } finally {
    validatedRawText.value = currentRawText;
    previewing.value = false;
  }
}

function clearInput(): void {
  rawText.value = "";
  validation.value = null;
  validatedRawText.value = "";
}

async function copyAiImportPrompt(): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
    } else {
      copyTextWithTextarea(AI_IMPORT_PROMPT);
    }
    aiPromptCopied.value = true;
  } catch {
    aiPromptCopied.value = false;
  }
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

function copyTextWithTextarea(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function scheduleImportErrorsFromError(caughtError: unknown): ScheduleImportValidationError[] {
  if (typeof caughtError === "object" && caughtError !== null && "errors" in caughtError) {
    const errors = (caughtError as { errors?: unknown }).errors;
    if (Array.isArray(errors)) {
      return errors as ScheduleImportValidationError[];
    }
  }

  return [{ scope: "period", message: caughtError instanceof Error ? caughtError.message : "导入数据校验失败" }];
}
</script>

<template>
  <section class="schedule-import-panel" data-testid="schedule-import-panel">
    <section class="schedule-import-guide">
      <h2>导入排班</h2>
      <p>请从表格复制完整的周期说明和排班内容。系统会先校验格式、人员和班次，确认预览后才会写入。</p>
    </section>

    <section class="schedule-import-ai-prompt" data-testid="schedule-import-ai-prompt">
      <div class="schedule-import-ai-header">
        <h3>AI 识别提示词</h3>
        <div class="schedule-import-ai-actions">
          <a href="https://chat.deepseek.com/" target="_blank" rel="noreferrer">打开 DeepSeek</a>
          <button
            data-testid="schedule-import-ai-prompt-copy"
            type="button"
            aria-label="复制 AI 识别提示词"
            title="复制 AI 识别提示词"
            @click="copyAiImportPrompt"
          >
            {{ aiPromptCopied ? "已复制提示词" : "复制 AI 提示词" }}
          </button>
        </div>
      </div>
      <p>
        用户只需要在 DeepSeek 上传排班图片，并使用下面提供的提示词，即可生成预期格式的导入数据；生成后复制到下方输入框校验即可。
      </p>
      <pre class="schedule-import-ai-prompt-text" data-testid="schedule-import-ai-prompt-text">{{ AI_IMPORT_PROMPT }}</pre>
    </section>

    <section class="schedule-import-guide">
      <h3>导入数据格式示例：</h3>
      <p class="schedule-import-example-period">当前排班周期为2026年7月20日（周一）至 7月26日（周日）：</p>
      <div class="schedule-import-example-wrap">
        <table class="schedule-import-example-table" data-testid="schedule-import-example-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th v-for="day in IMPORT_EXAMPLE_DAYS" :key="day">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in IMPORT_EXAMPLE_ROWS" :key="row[0]">
              <th>{{ row[0] }}</th>
              <td v-for="(cell, index) in row.slice(1)" :key="`${row[0]}-${IMPORT_EXAMPLE_DAYS[index]}`">
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
