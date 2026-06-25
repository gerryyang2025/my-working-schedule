import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { AuthSession, AuthUser, UserRole } from "../auth";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "../auth";
import {
  AuthStoreError,
  type AuditLogEntry,
  type AuditLogInput,
  type AuditLogQuery,
  type AuthStore,
  type BootstrapAdminOptions,
  type ChangePasswordInput,
  type DeleteAuthUserInput,
  type SaveAuthUserInput
} from "../auth-store";
import { initializeSqliteSchema } from "./schema";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  staff_id: string | null;
  password_hash: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  user_id: string;
};

type AuditLogRow = {
  id: string;
  occurred_at: string;
  user_id: string | null;
  username: string;
  action: string;
  target_type: string;
  target_id: string;
  summary: string;
  ip: string;
  user_agent: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeManagedStaffIds(staffIds: string[] | undefined): string[] {
  return Array.from(new Set((staffIds ?? []).map((staffId) => staffId.trim()).filter(Boolean))).sort();
}

function readManagedStaffIds(db: Database.Database, userId: string): string[] {
  const rows = db
    .prepare("select staff_id from user_managed_staff where user_id = ? order by staff_id asc")
    .all(userId) as Array<{ staff_id: string }>;
  return rows.map((row) => row.staff_id);
}

function attachManagedStaffIds(db: Database.Database, user: AuthUser): AuthUser {
  return {
    ...user,
    managedStaffIds: readManagedStaffIds(db, user.id)
  };
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    staffId: row.staff_id,
    managedStaffIds: [],
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sanitizeUser(user: AuthUser & { passwordHash: string }): AuthUser {
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

function mapAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    ip: row.ip,
    userAgent: row.user_agent
  };
}

interface NormalizedAuditQuery {
  username: string;
  action: string;
  keyword: string;
  page: number;
  pageSize: number;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeAuditQuery(query: number | AuditLogQuery | undefined): NormalizedAuditQuery {
  if (typeof query === "number") {
    return { username: "", action: "", keyword: "", page: 1, pageSize: Math.min(Math.max(Math.floor(query), 1), 100) };
  }

  const page = Math.max(normalizePositiveInteger(query?.page, 1), 1);
  const requestedPageSize = normalizePositiveInteger(query?.pageSize ?? query?.limit, 20);
  return {
    username: query?.username?.trim() ?? "",
    action: query?.action?.trim() ?? "",
    keyword: query?.keyword?.trim() ?? "",
    page,
    pageSize: Math.min(Math.max(requestedPageSize, 1), 100)
  };
}

function buildAuditFilters(query: NormalizedAuditQuery): { whereClause: string; params: Array<string | number> } {
  const filters: string[] = [];
  const params: Array<string | number> = [];

  if (query.username) {
    filters.push("username = ?");
    params.push(query.username);
  }
  if (query.action) {
    filters.push("action = ?");
    params.push(query.action);
  }
  if (query.keyword) {
    filters.push("(summary like ? or target_type like ? or target_id like ?)");
    const keyword = `%${query.keyword}%`;
    params.push(keyword, keyword, keyword);
  }

  return {
    whereClause: filters.length > 0 ? `where ${filters.join(" and ")}` : "",
    params
  };
}

function replaceManagedStaffIds(
  db: Database.Database,
  userId: string,
  staffIds: string[],
  createdBy: string | null,
  timestamp: string
): void {
  db.prepare("delete from user_managed_staff where user_id = ?").run(userId);
  const insertRelation = db.prepare(
    "insert into user_managed_staff (user_id, staff_id, created_at, created_by) values (?, ?, ?, ?)"
  );
  for (const staffId of staffIds) {
    insertRelation.run(userId, staffId, timestamp, createdBy);
  }
}

export function createSqliteAuthStore(sqlitePath: string): AuthStore {
  function openDatabase() {
    const db = new Database(sqlitePath);
    db.pragma("foreign_keys = ON");
    initializeSqliteSchema(db);
    return db;
  }

  function readEnabledUserByUsername(db: Database.Database, username: string): (AuthUser & { passwordHash: string }) | null {
    const row = db
      .prepare(
        `
          select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
          from users
          where username = ? and enabled = 1
        `
      )
      .get(username.trim()) as UserRow | undefined;

    return row ? { ...attachManagedStaffIds(db, mapUser(row)), passwordHash: row.password_hash } : null;
  }

  function readUserByUsername(db: Database.Database, username: string): (AuthUser & { passwordHash: string }) | null {
    const row = db
      .prepare(
        `
          select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
          from users
          where username = ?
        `
      )
      .get(username.trim()) as UserRow | undefined;

    return row ? { ...attachManagedStaffIds(db, mapUser(row)), passwordHash: row.password_hash } : null;
  }

  function readUserById(db: Database.Database, id: string): (AuthUser & { passwordHash: string }) | null {
    const row = db
      .prepare(
        `
          select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
          from users
          where id = ?
        `
      )
      .get(id) as UserRow | undefined;

    return row ? { ...attachManagedStaffIds(db, mapUser(row)), passwordHash: row.password_hash } : null;
  }

  function readUserByStaffId(db: Database.Database, staffId: string): (AuthUser & { passwordHash: string }) | null {
    const row = db
      .prepare(
        `
          select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
          from users
          where staff_id = ?
        `
      )
      .get(staffId) as UserRow | undefined;

    return row ? { ...attachManagedStaffIds(db, mapUser(row)), passwordHash: row.password_hash } : null;
  }

  function readEnabledUserById(db: Database.Database, id: string): AuthUser | null {
    const row = db
      .prepare(
        `
          select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
          from users
          where id = ? and enabled = 1
        `
      )
      .get(id) as UserRow | undefined;

    return row ? attachManagedStaffIds(db, mapUser(row)) : null;
  }

  function resolveUserForSave(
    db: Database.Database,
    id: string,
    username: string
  ): (AuthUser & { passwordHash: string }) | null {
    return readUserById(db, id) ?? readUserByUsername(db, username);
  }

  function assertCanSaveUser(
    db: Database.Database,
    existingUser: (AuthUser & { passwordHash: string }) | null,
    nextRole: UserRole,
    nextEnabled: boolean
  ): void {
    if (!existingUser || existingUser.role !== "admin" || !existingUser.enabled || (nextRole === "admin" && nextEnabled)) {
      return;
    }

    const row = db
      .prepare("select count(*) as count from users where id <> ? and role = 'admin' and enabled = 1")
      .get(existingUser.id) as { count: number };
    if (row.count === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
  }

  function countOtherEnabledAdmins(db: Database.Database, userId: string): number {
    const row = db
      .prepare("select count(*) as count from users where id <> ? and role = 'admin' and enabled = 1")
      .get(userId) as { count: number };
    return row.count;
  }

  function assertCanDeleteUser(
    db: Database.Database,
    input: DeleteAuthUserInput,
    user: (AuthUser & { passwordHash: string }) | null
  ): AuthUser & { passwordHash: string } {
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
    if (user.role === "admin" && countOtherEnabledAdmins(db, user.id) === 0) {
      throw new AuthStoreError(400, "至少需要保留一个启用的系统管理员");
    }
    return user;
  }

  return {
    async ensureBootstrapAdmin({ username, password }: BootstrapAdminOptions) {
      const db = openDatabase();
      try {
        const normalizedUsername = username.trim();
        const displayName = normalizedUsername === "admin" ? "系统管理员" : normalizedUsername;
        const existingUser = readUserByUsername(db, normalizedUsername);
        const timestamp = nowIso();
        if (existingUser) {
          db.transaction(() => {
            db.prepare(
              `
                update users
                set display_name = ?, role = ?, staff_id = null, password_hash = ?, enabled = 1, updated_at = ?
                where username = ?
              `
            ).run(displayName, "admin", hashPassword(password), timestamp, normalizedUsername);
            replaceManagedStaffIds(db, existingUser.id, [], null, timestamp);
          })();
          return;
        }

        db.prepare(
          `
            insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
            values (?, ?, ?, ?, null, ?, ?, ?, ?)
          `
        ).run(randomUUID(), normalizedUsername, displayName, "admin", hashPassword(password), 1, timestamp, timestamp);
      } finally {
        db.close();
      }
    },

    async listUsers() {
      const db = openDatabase();
      try {
        const rows = db
          .prepare(
            `
              select id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
              from users
              order by username asc
            `
          )
          .all() as UserRow[];
        return rows.map((row) => attachManagedStaffIds(db, mapUser(row)));
      } finally {
        db.close();
      }
    },

    async saveUser(input: SaveAuthUserInput) {
      const db = openDatabase();
      try {
        const username = input.username.trim();
        const displayName = input.displayName.trim();
        const existingUser = resolveUserForSave(db, input.id, username);
        const duplicateUser = readUserByUsername(db, username);
        if (duplicateUser && duplicateUser.id !== existingUser?.id) {
          throw new AuthStoreError(400, "账号名不能重复");
        }

        const staffId = input.staffId?.trim() || null;
        if (staffId) {
          const duplicateStaffUser = readUserByStaffId(db, staffId);
          if (duplicateStaffUser && duplicateStaffUser.id !== existingUser?.id) {
            throw new AuthStoreError(400, "该人员已绑定其他账号");
          }
        }

        assertCanSaveUser(db, existingUser, input.role, input.enabled);
        const managedStaffIds = normalizeManagedStaffIds(input.managedStaffIds);
        const managedStaffUpdatedBy = input.managedStaffUpdatedBy?.trim() || null;
        const timestamp = nowIso();
        if (existingUser) {
          const passwordHash = input.password ? hashPassword(input.password) : existingUser.passwordHash;
          db.transaction(() => {
            db.prepare(
              `
                update users
                set username = ?, display_name = ?, role = ?, staff_id = ?, password_hash = ?, enabled = ?, updated_at = ?
                where id = ?
              `
            ).run(username, displayName, input.role, staffId, passwordHash, input.enabled ? 1 : 0, timestamp, existingUser.id);
            replaceManagedStaffIds(
              db,
              existingUser.id,
              managedStaffIds,
              managedStaffUpdatedBy,
              timestamp
            );
          })();
          return {
            id: existingUser.id,
            username,
            displayName,
            role: input.role,
            staffId,
            managedStaffIds,
            enabled: input.enabled,
            createdAt: existingUser.createdAt,
            updatedAt: timestamp
          };
        }

        if (!input.password) {
          throw new AuthStoreError(400, "新账号必须设置初始密码");
        }
        const password = input.password;

        db.transaction(() => {
          db.prepare(
            `
              insert into users (id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          ).run(
            input.id,
            username,
            displayName,
            input.role,
            staffId,
            hashPassword(password),
            input.enabled ? 1 : 0,
            timestamp,
            timestamp
          );
          replaceManagedStaffIds(
            db,
            input.id,
            managedStaffIds,
            managedStaffUpdatedBy,
            timestamp
          );
        })();

        return {
          id: input.id,
          username,
          displayName,
          role: input.role,
          staffId,
          managedStaffIds,
          enabled: input.enabled,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      } finally {
        db.close();
      }
    },

    async deleteUser(input: DeleteAuthUserInput) {
      const db = openDatabase();
      try {
        const user = assertCanDeleteUser(db, input, readUserById(db, input.userId));
        const deletedUser = sanitizeUser(user);
        db.transaction(() => {
          db.prepare("delete from user_sessions where user_id = ?").run(user.id);
          db.prepare("delete from user_managed_staff where user_id = ?").run(user.id);
          db.prepare("update user_managed_staff set created_by = null where created_by = ?").run(user.id);
          db.prepare("delete from users where id = ?").run(user.id);
        })();
        return deletedUser;
      } finally {
        db.close();
      }
    },

    async authenticate(username, password) {
      const db = openDatabase();
      try {
        const user = readEnabledUserByUsername(db, username);
        if (!user || !verifyPassword(password, user.passwordHash)) {
          return null;
        }

        return sanitizeUser(user);
      } finally {
        db.close();
      }
    },

    async changePassword({ userId, currentPassword, newPassword }: ChangePasswordInput) {
      const db = openDatabase();
      try {
        const user = readUserById(db, userId);
        if (!user?.enabled || !verifyPassword(currentPassword, user.passwordHash)) {
          return false;
        }

        const timestamp = nowIso();
        db.transaction(() => {
          db.prepare("update users set password_hash = ?, updated_at = ? where id = ?").run(
            hashPassword(newPassword),
            timestamp,
            user.id
          );
          db.prepare("update user_sessions set revoked_at = ? where user_id = ? and revoked_at is null").run(timestamp, user.id);
        })();
        return true;
      } finally {
        db.close();
      }
    },

    async createSession(userId) {
      const db = openDatabase();
      try {
        const user = readEnabledUserById(db, userId);
        if (!user) {
          throw new Error("用户不存在或已禁用");
        }

        const token = createSessionToken();
        const tokenHash = hashSessionToken(token);
        const timestamp = nowIso();
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        db.prepare(
          `
            insert into user_sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
            values (?, ?, ?, ?, ?, null)
          `
        ).run(randomUUID(), user.id, tokenHash, timestamp, expiresAt);

        return { token, user, expiresAt };
      } finally {
        db.close();
      }
    },

    async getSession(token) {
      const db = openDatabase();
      try {
        const session = db
          .prepare(
            `
              select token_hash, user_id, expires_at, revoked_at
              from user_sessions
              where token_hash = ?
            `
          )
          .get(hashSessionToken(token)) as SessionRow | undefined;

        if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
          return null;
        }

        const user = readEnabledUserById(db, session.user_id);
        return user ? ({ token, user, expiresAt: session.expires_at } satisfies AuthSession) : null;
      } finally {
        db.close();
      }
    },

    async revokeSession(token) {
      const db = openDatabase();
      try {
        db.prepare("update user_sessions set revoked_at = ? where token_hash = ?").run(nowIso(), hashSessionToken(token));
      } finally {
        db.close();
      }
    },

    async recordAudit(entry: AuditLogInput) {
      const db = openDatabase();
      try {
        db.prepare(
          `
            insert into audit_logs (
              id, occurred_at, user_id, username, action, target_type, target_id, summary, ip, user_agent
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          randomUUID(),
          nowIso(),
          entry.actor?.id ?? null,
          entry.actor?.username ?? "anonymous",
          entry.action,
          entry.targetType,
          entry.targetId,
          entry.summary,
          entry.ip,
          entry.userAgent
        );
      } finally {
        db.close();
      }
    },

    async listAuditLogs(query) {
      const db = openDatabase();
      try {
        const normalizedQuery = normalizeAuditQuery(query);
        const { whereClause, params } = buildAuditFilters(normalizedQuery);
        params.push(normalizedQuery.pageSize, (normalizedQuery.page - 1) * normalizedQuery.pageSize);
        const rows = db
          .prepare(
            `
              select id, occurred_at, user_id, username, action, target_type, target_id, summary, ip, user_agent
              from audit_logs
              ${whereClause}
              order by occurred_at desc, id desc
              limit ? offset ?
            `
          )
          .all(...params) as AuditLogRow[];

        return rows.map(mapAuditLog);
      } finally {
        db.close();
      }
    },

    async countAuditLogs(query) {
      const db = openDatabase();
      try {
        const normalizedQuery = normalizeAuditQuery(query);
        const { whereClause, params } = buildAuditFilters(normalizedQuery);
        const row = db
          .prepare(
            `
              select count(*) as count
              from audit_logs
              ${whereClause}
            `
          )
          .get(...params) as { count: number };
        return row.count;
      } finally {
        db.close();
      }
    }
  };
}
