import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { ServerConfig } from "./config";
import type { AuthSession, AuthUser, UserRole } from "./auth";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./auth";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface BootstrapAdminOptions {
  username: string;
  password: string;
}

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  userId: string | null;
  username: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ip: string;
  userAgent: string;
}

export interface AuditLogInput {
  action: string;
  actor: AuthUser | null;
  targetType: string;
  targetId: string;
  summary: string;
  ip: string;
  userAgent: string;
}

export interface AuditLogQuery {
  username?: string;
  action?: string;
  keyword?: string;
  limit?: number;
}

export interface SaveAuthUserInput {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  enabled: boolean;
  password?: string | null;
  staffId?: string | null;
  managedStaffIds?: string[];
  managedStaffUpdatedBy?: string | null;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface DeleteAuthUserInput {
  userId: string;
  actorUserId: string;
  bootstrapUsername: string;
}

export class AuthStoreError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export interface AuthStore {
  ensureBootstrapAdmin(options: BootstrapAdminOptions): Promise<void>;
  listUsers(): Promise<AuthUser[]>;
  saveUser(input: SaveAuthUserInput): Promise<AuthUser>;
  deleteUser(input: DeleteAuthUserInput): Promise<AuthUser>;
  authenticate(username: string, password: string): Promise<AuthUser | null>;
  changePassword(input: ChangePasswordInput): Promise<boolean>;
  createSession(userId: string): Promise<AuthSession>;
  getSession(token: string): Promise<AuthSession | null>;
  revokeSession(token: string): Promise<void>;
  recordAudit(entry: AuditLogInput): Promise<void>;
  listAuditLogs(query?: number | AuditLogQuery): Promise<AuditLogEntry[]>;
}

interface StoredUser extends AuthUser {
  passwordHash: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createUser(username: string, password: string, role: UserRole): StoredUser {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    username,
    displayName: username === "admin" ? "系统管理员" : username,
    role,
    staffId: null,
    managedStaffIds: [],
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    passwordHash: hashPassword(password)
  };
}

function normalizeAuditQuery(query: number | AuditLogQuery | undefined): Required<AuditLogQuery> {
  if (typeof query === "number") {
    return { username: "", action: "", keyword: "", limit: query };
  }

  return {
    username: query?.username?.trim() ?? "",
    action: query?.action?.trim() ?? "",
    keyword: query?.keyword?.trim().toLowerCase() ?? "",
    limit: query?.limit ?? 100
  };
}

function sortUsers(users: AuthUser[]): AuthUser[] {
  return [...users].sort((left, right) => left.username.localeCompare(right.username));
}

function normalizeManagedStaffIds(staffIds: string[] | undefined): string[] {
  return Array.from(new Set((staffIds ?? []).map((staffId) => staffId.trim()).filter(Boolean))).sort();
}

function toAuthUser(user: StoredUser): AuthUser {
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

export function createMemoryAuthStore(): AuthStore {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, StoredSession>();
  const auditLogs: AuditLogEntry[] = [];

  function getUserByUsername(username: string): StoredUser | null {
    const normalizedUsername = username.trim();
    for (const user of users.values()) {
      if (user.username === normalizedUsername) {
        return user;
      }
    }
    return null;
  }

  function getEnabledUserByUsername(username: string): StoredUser | null {
    const user = getUserByUsername(username);
    return user?.enabled ? user : null;
  }

  function getUserById(id: string): StoredUser | null {
    const user = users.get(id);
    return user?.enabled ? user : null;
  }

  function getStoredUserById(id: string): StoredUser | null {
    return users.get(id) ?? null;
  }

  function getUserByStaffId(staffId: string): StoredUser | null {
    for (const user of users.values()) {
      if (user.staffId === staffId) {
        return user;
      }
    }
    return null;
  }

  function resolveUserForSave(id: string, username: string): StoredUser | null {
    return getStoredUserById(id) ?? getUserByUsername(username);
  }

  function assertCanSaveUser(existingUser: StoredUser | null, nextRole: UserRole, nextEnabled: boolean): void {
    if (!existingUser || existingUser.role !== "admin" || !existingUser.enabled || (nextRole === "admin" && nextEnabled)) {
      return;
    }

    const otherEnabledAdminCount = Array.from(users.values()).filter(
      (user) => user.id !== existingUser.id && user.enabled && user.role === "admin"
    ).length;
    if (otherEnabledAdminCount === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
  }

  function countOtherEnabledAdmins(userId: string): number {
    return Array.from(users.values()).filter((user) => user.id !== userId && user.enabled && user.role === "admin").length;
  }

  function assertCanDeleteUser(input: DeleteAuthUserInput, user: StoredUser | null): StoredUser {
    if (!user) {
      throw new AuthStoreError(404, "账号不存在");
    }
    if (user.id === input.actorUserId) {
      throw new AuthStoreError(400, "不能删除当前登录账号");
    }
    if (user.username === input.bootstrapUsername.trim()) {
      throw new AuthStoreError(400, "默认管理员账号不能删除");
    }
    if (user.enabled) {
      throw new AuthStoreError(400, "请先停用账号后再删除");
    }
    if (user.role === "admin" && countOtherEnabledAdmins(user.id) === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
    return user;
  }

  return {
    async ensureBootstrapAdmin({ username, password }) {
      const existingUser = getUserByUsername(username);
      if (existingUser) {
        existingUser.displayName = username.trim() === "admin" ? "系统管理员" : username.trim();
        existingUser.role = "admin";
        existingUser.staffId = null;
        existingUser.managedStaffIds = [];
        existingUser.enabled = true;
        existingUser.updatedAt = nowIso();
        existingUser.passwordHash = hashPassword(password);
        return;
      }

      const user = createUser(username.trim(), password, "admin");
      users.set(user.id, user);
    },

    async listUsers() {
      return sortUsers(Array.from(users.values()).map(toAuthUser));
    },

    async saveUser(input) {
      const username = input.username.trim();
      const displayName = input.displayName.trim();
      const existingUser = resolveUserForSave(input.id, username);
      const duplicateUser = getUserByUsername(username);
      if (duplicateUser && duplicateUser.id !== existingUser?.id) {
        throw new AuthStoreError(400, "账号名不能重复");
      }

      const staffId = input.staffId?.trim() || null;
      if (staffId) {
        const duplicateStaffUser = getUserByStaffId(staffId);
        if (duplicateStaffUser && duplicateStaffUser.id !== existingUser?.id) {
          throw new AuthStoreError(400, "该人员已绑定其他账号");
        }
      }

      assertCanSaveUser(existingUser, input.role, input.enabled);
      const managedStaffIds = normalizeManagedStaffIds(input.managedStaffIds);
      const timestamp = nowIso();
      if (existingUser) {
        existingUser.username = username;
        existingUser.displayName = displayName;
        existingUser.role = input.role;
        existingUser.staffId = staffId;
        existingUser.managedStaffIds = managedStaffIds;
        existingUser.enabled = input.enabled;
        existingUser.updatedAt = timestamp;
        if (input.password) {
          existingUser.passwordHash = hashPassword(input.password);
        }
        return toAuthUser(existingUser);
      }

      if (!input.password) {
        throw new AuthStoreError(400, "新账号必须设置初始密码");
      }

      const user: StoredUser = {
        id: input.id,
        username,
        displayName,
        role: input.role,
        staffId,
        managedStaffIds,
        enabled: input.enabled,
        createdAt: timestamp,
        updatedAt: timestamp,
        passwordHash: hashPassword(input.password)
      };
      users.set(user.id, user);
      return toAuthUser(user);
    },

    async deleteUser(input) {
      const user = assertCanDeleteUser(input, getStoredUserById(input.userId));
      const deletedUser = toAuthUser(user);
      users.delete(user.id);
      for (const [tokenHash, session] of sessions.entries()) {
        if (session.userId === user.id) {
          sessions.delete(tokenHash);
        }
      }
      return deletedUser;
    },

    async authenticate(username, password) {
      const user = getEnabledUserByUsername(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return null;
      }

      return toAuthUser(user);
    },

    async changePassword({ userId, currentPassword, newPassword }) {
      const user = getUserById(userId);
      if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        return false;
      }

      user.passwordHash = hashPassword(newPassword);
      user.updatedAt = nowIso();
      for (const session of sessions.values()) {
        if (session.userId === user.id && !session.revokedAt) {
          session.revokedAt = nowIso();
        }
      }
      return true;
    },

    async createSession(userId) {
      const user = getUserById(userId);
      if (!user) {
        throw new Error("用户不存在或已禁用");
      }

      const token = createSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      sessions.set(hashSessionToken(token), {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt,
        revokedAt: null
      });

      return { token, user: toAuthUser(user), expiresAt };
    },

    async getSession(token) {
      const session = sessions.get(hashSessionToken(token));
      if (!session || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
        return null;
      }

      const user = getUserById(session.userId);
      return user ? { token, user: toAuthUser(user), expiresAt: session.expiresAt } : null;
    },

    async revokeSession(token) {
      const tokenHash = hashSessionToken(token);
      const session = sessions.get(tokenHash);
      if (session) {
        session.revokedAt = nowIso();
      }
    },

    async recordAudit(entry) {
      auditLogs.unshift({
        id: randomUUID(),
        occurredAt: nowIso(),
        userId: entry.actor?.id ?? null,
        username: entry.actor?.username ?? "anonymous",
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        summary: entry.summary,
        ip: entry.ip,
        userAgent: entry.userAgent
      });
    },

    async listAuditLogs(query) {
      const normalizedQuery = normalizeAuditQuery(query);
      const safeLimit = Math.min(Math.max(Math.floor(normalizedQuery.limit), 1), 200);
      return auditLogs
        .filter((entry) => {
          if (normalizedQuery.username && entry.username !== normalizedQuery.username) {
            return false;
          }
          if (normalizedQuery.action && entry.action !== normalizedQuery.action) {
            return false;
          }
          if (normalizedQuery.keyword) {
            const searchable = `${entry.summary} ${entry.targetType} ${entry.targetId}`.toLowerCase();
            return searchable.includes(normalizedQuery.keyword);
          }
          return true;
        })
        .slice(0, safeLimit);
    }
  };
}

export async function createConfiguredAuthStore(config: ServerConfig): Promise<AuthStore> {
  const store =
    config.storageDriver === "sqlite"
      ? await import("./sqlite/auth-store").then((module) =>
          module.createSqliteAuthStore(config.sqlitePath ?? resolve(process.cwd(), "data/schedule.db"))
        )
      : createMemoryAuthStore();

  if (config.adminPassword) {
    await store.ensureBootstrapAdmin({ username: "admin", password: config.adminPassword });
  }

  return store;
}
