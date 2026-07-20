import { Router, type NextFunction, type Request, type Response } from "express";
import { createMonthlySettlement } from "../src/lib/bonus";
import { calculateMonthlySummary } from "../src/lib/calculation";
import { addDays, getMonthDays, getWeekRange, listDateKeys } from "../src/lib/date";
import {
  applyScheduleImportPreview,
  validateScheduleImportText,
  type ScheduleImportApplyResult
} from "../src/lib/schedule-import";
import { validateScheduleShiftIds } from "../src/lib/validation";
import type { AppData, Holiday, ScheduleEntry, Shift, StaffMember } from "./types";
import type { StorageAdapter } from "./storage";
import { AuthStoreError, type AuditLogQuery, type AuthStore, type SaveAuthUserInput } from "./auth-store";
import { createMemoryAuthStore } from "./auth-store";
import type { AuthUser, PublicAuthUser, UserRole } from "./auth";
import { toPublicAuthUser } from "./auth";
import { canManageAllStaff, canManageStaff } from "./permissions";

type PublicAppData = AppData;

interface RouteOptions {
  adminPassword: string;
  authStore?: AuthStore;
  bootstrapAdminUsername?: string;
}

interface ScheduleEntryPayload {
  date: string;
  staffId: string;
  shiftIds: string[];
  note: string | null | undefined;
}

type CopyPreviousWeekMode = "skip" | "overwrite";

interface CopyPreviousWeekPayload {
  weekStart: string;
  mode: CopyPreviousWeekMode;
}

interface CopyPreviousWeekResult {
  copied: number;
  skipped: number;
}

interface ScheduleSwapWeekPayload {
  weekStart: string;
  sourceStaffId: string;
  targetStaffId: string;
}

interface ScheduleSwapWeekResult {
  swappedDays: number;
}

interface ScheduleImportPayload {
  rawText: string;
}

type ScheduleImportResponseResult = Omit<ScheduleImportApplyResult, "data">;

type BulkWeekOperation = "set-shift" | "clear";

type BulkWeekPayload =
  | {
      weekStart: string;
      operation: "set-shift";
      shiftId: string;
      mode: CopyPreviousWeekMode;
    }
  | {
      weekStart: string;
      operation: "clear";
    };

interface BulkWeekResult {
  updated: number;
  skipped: number;
}

type PayloadResult<T> = { ok: true; value: T } | { ok: false; message: string };
type AuthenticatedRequest = Request & { authUser?: AuthUser; authToken?: string };

const staffTypes = new Set(["nurse", "clerk", "head_nurse"]);
const userRoles = new Set<UserRole>(["admin", "scheduler", "viewer"]);
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

class HttpResponseError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

function handleRouteError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof HttpResponseError) {
    response.status(error.status).json({ message: error.message, ...error.details });
    return;
  }
  if (error instanceof AuthStoreError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  next(error);
}

function toPublicData(data: AppData): PublicAppData {
  return {
    ...data,
    settings: {
      defaultRequiredShiftsPerWeek: data.settings.defaultRequiredShiftsPerWeek,
      version: data.settings.version
    }
  };
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex === -1) {
    return [...items, next];
  }

  return items.map((item, index) => (index === existingIndex ? next : item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStaffType(value: unknown): value is StaffMember["type"] {
  return isString(value) && staffTypes.has(value);
}

function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHexColor(value: unknown): value is string {
  return isString(value) && /^#[0-9a-fA-F]{6}$/.test(value);
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function parseLoginPayload(body: unknown): { username: string; password: string } | null {
  if (!isRecord(body)) {
    return null;
  }

  const { username, password } = body;
  if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
    return null;
  }

  return {
    username: username.trim(),
    password
  };
}

function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "";
}

function getRequestUserAgent(request: Request): string {
  return request.header("user-agent") ?? "";
}

function canRoleAccess(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

function isUserRole(value: unknown): value is UserRole {
  return isString(value) && userRoles.has(value as UserRole);
}

function toManagedAuthUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    staffId: user.staffId,
    managedStaffIds: [...user.managedStaffIds],
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function getRouteParam(request: Request, name: string): string {
  const value = request.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getQueryParam(request: Request, name: string): string {
  const value = request.query[name];
  if (Array.isArray(value)) {
    const firstValue = value[0];
    return typeof firstValue === "string" ? firstValue : "";
  }

  return typeof value === "string" ? value : "";
}

function parseAuditQuery(request: Request): AuditLogQuery {
  const limitText = getQueryParam(request, "limit");
  const pageText = getQueryParam(request, "page");
  const pageSizeText = getQueryParam(request, "pageSize");
  const parsedLimit = limitText ? Number(limitText) : 100;
  const parsedPage = pageText ? Number(pageText) : 1;
  const parsedPageSize = pageSizeText ? Number(pageSizeText) : limitText ? parsedLimit : 20;
  return {
    username: getQueryParam(request, "username"),
    action: getQueryParam(request, "action"),
    keyword: getQueryParam(request, "keyword"),
    limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
    page: Number.isFinite(parsedPage) ? parsedPage : 1,
    pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : 20
  };
}

function normalizeAuditPagination(query: AuditLogQuery): { page: number; pageSize: number } {
  const page = Math.max(Math.floor(query.page ?? 1), 1);
  const requestedPageSize = Math.floor(query.pageSize ?? query.limit ?? 20);
  return {
    page,
    pageSize: Math.min(Math.max(Number.isFinite(requestedPageSize) ? requestedPageSize : 20, 1), 100)
  };
}

function parseUserPayload(body: unknown, id: string): SaveAuthUserInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const { username, displayName, role, enabled, password, staffId, managedStaffIds } = body;
  if (!isNonEmptyString(username) || !isNonEmptyString(displayName) || !isUserRole(role) || !isBoolean(enabled)) {
    return null;
  }

  let parsedPassword: string | null | undefined;
  if (password === undefined || password === null || password === "") {
    parsedPassword = undefined;
  } else if (isString(password)) {
    if (password.trim().length < 6) {
      return null;
    }
    parsedPassword = password;
  } else {
    return null;
  }

  let parsedStaffId: string | null;
  if (staffId === undefined || staffId === null) {
    parsedStaffId = null;
  } else if (isString(staffId)) {
    parsedStaffId = staffId.trim() || null;
  } else {
    return null;
  }

  let parsedManagedStaffIds: string[];
  if (managedStaffIds === undefined) {
    parsedManagedStaffIds = [];
  } else if (isStringArray(managedStaffIds)) {
    parsedManagedStaffIds = managedStaffIds.map((staffId) => staffId.trim()).filter(Boolean);
  } else {
    return null;
  }

  return {
    id,
    username: username.trim(),
    displayName: displayName.trim(),
    role,
    enabled,
    password: parsedPassword,
    staffId: parsedStaffId,
    managedStaffIds: parsedManagedStaffIds
  };
}

function formatStaffBindingLabel(staff: StaffMember): string {
  const disabledSuffix = staff.enabled ? "" : "，已停用";
  return `${staff.name}(${staff.jobId}${disabledSuffix})`;
}

function formatManagedStaffSummary(user: AuthUser, managedStaff: StaffMember[]): string {
  if (user.role === "admin") {
    return "可管理人员：全部人员";
  }

  if (user.role === "viewer") {
    return "可管理人员：只读账号不配置";
  }

  if (managedStaff.length === 0) {
    return "可管理人员：未配置";
  }

  return `可管理人员：${managedStaff.map(formatStaffBindingLabel).join("、")}`;
}

function formatUserSaveSummary(user: AuthUser, staff: StaffMember | null, managedStaff: StaffMember[]): string {
  const bindingText = user.staffId
    ? staff
      ? `绑定人员：${formatStaffBindingLabel(staff)}`
      : `绑定人员：${user.staffId}`
    : "未绑定人员";
  return `保存账号：${user.username}，${bindingText}，${formatManagedStaffSummary(user, managedStaff)}`;
}

function formatUserDeleteSummary(user: AuthUser): string {
  return `删除账号：${user.username}，显示名：${user.displayName}，角色：${user.role}`;
}

function assertStaffCanBeDeleted(data: AppData, users: AuthUser[], staff: StaffMember): void {
  if (data.scheduleEntries.some((entry) => entry.staffId === staff.id)) {
    throw new HttpResponseError(400, `人员已有历史排班或月结记录，不能删除，请停用人员：${staff.name}`);
  }

  if (data.monthlySettlements.some((settlement) => settlement.rows.some((row) => row.staffId === staff.id))) {
    throw new HttpResponseError(400, `人员已有历史排班或月结记录，不能删除，请停用人员：${staff.name}`);
  }

  if (users.some((user) => user.staffId === staff.id || user.managedStaffIds.includes(staff.id))) {
    throw new HttpResponseError(400, `人员已被账号绑定或纳入可管理人员，请先调整账号后再删除：${staff.name}`);
  }
}

function validateUserStaffBinding(
  data: AppData,
  users: AuthUser[],
  payload: SaveAuthUserInput
): StaffMember | null {
  if (!payload.staffId) {
    return null;
  }

  const staff = data.staff.find((item) => item.id === payload.staffId);
  if (!staff) {
    throw new HttpResponseError(400, "绑定人员不存在");
  }

  const existingUser = users.find((user) => user.id === payload.id || user.username === payload.username);
  const keepsOriginalBinding = existingUser?.staffId === payload.staffId;
  if (!staff.enabled && !keepsOriginalBinding) {
    throw new HttpResponseError(400, "只能绑定启用人员");
  }

  return staff;
}

function validateManagedStaffIds(
  data: AppData,
  existingUser: AuthUser | undefined,
  payload: SaveAuthUserInput
): StaffMember[] {
  const ids = payload.role === "scheduler" ? (payload.managedStaffIds ?? []) : [];
  if (new Set(ids).size !== ids.length) {
    throw new HttpResponseError(400, "可管理人员不能重复");
  }

  return ids.map((staffId) => {
    const staff = data.staff.find((item) => item.id === staffId);
    if (!staff) {
      throw new HttpResponseError(400, "可管理人员不存在");
    }

    const keepsOriginalManagedStaff = existingUser?.managedStaffIds.includes(staffId) ?? false;
    if (!staff.enabled && !keepsOriginalManagedStaff) {
      throw new HttpResponseError(400, "只能选择启用人员作为可管理人员");
    }

    return staff;
  });
}

function parsePasswordChangePayload(body: unknown): { currentPassword: string; newPassword: string } | null {
  if (!isRecord(body)) {
    return null;
  }

  const { currentPassword, newPassword } = body;
  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword) || newPassword.trim().length < 6) {
    return null;
  }

  return { currentPassword, newPassword };
}

function parseStaffPayload(body: unknown, id: string): StaffMember | null {
  if (!isRecord(body)) {
    return null;
  }

  const { jobId, name, type, isAdmin, enabled, sortOrder } = body;
  if (
    !isNonEmptyString(jobId) ||
    !isNonEmptyString(name) ||
    !isStaffType(type) ||
    !isBoolean(isAdmin) ||
    !isBoolean(enabled) ||
    !isNonNegativeInteger(sortOrder)
  ) {
    return null;
  }

  return { id, jobId: jobId.trim(), name: name.trim(), type, isAdmin, enabled, sortOrder };
}

function parseStaffOrderPayload(body: unknown): string[] | null {
  if (!isRecord(body) || !Array.isArray(body.staffIds)) {
    return null;
  }

  const staffIds: string[] = [];
  for (const staffId of body.staffIds) {
    if (!isNonEmptyString(staffId)) {
      return null;
    }

    staffIds.push(staffId.trim());
  }

  const uniqueStaffIds = new Set(staffIds);
  if (uniqueStaffIds.size !== staffIds.length) {
    return null;
  }

  return staffIds;
}

function parseShiftPayload(body: unknown, id: string): Shift | null {
  if (!isRecord(body)) {
    return null;
  }

  const { name, shortName, color, countsAttendance, coefficient, enabled, sortOrder } = body;
  if (
    !isNonEmptyString(name) ||
    !isNonEmptyString(shortName) ||
    !isHexColor(color) ||
    !isBoolean(countsAttendance) ||
    !isNonNegativeNumber(coefficient) ||
    !isBoolean(enabled) ||
    !isNonNegativeInteger(sortOrder)
  ) {
    return null;
  }

  return { id, name: name.trim(), shortName: shortName.trim(), color, countsAttendance, coefficient, enabled, sortOrder };
}

function parseHolidayPayload(body: unknown, id: string): Holiday | null {
  if (!isRecord(body)) {
    return null;
  }

  const { date, name, affectsRequiredAttendance } = body;
  if (!isString(date) || !isNonEmptyString(name) || !isBoolean(affectsRequiredAttendance)) {
    return null;
  }

  return { id, date, name: name.trim(), affectsRequiredAttendance };
}

function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

function isMonthSettled(data: AppData, month: string): boolean {
  return data.monthlySettlements.some((settlement) => settlement.month === month);
}

function parseMonthlySettlementPayload(body: unknown): { month: string; bonusPool: number } {
  if (!isRecord(body)) {
    throw new HttpResponseError(400, "月结信息不完整");
  }

  const { month, bonusPool } = body;
  if (!isString(month) || !MONTH_PATTERN.test(month)) {
    throw new HttpResponseError(400, "月结信息不完整");
  }
  if (!isNumber(bonusPool) || bonusPool < 0) {
    throw new HttpResponseError(400, "月结信息不完整");
  }

  return {
    month,
    bonusPool
  };
}

function parseScheduleEntryPayload(body: unknown): PayloadResult<ScheduleEntryPayload> {
  if (!isRecord(body)) {
    return { ok: false, message: "排班信息不完整" };
  }

  const { date, staffId, shiftIds, note } = body;
  if (!isNonEmptyString(date) || !isNonEmptyString(staffId) || !isStringArray(shiftIds)) {
    return { ok: false, message: "排班信息不完整" };
  }

  let parsedNote: string | null | undefined;
  if (note === undefined) {
    parsedNote = undefined;
  } else if (note === null) {
    parsedNote = null;
  } else if (isString(note)) {
    parsedNote = note;
  } else {
    return { ok: false, message: "备注格式不正确" };
  }

  return { ok: true, value: { date, staffId, shiftIds, note: parsedNote } };
}

function parseScheduleImportPayload(body: unknown): ScheduleImportPayload {
  if (!isRecord(body) || !isNonEmptyString(body.rawText)) {
    throw new HttpResponseError(400, "导入内容不能为空");
  }

  return { rawText: body.rawText };
}

function parseCopyPreviousWeekPayload(body: unknown): PayloadResult<CopyPreviousWeekPayload> {
  if (!isRecord(body)) {
    return { ok: false, message: "复制排班信息不完整" };
  }

  const { weekStart, mode } = body;
  if (!isNonEmptyString(weekStart) || (mode !== "skip" && mode !== "overwrite")) {
    return { ok: false, message: "复制排班信息不完整" };
  }

  return {
    ok: true,
    value: {
      weekStart,
      mode
    }
  };
}

function parseBulkWeekPayload(body: unknown): PayloadResult<BulkWeekPayload> {
  if (!isRecord(body)) {
    return { ok: false, message: "批量排班信息不完整" };
  }

  const { weekStart, operation, shiftId, mode } = body;
  if (!isNonEmptyString(weekStart) || (operation !== "set-shift" && operation !== "clear")) {
    return { ok: false, message: "批量排班信息不完整" };
  }

  if (operation === "set-shift") {
    if (!isNonEmptyString(shiftId) || (mode !== undefined && mode !== "skip" && mode !== "overwrite")) {
      return { ok: false, message: "批量排班信息不完整" };
    }
    const parsedMode: CopyPreviousWeekMode = mode === "skip" ? "skip" : "overwrite";

    return {
      ok: true,
      value: {
        weekStart,
        operation,
        shiftId,
        mode: parsedMode
      }
    };
  }

  return {
    ok: true,
    value: {
      weekStart,
      operation
    }
  };
}

function parseScheduleSwapWeekPayload(body: unknown): PayloadResult<ScheduleSwapWeekPayload> {
  if (!isRecord(body)) {
    return { ok: false, message: "排班排序信息不完整" };
  }

  const { weekStart, sourceStaffId, targetStaffId } = body;
  if (!isNonEmptyString(weekStart) || !isNonEmptyString(sourceStaffId) || !isNonEmptyString(targetStaffId)) {
    return { ok: false, message: "排班排序信息不完整" };
  }
  if (sourceStaffId === targetStaffId) {
    return { ok: false, message: "排班排序信息不完整" };
  }

  return {
    ok: true,
    value: {
      weekStart,
      sourceStaffId,
      targetStaffId
    }
  };
}

function copyPreviousWeekEntries(
  data: AppData,
  user: AuthUser | undefined,
  weekStart: string,
  mode: CopyPreviousWeekMode
): { data: AppData; result: CopyPreviousWeekResult } {
  const weekRange = getWeekRange(weekStart);
  const targetDates = listDateKeys(weekRange.start, weekRange.end);
  const sourceDatesByTarget = new Map(targetDates.map((targetDate) => [targetDate, addDays(targetDate, -7)]));
  const enabledManageableStaff = data.staff.filter((staff) => staff.enabled && canManageStaff(user, staff.id));
  const enabledManageableStaffIds = new Set(enabledManageableStaff.map((staff) => staff.id));
  const sourceDates = new Set(sourceDatesByTarget.values());
  const entriesById = new Map(data.scheduleEntries.map((entry) => [entry.id, entry]));
  let copied = 0;
  let skipped = 0;

  for (const sourceEntry of data.scheduleEntries) {
    if (!sourceDates.has(sourceEntry.date) || !enabledManageableStaffIds.has(sourceEntry.staffId)) {
      continue;
    }

    const targetDate = addDays(sourceEntry.date, 7);
    if (!sourceDatesByTarget.has(targetDate)) {
      continue;
    }

    const targetId = `${targetDate}__${sourceEntry.staffId}`;
    if (mode === "skip" && entriesById.has(targetId)) {
      skipped += 1;
      continue;
    }

    if (isMonthSettled(data, getMonthKey(targetDate))) {
      throw new HttpResponseError(400, "该月份已月结，不能修改排班");
    }

    const validation = validateScheduleShiftIds(sourceEntry.shiftIds, data.shifts);
    if (!validation.ok) {
      throw new HttpResponseError(400, validation.message);
    }

    const nextEntry: ScheduleEntry = {
      id: targetId,
      date: targetDate,
      staffId: sourceEntry.staffId,
      shiftIds: [...sourceEntry.shiftIds],
      note: sourceEntry.note ?? ""
    };
    entriesById.set(targetId, nextEntry);
    copied += 1;
  }

  return {
    data: {
      ...data,
      scheduleEntries: [...entriesById.values()]
    },
    result: { copied, skipped }
  };
}

function bulkUpdateWeekEntries(data: AppData, user: AuthUser | undefined, payload: BulkWeekPayload): {
  data: AppData;
  result: BulkWeekResult;
} {
  const weekRange = getWeekRange(payload.weekStart);
  const targetDates = listDateKeys(weekRange.start, weekRange.end);
  for (const targetDate of targetDates) {
    if (isMonthSettled(data, getMonthKey(targetDate))) {
      throw new HttpResponseError(400, "该月份已月结，不能修改排班");
    }
  }

  const enabledManageableStaffIds = new Set(
    data.staff.filter((staff) => staff.enabled && canManageStaff(user, staff.id)).map((staff) => staff.id)
  );
  const entriesById = new Map(data.scheduleEntries.map((entry) => [entry.id, entry]));
  let updated = 0;
  let skipped = 0;

  if (payload.operation === "set-shift") {
    const validation = validateScheduleShiftIds([payload.shiftId], data.shifts);
    if (!validation.ok) {
      throw new HttpResponseError(400, validation.message);
    }

    for (const staffId of enabledManageableStaffIds) {
      for (const targetDate of targetDates) {
        const targetId = `${targetDate}__${staffId}`;
        if (payload.mode === "skip" && entriesById.has(targetId)) {
          skipped += 1;
          continue;
        }

        entriesById.set(targetId, {
          id: targetId,
          date: targetDate,
          staffId,
          shiftIds: [payload.shiftId],
          note: ""
        });
        updated += 1;
      }
    }
  } else {
    for (const staffId of enabledManageableStaffIds) {
      for (const targetDate of targetDates) {
        const targetId = `${targetDate}__${staffId}`;
        if (entriesById.delete(targetId)) {
          updated += 1;
        }
      }
    }
  }

  return {
    data: {
      ...data,
      scheduleEntries: [...entriesById.values()]
    },
    result: { updated, skipped }
  };
}

function swapWeekScheduleEntries(
  data: AppData,
  user: AuthUser | undefined,
  payload: ScheduleSwapWeekPayload
): { data: AppData; result: ScheduleSwapWeekResult } {
  const weekRange = getWeekRange(payload.weekStart);
  const targetDates = listDateKeys(weekRange.start, weekRange.end);
  for (const targetDate of targetDates) {
    if (isMonthSettled(data, getMonthKey(targetDate))) {
      throw new HttpResponseError(400, "该月份已月结，不能修改排班");
    }
  }

  const sourceStaff = data.staff.find((staff) => staff.id === payload.sourceStaffId);
  const targetStaff = data.staff.find((staff) => staff.id === payload.targetStaffId);
  if (!sourceStaff || !targetStaff) {
    throw new HttpResponseError(400, "人员不存在");
  }
  if (!sourceStaff.enabled || !targetStaff.enabled) {
    throw new HttpResponseError(400, "人员已停用，不能调整排班排序");
  }
  if (!canManageStaff(user, sourceStaff.id) || !canManageStaff(user, targetStaff.id)) {
    throw new HttpResponseError(403, "当前账号没有该人员操作权限");
  }

  const entriesById = new Map(data.scheduleEntries.map((entry) => [entry.id, entry]));
  let swappedDays = 0;

  for (const targetDate of targetDates) {
    const sourceEntryId = `${targetDate}__${sourceStaff.id}`;
    const targetEntryId = `${targetDate}__${targetStaff.id}`;
    const sourceEntry = entriesById.get(sourceEntryId);
    const targetEntry = entriesById.get(targetEntryId);
    if (!sourceEntry && !targetEntry) {
      continue;
    }

    entriesById.delete(sourceEntryId);
    entriesById.delete(targetEntryId);

    if (targetEntry) {
      entriesById.set(sourceEntryId, {
        ...targetEntry,
        id: sourceEntryId,
        date: targetDate,
        staffId: sourceStaff.id,
        shiftIds: [...targetEntry.shiftIds],
        note: targetEntry.note ?? ""
      });
    }

    if (sourceEntry) {
      entriesById.set(targetEntryId, {
        ...sourceEntry,
        id: targetEntryId,
        date: targetDate,
        staffId: targetStaff.id,
        shiftIds: [...sourceEntry.shiftIds],
        note: sourceEntry.note ?? ""
      });
    }

    swappedDays += 1;
  }

  return {
    data: {
      ...data,
      scheduleEntries: [...entriesById.values()]
    },
    result: { swappedDays }
  };
}

export function createRoutes(storage: StorageAdapter, options: RouteOptions): Router {
  const adminPassword = options.adminPassword.trim();
  if (!adminPassword) {
    throw new Error("管理员密码未配置");
  }

  const router = Router();
  const authStore = options.authStore ?? createMemoryAuthStore();
  const bootstrapAdminUsername = options.bootstrapAdminUsername ?? "admin";

  async function ensureBootstrapAdmin() {
    await authStore.ensureBootstrapAdmin({ username: bootstrapAdminUsername, password: adminPassword });
  }

  async function recordAudit(
    request: Request,
    action: string,
    targetType: string,
    targetId: string,
    summary: string,
    actor: AuthUser | null = (request as AuthenticatedRequest).authUser ?? null
  ) {
    await authStore.recordAudit({
      action,
      actor,
      targetType,
      targetId,
      summary,
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request)
    });
  }

  async function authenticateRequest(request: AuthenticatedRequest): Promise<boolean> {
    const token = parseBearerToken(request.header("Authorization"));
    if (!token) {
      return false;
    }

    const session = await authStore.getSession(token);
    if (!session) {
      return false;
    }

    request.authUser = session.user;
    request.authToken = token;
    return true;
  }

  function requireRoles(allowedRoles: UserRole[]) {
    return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
      try {
        if (!(await authenticateRequest(request))) {
          response.status(401).json({ message: "请先登录" });
          return;
        }

        if (!request.authUser || !canRoleAccess(request.authUser.role, allowedRoles)) {
          response.status(403).json({ message: "当前账号没有操作权限" });
          return;
        }

        next();
      } catch (error) {
        handleRouteError(error, response, next);
      }
    };
  }

  const requireAdmin = requireRoles(["admin"]);
  const requireScheduler = requireRoles(["admin", "scheduler"]);
  const requireAuthenticated = requireRoles(["admin", "scheduler", "viewer"]);

  async function denyStaffScope(request: Request, response: Response, staffId: string): Promise<void> {
    await recordAudit(request, "auth.permission.denied", "staff", staffId, `越权操作人员：${staffId}`);
    response.status(403).json({ message: "当前账号没有该人员操作权限" });
  }

  router.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  router.get("/data", requireAuthenticated, async (_request, response, next) => {
    try {
      const data = await storage.load();
      response.json(toPublicData(data));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  async function respondWithSession(
    request: Request,
    response: Response,
    user: AuthUser
  ): Promise<Response<{ ok: true; token: string; user: PublicAuthUser; expiresAt: string }>> {
    const session = await authStore.createSession(user.id);
    await recordAudit(request, "auth.login.success", "user", user.id, `用户 ${user.username} 登录成功`, user);
    return response.json({
      ok: true,
      token: session.token,
      user: toPublicAuthUser(user),
      expiresAt: session.expiresAt
    });
  }

  router.post("/auth/login", async (request, response, next) => {
    try {
      await ensureBootstrapAdmin();
      const payload = parseLoginPayload(request.body);
      if (!payload) {
        response.status(401).json({ ok: false, message: "用户名或密码不正确" });
        return;
      }

      const user = await authStore.authenticate(payload.username, payload.password);
      if (!user) {
        await recordAudit(
          request,
          "auth.login.failure",
          "user",
          payload.username,
          `用户 ${payload.username} 登录失败`,
          null
        );
        response.status(401).json({ ok: false, message: "用户名或密码不正确" });
        return;
      }

      await respondWithSession(request, response, user);
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/admin/session", async (request, response, next) => {
    try {
      await ensureBootstrapAdmin();
      if (request.body?.password === adminPassword) {
        const user = await authStore.authenticate(bootstrapAdminUsername, adminPassword);
        if (user) {
          await respondWithSession(request, response, user);
          return;
        }
      }

      await recordAudit(request, "auth.login.failure", "user", bootstrapAdminUsername, "管理密码登录失败", null);
      response.status(401).json({ ok: false, message: "管理密码不正确" });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.get("/auth/me", async (request: AuthenticatedRequest, response, next) => {
    try {
      if (!(await authenticateRequest(request)) || !request.authUser) {
        response.status(401).json({ message: "请先登录" });
        return;
      }

      response.json({ user: toPublicAuthUser(request.authUser) });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/auth/logout", async (request: AuthenticatedRequest, response, next) => {
    try {
      if (!(await authenticateRequest(request)) || !request.authToken || !request.authUser) {
        response.status(401).json({ message: "请先登录" });
        return;
      }

      const user = request.authUser;
      await authStore.revokeSession(request.authToken);
      await recordAudit(request, "auth.logout", "user", user.id, `用户 ${user.username} 退出登录`, user);
      response.json({ ok: true });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/auth/password", async (request: AuthenticatedRequest, response, next) => {
    try {
      if (!(await authenticateRequest(request)) || !request.authUser) {
        response.status(401).json({ message: "请先登录" });
        return;
      }

      const payload = parsePasswordChangePayload(request.body);
      if (!payload) {
        response.status(400).json({ message: "密码信息不完整" });
        return;
      }

      const passwordChanged = await authStore.changePassword({
        userId: request.authUser.id,
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword
      });
      if (!passwordChanged) {
        response.status(400).json({ message: "当前密码不正确" });
        return;
      }

      await recordAudit(
        request,
        "auth.password.change",
        "user",
        request.authUser.id,
        `用户 ${request.authUser.username} 修改密码`
      );
      response.json({ ok: true });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.get("/users", requireAdmin, async (_request, response, next) => {
    try {
      const users = await authStore.listUsers();
      response.json({ rows: users.map(toManagedAuthUser) });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/users/:id", requireAdmin, async (request: AuthenticatedRequest, response, next) => {
    try {
      const userId = getRouteParam(request, "id");
      const payload = parseUserPayload(request.body, userId);
      if (!payload) {
        response.status(400).json({ message: "账号信息不完整" });
        return;
      }

      const saveResult: { bindingStaff: StaffMember | null; managedStaff: StaffMember[]; user: AuthUser | null } = {
        bindingStaff: null,
        managedStaff: [],
        user: null
      };
      await storage.update(async (data) => {
        const users = await authStore.listUsers();
        const existingUser = users.find((user) => user.id === payload.id || user.username === payload.username);
        saveResult.bindingStaff = validateUserStaffBinding(data, users, payload);
        saveResult.managedStaff = validateManagedStaffIds(data, existingUser, payload);
        saveResult.user = await authStore.saveUser({
          ...payload,
          managedStaffIds: payload.role === "scheduler" ? payload.managedStaffIds : [],
          managedStaffUpdatedBy: request.authUser?.id ?? null
        });
        return data;
      });
      const user = saveResult.user;
      if (!user) {
        throw new Error("账号保存失败");
      }

      await recordAudit(
        request,
        "user.save",
        "user",
        user.id,
        formatUserSaveSummary(user, saveResult.bindingStaff, saveResult.managedStaff)
      );
      response.json({ user: toManagedAuthUser(user) });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.delete("/users/:id", requireAdmin, async (request: AuthenticatedRequest, response, next) => {
    try {
      const userId = getRouteParam(request, "id");
      const deletedUser = await authStore.deleteUser({
        userId,
        actorUserId: request.authUser!.id,
        bootstrapUsername: bootstrapAdminUsername
      });
      await recordAudit(
        request,
        "user.delete",
        "user",
        deletedUser.id,
        formatUserDeleteSummary(deletedUser)
      );
      response.json({ ok: true });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.get("/audit-logs", requireAdmin, async (request, response, next) => {
    try {
      const query = parseAuditQuery(request);
      const { page, pageSize } = normalizeAuditPagination(query);
      const normalizedQuery = { ...query, page, pageSize };
      const [rows, total] = await Promise.all([
        authStore.listAuditLogs(normalizedQuery),
        authStore.countAuditLogs(normalizedQuery)
      ]);
      response.json({ rows, total, page, pageSize });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/staff-order", requireAdmin, async (request, response, next) => {
    try {
      const staffIds = parseStaffOrderPayload(request.body);
      if (!staffIds) {
        response.status(400).json({ message: "人员排序信息不完整" });
        return;
      }

      const nextData = await storage.update((data) => {
        if (staffIds.length !== data.staff.length) {
          throw new HttpResponseError(400, "人员排序必须包含全部人员");
        }

        const staffById = new Map(data.staff.map((staff) => [staff.id, staff]));
        const staff = staffIds.map((staffId, index) => {
          const staffMember = staffById.get(staffId);
          if (!staffMember) {
            throw new HttpResponseError(400, "人员排序包含不存在的人员");
          }

          return { ...staffMember, sortOrder: index + 1 };
        });

        return {
          ...data,
          staff
        };
      });

      const summary = `调整人员排序：${nextData.staff.map((staff, index) => `${index + 1}.${staff.name}`).join("、")}`;
      await recordAudit(request, "data.staff.order", "staff", "order", summary);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/staff/:id", requireAdmin, async (request, response, next) => {
    try {
      const staffId = getRouteParam(request, "id");
      const staffMember = parseStaffPayload(request.body, staffId);
      if (!staffMember) {
        response.status(400).json({ message: "人员信息不完整" });
        return;
      }

      const nextData = await storage.update((data) => ({
        ...data,
        staff: upsertById(data.staff, staffMember)
      }));
      await recordAudit(request, "data.staff.save", "staff", staffMember.id, `保存人员：${staffMember.name}`);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.delete("/data/staff/:id", requireAdmin, async (request, response, next) => {
    try {
      const staffId = getRouteParam(request, "id");
      let deletedStaff: StaffMember | undefined;

      const nextData = await storage.update(async (data) => {
        const staff = data.staff.find((item) => item.id === staffId);
        if (!staff) {
          throw new HttpResponseError(404, "人员不存在");
        }

        const users = await authStore.listUsers();
        assertStaffCanBeDeleted(data, users, staff);
        deletedStaff = staff;

        return {
          ...data,
          staff: data.staff.filter((item) => item.id !== staffId)
        };
      });

      const staffForAudit = deletedStaff;
      if (!staffForAudit) {
        throw new Error("人员删除失败");
      }

      await recordAudit(request, "data.staff.delete", "staff", staffForAudit.id, `删除人员：${staffForAudit.name}`);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/shift/:id", requireAdmin, async (request, response, next) => {
    try {
      const shiftId = getRouteParam(request, "id");
      const shift = parseShiftPayload(request.body, shiftId);
      if (!shift) {
        response.status(400).json({ message: "班次信息不完整" });
        return;
      }

      const nextData = await storage.update((data) => ({
        ...data,
        shifts: upsertById(data.shifts, shift)
      }));
      await recordAudit(request, "data.shift.save", "shift", shift.id, `保存班次：${shift.name}`);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/holiday/:id", requireAdmin, async (request, response, next) => {
    try {
      const holidayId = getRouteParam(request, "id");
      const holiday = parseHolidayPayload(request.body, holidayId);
      if (!holiday) {
        response.status(400).json({ message: "节假日信息不完整" });
        return;
      }
      if (!isValidDateKey(holiday.date)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      const nextData = await storage.update((data) => {
        const hasDuplicateDate = data.holidays.some((item) => item.id !== holiday.id && item.date === holiday.date);
        if (hasDuplicateDate) {
          throw new HttpResponseError(400, "节假日日期不能重复");
        }

        return {
          ...data,
          holidays: upsertById(data.holidays, holiday)
        };
      });
      await recordAudit(request, "data.holiday.save", "holiday", holiday.id, `保存节假日：${holiday.name}`);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.delete("/data/holiday/:id", requireAdmin, async (request, response, next) => {
    try {
      const holidayId = getRouteParam(request, "id");
      const nextData = await storage.update((data) => {
        const holidays = data.holidays.filter((holiday) => holiday.id !== holidayId);
        if (holidays.length === data.holidays.length) {
          throw new HttpResponseError(404, "节假日不存在");
        }

        return {
          ...data,
          holidays
        };
      });
      await recordAudit(request, "data.holiday.delete", "holiday", holidayId, `删除节假日：${holidayId}`);
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/schedule-entry", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseScheduleEntryPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      const { date, staffId, shiftIds, note } = payload.value;
      if (!isValidDateKey(date)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      if (!canManageStaff(request.authUser, staffId)) {
        await denyStaffScope(request, response, staffId);
        return;
      }

      const nextData = await storage.update((data) => {
        if (isMonthSettled(data, getMonthKey(date))) {
          throw new HttpResponseError(400, "该月份已月结，不能修改排班");
        }

        const staffMember = data.staff.find((staff) => staff.id === staffId);
        if (!staffMember) {
          throw new HttpResponseError(400, `人员不存在：${staffId}`);
        }
        if (!staffMember.enabled && shiftIds.length > 0) {
          throw new HttpResponseError(400, `人员已停用，不能新增排班：${staffMember.name}`);
        }

        const validation = validateScheduleShiftIds(shiftIds, data.shifts);
        if (!validation.ok) {
          throw new HttpResponseError(400, validation.message);
        }

        const id = `${date}__${staffId}`;
        const remainingEntries = data.scheduleEntries.filter((entry) => entry.id !== id);
        const scheduleEntries =
          shiftIds.length === 0
            ? remainingEntries
            : [
                ...remainingEntries,
                {
                  id,
                  date,
                  staffId,
                  shiftIds,
                  note: note ?? ""
                }
              ];

        return {
          ...data,
          scheduleEntries
        };
      });
      await recordAudit(
        request,
        "data.schedule_entry.save",
        "schedule_entry",
        `${date}__${staffId}`,
        `保存排班：${date} ${staffId}`
      );
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/data/schedule-import/preview", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseScheduleImportPayload(request.body);
      const data = await storage.load();
      const preview = validateScheduleImportText({ rawText: payload.rawText, data });

      if (preview.ok === false) {
        response.status(400).json({ message: "导入数据校验失败", errors: preview.errors });
        return;
      }

      const deniedStaff = preview.rows.find((row) => !canManageStaff(request.authUser, row.staffId));
      if (deniedStaff) {
        await denyStaffScope(request, response, deniedStaff.staffId);
        return;
      }

      response.json({ preview });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/data/schedule-import", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseScheduleImportPayload(request.body);
      const initialData = await storage.load();
      const initialPreview = validateScheduleImportText({ rawText: payload.rawText, data: initialData });

      if (initialPreview.ok === false) {
        response.status(400).json({ message: "导入数据校验失败", errors: initialPreview.errors });
        return;
      }

      const deniedStaff = initialPreview.rows.find((row) => !canManageStaff(request.authUser, row.staffId));
      if (deniedStaff) {
        await denyStaffScope(request, response, deniedStaff.staffId);
        return;
      }

      if (initialPreview.noImportableCells) {
        response.status(400).json({ message: "没有可导入内容" });
        return;
      }

      const responseResultHolder: { value?: ScheduleImportResponseResult } = {};
      const nextData = await storage.update((data) => {
        const preview = validateScheduleImportText({ rawText: payload.rawText, data });
        if (preview.ok === false) {
          throw new HttpResponseError(400, "导入数据校验失败", { errors: preview.errors });
        }

        const scopedDeniedStaff = preview.rows.find((row) => !canManageStaff(request.authUser, row.staffId));
        if (scopedDeniedStaff) {
          throw new HttpResponseError(403, "当前账号没有该人员操作权限");
        }

        if (preview.noImportableCells) {
          throw new HttpResponseError(400, "没有可导入内容");
        }

        const applied = applyScheduleImportPreview(data, preview);
        responseResultHolder.value = {
          imported: applied.imported,
          skipped: applied.skipped,
          aliasMapped: applied.aliasMapped,
          staffCount: applied.staffCount,
          periodStart: applied.periodStart,
          periodEnd: applied.periodEnd
        };
        return applied.data;
      });

      const responseResult = responseResultHolder.value;
      if (!responseResult) {
        throw new HttpResponseError(400, "没有可导入内容");
      }

      await recordAudit(
        request,
        "data.schedule_import",
        "schedule_import",
        `${responseResult.periodStart}__${responseResult.periodEnd}`,
        `导入排班：${responseResult.periodStart} 至 ${responseResult.periodEnd}，${responseResult.staffCount} 人，写入 ${responseResult.imported} 个，跳过 ${responseResult.skipped} 个，别名 ${responseResult.aliasMapped} 个`
      );
      response.json({ data: toPublicData(nextData), result: responseResult });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/data/schedule-copy-previous-week", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseCopyPreviousWeekPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      if (!isValidDateKey(payload.value.weekStart)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      let copyResult: CopyPreviousWeekResult = { copied: 0, skipped: 0 };
      const nextData = await storage.update((data) => {
        const copied = copyPreviousWeekEntries(data, request.authUser, payload.value.weekStart, payload.value.mode);
        copyResult = copied.result;
        return copied.data;
      });
      await recordAudit(
        request,
        "data.schedule_entry.copy_previous_week",
        "week",
        getWeekRange(payload.value.weekStart).start,
        `复制上一周排班：${getWeekRange(payload.value.weekStart).start}，复制 ${copyResult.copied} 个，跳过 ${copyResult.skipped} 个`
      );
      response.json({ data: toPublicData(nextData), result: copyResult });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/data/schedule-bulk-week", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseBulkWeekPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      if (!isValidDateKey(payload.value.weekStart)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      let bulkResult: BulkWeekResult = { updated: 0, skipped: 0 };
      const weekStart = getWeekRange(payload.value.weekStart).start;
      const nextData = await storage.update((data) => {
        const updated = bulkUpdateWeekEntries(data, request.authUser, payload.value);
        bulkResult = updated.result;
        return updated.data;
      });
      const operationText = payload.value.operation === "clear" ? "批量清空排班" : `批量设置排班：${payload.value.shiftId}`;
      await recordAudit(
        request,
        "data.schedule_entry.bulk_week",
        "week",
        weekStart,
        `${operationText}，${weekStart}，更新 ${bulkResult.updated} 个，跳过 ${bulkResult.skipped} 个`
      );
      response.json({ data: toPublicData(nextData), result: bulkResult });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.post("/data/schedule-swap-week", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseScheduleSwapWeekPayload(request.body);
      if (payload.ok === false) {
        response.status(400).json({ message: payload.message });
        return;
      }

      if (!isValidDateKey(payload.value.weekStart)) {
        response.status(400).json({ message: "日期格式不正确" });
        return;
      }

      let swapResult: ScheduleSwapWeekResult = { swappedDays: 0 };
      const weekStart = getWeekRange(payload.value.weekStart).start;
      const nextData = await storage.update((data) => {
        const swapped = swapWeekScheduleEntries(data, request.authUser, payload.value);
        swapResult = swapped.result;
        return swapped.data;
      });
      await recordAudit(
        request,
        "data.schedule_entry.swap_week",
        "week",
        weekStart,
        `仅排班排序：${weekStart}，${payload.value.sourceStaffId} 与 ${payload.value.targetStaffId}，调整 ${swapResult.swappedDays} 天`
      );
      response.json({ data: toPublicData(nextData), result: swapResult });
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.put("/data/monthly-settlement", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const payload = parseMonthlySettlementPayload(request.body);
      const nextData = await storage.update((data) => {
        if (isMonthSettled(data, payload.month)) {
          throw new HttpResponseError(400, "该月份已月结");
        }

        const [yearText, monthText] = payload.month.split("-");
        const days = getMonthDays(Number(yearText), Number(monthText));
        const monthlySummary = calculateMonthlySummary(data, days);
        const settlementStaffIds = monthlySummary.rows.map((row) => row.staffId);
        if (!canManageAllStaff(request.authUser, settlementStaffIds)) {
          throw new HttpResponseError(403, "当前账号没有该人员操作权限");
        }

        let settlement;

        try {
          settlement = createMonthlySettlement({
            month: payload.month,
            monthlySummary,
            bonusPool: payload.bonusPool,
            settledAt: new Date().toISOString()
          });
        } catch (error) {
          if (error instanceof Error) {
            throw new HttpResponseError(400, error.message);
          }

          throw error;
        }

        return {
          ...data,
          monthlySettlements: [...data.monthlySettlements, settlement]
        };
      });

      await recordAudit(
        request,
        "data.monthly_settlement.create",
        "monthly_settlement",
        payload.month,
        `确认月结：${payload.month}`
      );
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  router.delete("/data/monthly-settlement/:month", requireScheduler, async (request: AuthenticatedRequest, response, next) => {
    try {
      const month = getRouteParam(request, "month");
      if (!MONTH_PATTERN.test(month)) {
        throw new HttpResponseError(400, "月结信息不完整");
      }

      const nextData = await storage.update((data) => {
        const settlement = data.monthlySettlements.find((item) => item.month === month);
        if (!settlement) {
          throw new HttpResponseError(404, "该月份未月结");
        }
        if (!canManageAllStaff(request.authUser, settlement.rows.map((row) => row.staffId))) {
          throw new HttpResponseError(403, "当前账号没有该人员操作权限");
        }

        return {
          ...data,
          monthlySettlements: data.monthlySettlements.filter((settlement) => settlement.month !== month)
        };
      });

      await recordAudit(
        request,
        "data.monthly_settlement.delete",
        "monthly_settlement",
        month,
        `取消月结：${month}`
      );
      response.json(toPublicData(nextData));
    } catch (error) {
      handleRouteError(error, response, next);
    }
  });

  return router;
}
