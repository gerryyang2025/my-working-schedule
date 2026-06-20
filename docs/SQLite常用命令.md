# SQLite 常用命令

本文记录正式环境中常用的 SQLite 查看、检查和排障命令。默认数据库路径为：

```bash
/var/lib/my-working-schedule/schedule.db
```

如果服务器使用了自定义路径，请以 `./optools.sh config` 或 `./optools.sh data status` 输出为准。

## 基础状态

查看当前 SQLite 数据库文件状态：

```bash
./optools.sh data status
```

执行项目内置完整性检查：

```bash
./optools.sh data check
```

直接使用 SQLite CLI 做完整性检查：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma integrity_check;"
```

预期输出：

```text
ok
```

## 表结构查看

查看全部表：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db ".tables"
```

查看 `users` 表字段：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma table_info(users);"
```

查看 `users` 表外键：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_key_list(users);"
```

查看 `users` 表索引：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma index_list(users);"
```

查看用户与人员绑定唯一索引详情：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma index_info(idx_users_staff_id_unique);"
```

查看建表 SQL：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db ".schema users"
sqlite3 /var/lib/my-working-schedule/schedule.db ".schema staff"
sqlite3 /var/lib/my-working-schedule/schedule.db ".schema schedule_entries"
```

## 外键检查

检查所有外键是否一致：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_key_check;"
```

预期无输出。若有输出，表示存在外键不一致，需要先停止服务并备份数据库，再排查数据。

检查运行时是否启用外键：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_keys;"
```

输出 `1` 表示当前连接启用了外键；输出 `0` 表示当前 sqlite3 会话未启用。项目 API 运行时会显式启用外键。

## 常用数据查询

查看人员数量：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "select count(*) from staff;"
```

查看账号数量：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "select count(*) from users;"
```

查看账号与人员绑定关系：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select username, display_name, role, staff_id, enabled from users order by username;"
```

查看已绑定账号及人员姓名、工号：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select users.username, users.display_name, users.role, staff.name, staff.job_id from users left join staff on staff.id = users.staff_id where users.staff_id is not null order by users.username;"
```

查看是否存在重复人员绑定：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select staff_id, count(*) from users where staff_id is not null group by staff_id having count(*) > 1;"
```

预期无输出。

查看账号可管理人员关系：

    sqlite3 /var/lib/my-working-schedule/schedule.db "select user_id, staff_id, created_at, created_by from user_managed_staff order by user_id, staff_id;"

查看可管理人员表结构：

    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma table_info(user_managed_staff);"
    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_key_list(user_managed_staff);"
    sqlite3 /var/lib/my-working-schedule/schedule.db "pragma index_list(user_managed_staff);"

查看排班记录数量：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db "select count(*) from schedule_entries;"
```

查看某个月排班记录：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select date, staff_id, note from schedule_entries where date between '2026-06-01' and '2026-06-30' order by date, staff_id;"
```

查看某个月月结记录：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select month, month_start, month_end, bonus_pool, settled_at from monthly_settlements order by month;"
```

查看最近审计日志：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select occurred_at, username, action, summary from audit_logs order by occurred_at desc limit 20;"
```

按关键词查询审计日志：

```bash
sqlite3 /var/lib/my-working-schedule/schedule.db \
  "select occurred_at, username, action, summary from audit_logs where summary like '%绑定人员%' order by occurred_at desc limit 20;"
```

## 备份与恢复

手动备份：

```bash
./optools.sh data backup
```

查看备份目录：

```bash
ls -lh /var/backups/my-working-schedule
```

恢复备份前必须显式确认：

```bash
CONFIRM_RESTORE=yes ./optools.sh data restore /var/backups/my-working-schedule/<backup-file>
```

恢复后检查：

```bash
./optools.sh data check
sqlite3 /var/lib/my-working-schedule/schedule.db "pragma foreign_key_check;"
```

## 排障建议

- 只读查看优先使用 `select`、`pragma table_info`、`pragma foreign_key_check` 等命令。
- 不建议直接用 `sqlite3` 执行 `update`、`delete`、`insert` 修改正式数据；应优先通过系统页面或 API 操作。
- 排查数据问题前先执行 `./optools.sh data backup`。
- 若外键检查有输出，先停止服务并保留现场数据库文件，再分析具体表和行。
- 如果 `sqlite3` 命令不存在，可安装系统 SQLite CLI；它只用于人工查看和排障，项目运行不依赖独立 SQLite daemon。
