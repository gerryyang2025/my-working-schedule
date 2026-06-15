<script setup lang="ts">
import { reactive, watch } from "vue";
import type { PublicAppData } from "@/api/client";
import type { Holiday, Shift, StaffMember } from "@/types/domain";

const props = defineProps<{
  modelValue: boolean;
  data: Pick<PublicAppData, "staff" | "shifts" | "holidays">;
  adminMode: boolean;
  staffSaveVersion: number;
  shiftSaveVersion: number;
  holidaySaveVersion: number;
  staffSaving: boolean;
  shiftSaving: boolean;
  holidaySaving: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saveStaff: [staff: StaffMember];
  saveShift: [shift: Shift];
  saveHoliday: [holiday: Holiday];
}>();

const staffDraft = reactive<StaffMember>({
  id: "",
  jobId: "",
  name: "",
  type: "nurse",
  isAdmin: false,
  enabled: true,
  sortOrder: 99
});

const shiftDraft = reactive<Shift>({
  id: "",
  name: "",
  shortName: "",
  color: "#2563EB",
  countsAttendance: true,
  coefficient: 1,
  enabled: true,
  sortOrder: 99
});

const holidayDraft = reactive<Holiday>({
  id: "",
  date: "",
  name: "",
  affectsRequiredAttendance: true
});

function resetStaffDraft(): void {
  Object.assign(staffDraft, {
    id: `staff-${Date.now()}`,
    jobId: "",
    name: "",
    type: "nurse",
    isAdmin: false,
    enabled: true,
    sortOrder: 99
  });
}

function resetShiftDraft(): void {
  Object.assign(shiftDraft, {
    id: `shift-${Date.now()}`,
    name: "",
    shortName: "",
    color: "#2563EB",
    countsAttendance: true,
    coefficient: 1,
    enabled: true,
    sortOrder: 99
  });
}

function resetHolidayDraft(): void {
  Object.assign(holidayDraft, {
    id: `holiday-${Date.now()}`,
    date: "",
    name: "",
    affectsRequiredAttendance: true
  });
}

function resetDrafts(): void {
  resetStaffDraft();
  resetShiftDraft();
  resetHolidayDraft();
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      return;
    }

    resetDrafts();
  }
);

watch(
  () => props.staffSaveVersion,
  () => {
    resetStaffDraft();
  }
);

watch(
  () => props.shiftSaveVersion,
  () => {
    resetShiftDraft();
  }
);

watch(
  () => props.holidaySaveVersion,
  () => {
    resetHolidayDraft();
  }
);
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="系统配置"
    size="560px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert v-if="!adminMode" title="进入编辑模式后才能保存配置" type="warning" :closable="false" />

    <el-tabs>
      <el-tab-pane label="人员">
        <el-table :data="data.staff" size="small">
          <el-table-column prop="jobId" label="工号" width="90" />
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="isAdmin" label="管理员" width="90" />
        </el-table>

        <div class="management-form">
          <el-input v-model="staffDraft.jobId" placeholder="工号" :disabled="staffSaving" />
          <el-input v-model="staffDraft.name" placeholder="姓名" :disabled="staffSaving" />
          <el-select v-model="staffDraft.type" placeholder="类型" :disabled="staffSaving">
            <el-option label="护士" value="nurse" />
            <el-option label="文员" value="clerk" />
            <el-option label="护士长" value="head_nurse" />
          </el-select>
          <el-checkbox v-model="staffDraft.isAdmin" :disabled="staffSaving">指定管理员</el-checkbox>
          <el-button
            type="primary"
            :disabled="staffSaving || !adminMode || !staffDraft.jobId || !staffDraft.name"
            :loading="staffSaving"
            @click="emit('saveStaff', { ...staffDraft })"
          >
            保存人员
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="班次">
        <el-table :data="data.shifts" size="small">
          <el-table-column prop="shortName" label="简称" width="80" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="coefficient" label="系数" width="80" />
          <el-table-column prop="countsAttendance" label="计出勤" width="90" />
        </el-table>

        <div class="management-form">
          <el-input v-model="shiftDraft.name" placeholder="班次名称" :disabled="shiftSaving" />
          <el-input v-model="shiftDraft.shortName" placeholder="简称" :disabled="shiftSaving" />
          <el-color-picker v-model="shiftDraft.color" :disabled="shiftSaving" />
          <el-input-number v-model="shiftDraft.coefficient" :min="0" :step="0.1" :disabled="shiftSaving" />
          <el-checkbox v-model="shiftDraft.countsAttendance" :disabled="shiftSaving">计出勤</el-checkbox>
          <el-button
            type="primary"
            :disabled="shiftSaving || !adminMode || !shiftDraft.name || !shiftDraft.shortName"
            :loading="shiftSaving"
            @click="emit('saveShift', { ...shiftDraft })"
          >
            保存班次
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="节假日">
        <el-table :data="data.holidays" size="small">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="affectsRequiredAttendance" label="影响满勤" width="100" />
        </el-table>

        <div class="management-form">
          <el-date-picker v-model="holidayDraft.date" value-format="YYYY-MM-DD" placeholder="日期" :disabled="holidaySaving" />
          <el-input v-model="holidayDraft.name" placeholder="节假日名称" :disabled="holidaySaving" />
          <el-checkbox v-model="holidayDraft.affectsRequiredAttendance" :disabled="holidaySaving">影响满勤</el-checkbox>
          <el-button
            type="primary"
            :disabled="holidaySaving || !adminMode || !holidayDraft.date || !holidayDraft.name"
            :loading="holidaySaving"
            @click="emit('saveHoliday', { ...holidayDraft })"
          >
            保存节假日
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>
