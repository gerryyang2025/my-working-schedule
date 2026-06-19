import type Database from "better-sqlite3";

export const SQLITE_SCHEMA_VERSION = 3;

function tableHasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function usersStaffIdReferencesStaff(db: Database.Database): boolean {
  const rows = db.prepare("pragma foreign_key_list(users)").all() as Array<{ table: string; from: string; to: string }>;
  return rows.some((row) => row.table === "staff" && row.from === "staff_id" && row.to === "id");
}

function rebuildUsersTableWithStaffForeignKey(db: Database.Database): void {
  const foreignKeysWereEnabled = db.pragma("foreign_keys", { simple: true }) === 1;
  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      db.exec(`
        create table users_with_staff_fk (
          id text primary key,
          username text not null unique,
          display_name text not null,
          role text not null check (role in ('admin', 'scheduler', 'viewer')),
          staff_id text references staff(id),
          password_hash text not null,
          enabled integer not null check (enabled in (0, 1)),
          created_at text not null,
          updated_at text not null
        );

        insert into users_with_staff_fk (
          id, username, display_name, role, staff_id, password_hash, enabled, created_at, updated_at
        )
        select
          id,
          username,
          display_name,
          role,
          case
            when staff_id is null then null
            when exists (select 1 from staff where staff.id = users.staff_id) then staff_id
            else null
          end,
          password_hash,
          enabled,
          created_at,
          updated_at
        from users;

        drop table users;
        alter table users_with_staff_fk rename to users;
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeysWereEnabled ? "ON" : "OFF"}`);
  }
}

function ensureUsersStaffBindingSchema(db: Database.Database): void {
  if (!tableHasColumn(db, "users", "staff_id")) {
    db.prepare("alter table users add column staff_id text references staff(id)").run();
  } else if (!usersStaffIdReferencesStaff(db)) {
    rebuildUsersTableWithStaffForeignKey(db);
  }

  db.prepare(
    `
      create unique index if not exists idx_users_staff_id_unique
      on users(staff_id)
      where staff_id is not null
    `
  ).run();
}

export function initializeSqliteSchema(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table if not exists schema_migrations (
      version integer primary key,
      applied_at text not null
    );

    create table if not exists staff (
      id text primary key,
      job_id text not null unique,
      name text not null,
      type text not null check (type in ('nurse', 'clerk', 'head_nurse')),
      is_admin integer not null check (is_admin in (0, 1)),
      enabled integer not null check (enabled in (0, 1)),
      sort_order integer not null
    );

    create table if not exists shifts (
      id text primary key,
      name text not null,
      short_name text not null,
      color text not null,
      counts_attendance integer not null check (counts_attendance in (0, 1)),
      coefficient real not null,
      enabled integer not null check (enabled in (0, 1)),
      sort_order integer not null
    );

    create table if not exists holidays (
      id text primary key,
      date text not null unique,
      name text not null,
      affects_required_attendance integer not null check (affects_required_attendance in (0, 1))
    );

    create table if not exists schedule_entries (
      id text primary key,
      date text not null,
      staff_id text not null references staff(id),
      note text not null,
      unique(date, staff_id)
    );

    create table if not exists schedule_entry_shifts (
      entry_id text not null references schedule_entries(id) on delete cascade,
      shift_id text not null references shifts(id),
      position integer not null,
      primary key(entry_id, position)
    );

    create table if not exists monthly_settlements (
      id text primary key,
      month text not null unique,
      month_start text not null,
      month_end text not null,
      total_days integer not null,
      bonus_pool real not null,
      coefficient_total real not null,
      settled_at text not null
    );

    create table if not exists monthly_settlement_rows (
      settlement_id text not null references monthly_settlements(id) on delete cascade,
      position integer not null,
      staff_id text not null,
      staff_name text not null,
      staff_job_id text not null,
      staff_type text not null check (staff_type in ('nurse', 'clerk', 'head_nurse')),
      attendance_shifts integer not null,
      overtime_shifts integer not null,
      coefficient_total real,
      coefficient_excluded_reason text not null,
      bonus_amount real not null,
      bonus_excluded_reason text not null,
      primary key(settlement_id, position),
      unique(settlement_id, staff_id)
    );

    create table if not exists app_settings (
      key text primary key,
      value text not null
    );

    create table if not exists users (
      id text primary key,
      username text not null unique,
      display_name text not null,
      role text not null check (role in ('admin', 'scheduler', 'viewer')),
      staff_id text references staff(id),
      password_hash text not null,
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );

    create table if not exists user_sessions (
      id text primary key,
      user_id text not null references users(id),
      token_hash text not null unique,
      created_at text not null,
      expires_at text not null,
      revoked_at text
    );

    create table if not exists audit_logs (
      id text primary key,
      occurred_at text not null,
      user_id text,
      username text not null,
      action text not null,
      target_type text not null,
      target_id text not null,
      summary text not null,
      ip text not null,
      user_agent text not null
    );
  `);

  ensureUsersStaffBindingSchema(db);

  const migration = db.prepare("select version from schema_migrations where version = ?").get(SQLITE_SCHEMA_VERSION);
  if (!migration) {
    db.prepare("insert into schema_migrations (version, applied_at) values (?, ?)").run(
      SQLITE_SCHEMA_VERSION,
      new Date().toISOString()
    );
  }
}

export function checkSqliteIntegrity(db: Database.Database): string {
  const row = db.prepare("pragma integrity_check").get() as { integrity_check: string };
  return row.integrity_check;
}

export function listMissingCoreTables(db: Database.Database): string[] {
  const expected = [
    "app_settings",
    "audit_logs",
    "holidays",
    "monthly_settlement_rows",
    "monthly_settlements",
    "schedule_entries",
    "schedule_entry_shifts",
    "schema_migrations",
    "shifts",
    "staff",
    "user_sessions",
    "users"
  ];
  const rows = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));
  return expected.filter((name) => !names.has(name));
}
