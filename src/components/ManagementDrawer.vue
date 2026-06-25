<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { AuditLogEntry, AuditLogQuery, ManagedAuthUser, PublicAppData, SaveAuthUserInput, UserRole } from "@/api/client";
import { formatAuditOccurredAt } from "@/lib/format";
import type { Holiday, Shift, StaffMember } from "@/types/domain";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: "drawer" | "inline";
    data: Pick<PublicAppData, "staff" | "shifts" | "holidays">;
    users: ManagedAuthUser[];
    auditLogs: AuditLogEntry[];
    adminMode: boolean;
    staffSaveVersion: number;
    shiftSaveVersion: number;
    holidaySaveVersion: number;
    staffSaving: boolean;
    shiftSaving: boolean;
    holidaySaving: boolean;
    userSaving: boolean;
    auditLoading: boolean;
  }>(),
  { mode: "drawer" }
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saveStaff: [staff: StaffMember];
  deleteStaff: [staffId: string];
  saveShift: [shift: Shift];
  saveHoliday: [holiday: Holiday];
  deleteHoliday: [holidayId: string];
  saveUser: [user: SaveAuthUserInput];
  deleteUser: [userId: string];
  refreshAuditLogs: [query: AuditLogQuery];
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

const userDraft = reactive<SaveAuthUserInput>({
  id: "",
  username: "",
  displayName: "",
  role: "viewer",
  enabled: true,
  staffId: null,
  managedStaffIds: [],
  password: ""
});

const auditFilters = reactive<Required<AuditLogQuery>>({
  username: "",
  action: "",
  keyword: "",
  limit: 100
});
const activeManagementTab = ref("staff");

const isExistingHolidayDraft = computed(() => props.data.holidays.some((holiday) => holiday.id === holidayDraft.id));
const isExistingStaffDraft = computed(() => props.data.staff.some((staff) => staff.id === staffDraft.id));
const isExistingUserDraft = computed(() => props.users.some((user) => user.id === userDraft.id));
const staffById = computed(() => new Map(props.data.staff.map((staff) => [staff.id, staff])));
const bindableStaff = computed(() => props.data.staff.filter((staff) => staff.enabled || staff.id === userDraft.staffId));
const manageableStaff = computed(() =>
  props.data.staff.filter((staff) => staff.enabled || userDraft.managedStaffIds?.includes(staff.id))
);
const hasActiveAuditFilters = computed(() => Boolean(auditFilters.username || auditFilters.action || auditFilters.keyword));
const auditEmptyText = computed(() =>
  hasActiveAuditFilters.value ? "当前筛选无结果，可清空筛选查看最新审计" : "暂无审计日志"
);

function roleLabel(role: UserRole): string {
  if (role === "admin") {
    return "系统管理员";
  }
  if (role === "scheduler") {
    return "排班管理员";
  }
  return "只读查看";
}

function staffTypeLabel(type: StaffMember["type"]): string {
  if (type === "head_nurse") {
    return "护士长";
  }

  if (type === "clerk") {
    return "文员";
  }

  return "护士";
}

function staffBindingLabel(staffId: string | null | undefined): string {
  if (!staffId) {
    return "未绑定";
  }

  const staff = staffById.value.get(staffId);
  if (!staff) {
    return `未知人员 / ${staffId}`;
  }

  return `${staff.name} / ${staff.jobId}${staff.enabled ? "" : "（已停用）"}`;
}

function managedStaffLabel(staffIds: string[] | undefined): string {
  const ids = staffIds ?? [];
  if (ids.length === 0) {
    return "未配置";
  }

  const labels = ids.map((staffId) => staffBindingLabel(staffId));
  return labels.length > 2 ? `${labels.slice(0, 2).join("、")} 等 ${labels.length} 人` : labels.join("、");
}

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

function resetUserDraft(): void {
  Object.assign(userDraft, {
    id: `user-${Date.now()}`,
    username: "",
    displayName: "",
    role: "viewer",
    enabled: true,
    staffId: null,
    managedStaffIds: [],
    password: ""
  });
}

function resetDrafts(): void {
  resetStaffDraft();
  resetShiftDraft();
  resetHolidayDraft();
  resetUserDraft();
}

function loadStaffDraft(staff: StaffMember): void {
  if (props.staffSaving) {
    return;
  }

  Object.assign(staffDraft, staff);
}

function loadShiftDraft(shift: Shift): void {
  if (props.shiftSaving) {
    return;
  }

  Object.assign(shiftDraft, shift);
}

function loadHolidayDraft(holiday: Holiday): void {
  if (props.holidaySaving) {
    return;
  }

  Object.assign(holidayDraft, holiday);
}

function loadUserDraft(user: ManagedAuthUser): void {
  if (props.userSaving) {
    return;
  }

  Object.assign(userDraft, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    enabled: user.enabled,
    staffId: user.staffId,
    managedStaffIds: [...(user.managedStaffIds ?? [])],
    password: ""
  });
}

function emitSaveUser(): void {
  const payload: SaveAuthUserInput = {
    id: userDraft.id,
    username: userDraft.username,
    displayName: userDraft.displayName,
    role: userDraft.role,
    enabled: userDraft.enabled,
    staffId: userDraft.staffId || null,
    managedStaffIds: userDraft.role === "scheduler" ? [...(userDraft.managedStaffIds ?? [])] : []
  };

  if (userDraft.password) {
    payload.password = userDraft.password;
  }

  emit("saveUser", payload);
}

function emitRefreshAuditLogs(): void {
  emit("refreshAuditLogs", { ...auditFilters });
}

function emitRefreshLatestAuditLogs(): void {
  Object.assign(auditFilters, {
    username: "",
    action: "",
    keyword: "",
    limit: 100
  });
  emit("refreshAuditLogs", { limit: 100 });
}

function handleManagementTabChange(tabName: string | number): void {
  if (tabName === "audit") {
    emitRefreshLatestAuditLogs();
  }
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
  <component
    :is="mode === 'drawer' ? 'el-drawer' : 'section'"
    v-if="mode === 'drawer' || modelValue"
    :class="mode === 'drawer' ? 'management-drawer' : 'management-inline-panel'"
    :data-testid="mode === 'inline' ? 'management-inline-panel' : undefined"
    :model-value="mode === 'drawer' ? modelValue : undefined"
    :title="mode === 'drawer' ? '系统配置' : undefined"
    :size="mode === 'drawer' ? '560px' : undefined"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header v-if="mode === 'inline'" class="management-inline-header">
      <h2>系统配置</h2>
    </header>

    <el-alert v-if="!adminMode" title="进入编辑模式后才能保存配置" type="warning" :closable="false" />

    <el-tabs v-model="activeManagementTab" @tab-change="handleManagementTabChange">
      <el-tab-pane label="人员" name="staff">
        <el-table :data="data.staff" size="small" @row-click="loadStaffDraft">
          <el-table-column prop="jobId" label="工号" width="90" />
          <el-table-column prop="name" label="姓名" />
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="isAdmin" label="管理员" width="90" />
          <el-table-column prop="enabled" label="启用" width="80" />
          <el-table-column prop="sortOrder" label="排序" width="80" />
        </el-table>

        <div class="management-mobile-list">
          <button
            v-for="staff in data.staff"
            :key="staff.id"
            class="management-mobile-item management-mobile-staff"
            type="button"
            :disabled="staffSaving"
            @click="loadStaffDraft(staff)"
          >
            <span class="management-mobile-main">
              <strong>{{ staff.name }}</strong>
              <span>{{ staff.jobId }}</span>
            </span>
            <span class="management-mobile-meta">
              <span>{{ staffTypeLabel(staff.type) }}</span>
              <span>{{ staff.isAdmin ? "管理员" : "普通用户" }}</span>
              <span>{{ staff.enabled ? "启用" : "停用" }}</span>
            </span>
          </button>
        </div>

        <div class="management-form">
          <el-input v-model="staffDraft.jobId" placeholder="工号" :disabled="staffSaving" />
          <el-input v-model="staffDraft.name" placeholder="姓名" :disabled="staffSaving" />
          <el-select v-model="staffDraft.type" placeholder="类型" :disabled="staffSaving">
            <el-option label="护士" value="nurse" />
            <el-option label="文员" value="clerk" />
            <el-option label="护士长" value="head_nurse" />
          </el-select>
          <el-checkbox v-model="staffDraft.isAdmin" :disabled="staffSaving">指定管理员</el-checkbox>
          <el-checkbox v-model="staffDraft.enabled" :disabled="staffSaving">启用</el-checkbox>
          <el-input-number v-model="staffDraft.sortOrder" :min="0" :step="1" :disabled="staffSaving" />
          <div class="management-actions">
            <el-button :disabled="staffSaving" @click="resetStaffDraft">新增人员</el-button>
            <el-button
              type="primary"
              :disabled="staffSaving || !adminMode || !staffDraft.jobId || !staffDraft.name"
              :loading="staffSaving"
              @click="emit('saveStaff', { ...staffDraft })"
            >
              保存人员
            </el-button>
            <el-popconfirm
              title="确认删除该人员？仅未被排班、月结和账号引用的测试人员可删除。"
              @confirm="emit('deleteStaff', staffDraft.id)"
            >
              <template #reference>
                <el-button
                  v-if="isExistingStaffDraft"
                  data-testid="delete-staff-button"
                  type="danger"
                  :disabled="staffSaving || !adminMode"
                >
                  删除人员
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="班次" name="shift">
        <el-table :data="data.shifts" size="small" @row-click="loadShiftDraft">
          <el-table-column prop="shortName" label="简称" width="80" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="coefficient" label="系数" width="80" />
          <el-table-column prop="countsAttendance" label="计出勤" width="90" />
          <el-table-column prop="enabled" label="启用" width="80" />
          <el-table-column prop="sortOrder" label="排序" width="80" />
        </el-table>

        <div class="management-mobile-list">
          <button
            v-for="shift in data.shifts"
            :key="shift.id"
            class="management-mobile-item management-mobile-shift"
            type="button"
            :disabled="shiftSaving"
            @click="loadShiftDraft(shift)"
          >
            <span class="management-mobile-main">
              <strong>{{ shift.shortName }}</strong>
              <span>{{ shift.name }}</span>
            </span>
            <span class="management-mobile-meta">
              <span>系数 {{ shift.coefficient }}</span>
              <span>{{ shift.countsAttendance ? "计出勤" : "不计出勤" }}</span>
              <span>{{ shift.enabled ? "启用" : "停用" }}</span>
            </span>
          </button>
        </div>

        <div class="management-form">
          <el-input v-model="shiftDraft.name" placeholder="班次名称" :disabled="shiftSaving" />
          <el-input v-model="shiftDraft.shortName" placeholder="简称" :disabled="shiftSaving" />
          <el-color-picker v-model="shiftDraft.color" :disabled="shiftSaving" />
          <el-input-number v-model="shiftDraft.coefficient" :min="0" :step="0.1" :disabled="shiftSaving" />
          <el-checkbox v-model="shiftDraft.countsAttendance" :disabled="shiftSaving">计出勤</el-checkbox>
          <el-checkbox v-model="shiftDraft.enabled" :disabled="shiftSaving">启用</el-checkbox>
          <el-input-number v-model="shiftDraft.sortOrder" :min="0" :step="1" :disabled="shiftSaving" />
          <div class="management-actions">
            <el-button :disabled="shiftSaving" @click="resetShiftDraft">新增班次</el-button>
            <el-button
              type="primary"
              :disabled="shiftSaving || !adminMode || !shiftDraft.name || !shiftDraft.shortName"
              :loading="shiftSaving"
              @click="emit('saveShift', { ...shiftDraft })"
            >
              保存班次
            </el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="节假日" name="holiday">
        <el-table :data="data.holidays" size="small" @row-click="loadHolidayDraft">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="affectsRequiredAttendance" label="影响满勤" width="100" />
        </el-table>

        <div class="management-mobile-list">
          <button
            v-for="holiday in data.holidays"
            :key="holiday.id"
            class="management-mobile-item management-mobile-holiday"
            type="button"
            :disabled="holidaySaving"
            @click="loadHolidayDraft(holiday)"
          >
            <span class="management-mobile-main">
              <strong>{{ holiday.name }}</strong>
              <span>{{ holiday.date }}</span>
            </span>
            <span class="management-mobile-meta">
              <span>{{ holiday.affectsRequiredAttendance ? "影响满勤" : "不影响满勤" }}</span>
            </span>
          </button>
        </div>

        <div class="management-form">
          <el-date-picker
            v-model="holidayDraft.date"
            value-format="YYYY-MM-DD"
            placeholder="日期"
            :disabled="holidaySaving"
          />
          <el-input v-model="holidayDraft.name" placeholder="节假日名称" :disabled="holidaySaving" />
          <el-checkbox v-model="holidayDraft.affectsRequiredAttendance" :disabled="holidaySaving">影响满勤</el-checkbox>
          <div class="management-actions">
            <el-button :disabled="holidaySaving" @click="resetHolidayDraft">新增节假日</el-button>
            <el-button
              type="primary"
              :disabled="holidaySaving || !adminMode || !holidayDraft.date || !holidayDraft.name"
              :loading="holidaySaving"
              @click="emit('saveHoliday', { ...holidayDraft })"
            >
              保存节假日
            </el-button>
            <el-popconfirm title="确认删除该节假日？" @confirm="emit('deleteHoliday', holidayDraft.id)">
              <template #reference>
                <el-button type="danger" :disabled="holidaySaving || !adminMode || !isExistingHolidayDraft">
                  删除节假日
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="账号" name="user">
        <el-table :data="users" size="small" @row-click="loadUserDraft">
          <el-table-column prop="username" label="账号" width="110" />
          <el-table-column prop="displayName" label="显示名" />
          <el-table-column label="绑定人员" width="150">
            <template #default="{ row }">
              {{ staffBindingLabel(row.staffId) }}
            </template>
          </el-table-column>
          <el-table-column label="可管理人员" width="170">
            <template #default="{ row }">
              {{ row.role === "admin" ? "全部人员" : managedStaffLabel(row.managedStaffIds) }}
            </template>
          </el-table-column>
          <el-table-column prop="role" label="角色" width="110" />
          <el-table-column prop="enabled" label="启用" width="80" />
        </el-table>

        <div class="management-mobile-list">
          <button
            v-for="user in users"
            :key="user.id"
            class="management-mobile-item management-mobile-user"
            type="button"
            :disabled="userSaving"
            @click="loadUserDraft(user)"
          >
            <span class="management-mobile-main">
              <strong>{{ user.displayName }}</strong>
              <span>{{ user.username }}</span>
            </span>
            <span class="management-mobile-meta">
              <span>{{ roleLabel(user.role) }}</span>
              <span>{{ staffBindingLabel(user.staffId) }}</span>
              <span>{{ user.role === "admin" ? "管理全部人员" : managedStaffLabel(user.managedStaffIds) }}</span>
              <span>{{ user.enabled ? "启用" : "停用" }}</span>
            </span>
          </button>
        </div>

        <div class="management-form">
          <el-input v-model="userDraft.username" placeholder="账号" :disabled="userSaving || isExistingUserDraft" />
          <el-input v-model="userDraft.displayName" placeholder="显示名" :disabled="userSaving" />
          <el-select v-model="userDraft.staffId" placeholder="绑定人员" clearable :disabled="userSaving">
            <el-option label="未绑定" :value="null" />
            <el-option
              v-for="staff in bindableStaff"
              :key="staff.id"
              :label="`${staff.name} / ${staff.jobId} / ${staffTypeLabel(staff.type)}${staff.enabled ? '' : '（已停用）'}`"
              :value="staff.id"
            />
          </el-select>
          <p class="management-help-text">
            绑定人员只用于标识账号本人，不会自动授予排班权限；可管理人员决定排班和月结可操作范围。
          </p>
          <el-select v-model="userDraft.role" placeholder="角色" :disabled="userSaving">
            <el-option label="系统管理员" value="admin" />
            <el-option label="排班管理员" value="scheduler" />
            <el-option label="只读查看" value="viewer" />
          </el-select>
          <el-select
            v-if="userDraft.role === 'scheduler'"
            v-model="userDraft.managedStaffIds"
            placeholder="可管理人员"
            :multiple="true"
            clearable
            :disabled="userSaving"
          >
            <el-option
              v-for="staff in manageableStaff"
              :key="staff.id"
              :label="`${staff.name} / ${staff.jobId} / ${staffTypeLabel(staff.type)}${staff.enabled ? '' : '（已停用）'}`"
              :value="staff.id"
            />
          </el-select>
          <p v-if="userDraft.role === 'scheduler'" class="management-help-text">
            排班管理员需要选择可管理人员；未选择时只能查看，不能编辑任何人员。护士长需要参与排班管理时，请选择排班管理员并配置可管理人员。
          </p>
          <p v-else-if="userDraft.role === 'admin'" class="management-help-text">系统管理员默认管理全部人员。</p>
          <p v-else class="management-help-text">只读账号可以查看全科排班，但不能编辑排班和月结。</p>
          <el-checkbox v-model="userDraft.enabled" :disabled="userSaving">启用</el-checkbox>
          <el-input
            v-model="userDraft.password"
            type="password"
            placeholder="新账号初始密码 / 留空则不重置"
            show-password
            :disabled="userSaving"
          />
          <div class="management-actions">
            <el-button :disabled="userSaving" @click="resetUserDraft">新增账号</el-button>
            <el-button
              type="primary"
              data-testid="save-user-button"
              :disabled="userSaving || !adminMode || !userDraft.username || !userDraft.displayName || (!isExistingUserDraft && !userDraft.password)"
              :loading="userSaving"
              @click="emitSaveUser"
            >
              保存账号
            </el-button>
            <el-popconfirm
              title="确认删除该账号？仅建议删除误建或测试账号。删除后会清理登录会话、人员绑定和可管理人员关系，审计日志将保留。"
              @confirm="emit('deleteUser', userDraft.id)"
            >
              <template #reference>
                <el-button
                  v-if="isExistingUserDraft"
                  data-testid="delete-user-button"
                  type="danger"
                  :disabled="userSaving || !adminMode"
                >
                  删除账号
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="审计" name="audit">
        <div class="management-form audit-filter-form">
          <el-input v-model="auditFilters.username" placeholder="账号筛选" :disabled="auditLoading" />
          <el-input v-model="auditFilters.action" placeholder="操作类型" :disabled="auditLoading" />
          <el-input v-model="auditFilters.keyword" placeholder="关键词" :disabled="auditLoading" />
          <el-input-number v-model="auditFilters.limit" :min="1" :max="200" :step="10" :disabled="auditLoading" />
          <div class="management-actions">
            <el-button
              data-testid="refresh-latest-audit-logs"
              :loading="auditLoading"
              @click="emitRefreshLatestAuditLogs"
            >
              刷新最新
            </el-button>
            <el-button
              type="primary"
              data-testid="refresh-audit-logs"
              :loading="auditLoading"
              @click="emitRefreshAuditLogs"
            >
              按条件查询
            </el-button>
          </div>
        </div>

        <el-table :data="auditLogs" size="small" :empty-text="auditEmptyText">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">
              {{ formatAuditOccurredAt(row.occurredAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="username" label="账号" width="100" />
          <el-table-column prop="action" label="操作" width="150" />
          <el-table-column prop="summary" label="摘要" />
        </el-table>

        <p v-if="auditLogs.length === 0" class="management-empty-text">{{ auditEmptyText }}</p>
        <div v-else class="management-mobile-list">
          <article v-for="entry in auditLogs" :key="entry.id" class="management-mobile-item management-mobile-audit">
            <span class="management-mobile-main">
              <strong>{{ entry.summary }}</strong>
              <span>{{ formatAuditOccurredAt(entry.occurredAt) }}</span>
            </span>
            <span class="management-mobile-meta">
              <span>{{ entry.username }}</span>
              <span>{{ entry.action }}</span>
              <span>{{ entry.ip }}</span>
            </span>
          </article>
        </div>
      </el-tab-pane>
    </el-tabs>
  </component>
</template>

<style scoped>
.management-help-text {
  margin: -4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.management-empty-text {
  margin: 12px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
