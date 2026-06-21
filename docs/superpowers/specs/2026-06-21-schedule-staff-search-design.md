# 排班人员搜索设计

## 背景

当前排班工作台按周展示排班表，人员行已经包含排序ID、姓名、工号和人员类型。随着人员数量增加，护士长在手机端或 PC 端查找某个人员排班时，需要横向和纵向浏览表格，效率不高。

本阶段新增排班人员搜索功能，用于按姓名或工号快速定位排班表中的人员行。

## 已确认方案

采用方案 A：搜索只作用于“排班”tab 内的排班表人员行。

本阶段不影响：

- 周统计结果。
- 月结与奖金结果。
- 打印周表和打印月表。
- PDF 输出。
- 批量排班权限计算。
- 后端接口与 SQLite 数据结构。

## 功能范围

在排班 tab 中增加搜索输入框，支持按人员姓名或工号筛选排班表。

搜索字段：

- `staff.name`
- `staff.jobId`

搜索规则：

- 支持模糊匹配。
- 自动去除首尾空格。
- 英文和数字大小写不敏感。
- 空搜索词表示不筛选，展示全部可见人员。

搜索结果只改变传给 `ScheduleGrid` 的 `staff` 列表。`ScheduleGrid` 内部仍按现有规则展示人员：

- 启用人员正常展示。
- 停用但当前周有历史排班的人员仍可展示。
- 人员排序仍按 `sortOrder`。

## 页面设计

搜索区域放在排班 tab 内，位于批量操作按钮和班次画笔之间。

建议布局：

```text
搜索人员姓名或工号        已显示 2 / 8 人        清空
班次画笔...
排班表...
```

桌面端：

- 搜索框与结果计数、清空按钮同行展示。
- 搜索框宽度控制在适合输入姓名或工号的范围。

手机端：

- 搜索框单独一行，占满可用宽度。
- 结果计数和清空按钮在下一行或同一行自适应换行。
- 排班表横向滚动和左侧固定列保持现有行为。

## 空结果

当搜索词不为空且没有匹配人员时，排班区域显示空结果提示：

```text
未找到匹配人员
```

同时保留清空入口，方便用户恢复全部人员。

空结果不代表排班数据丢失，只是当前搜索条件无匹配。

## 数据流

`App.vue` 负责维护搜索状态。

新增状态：

```ts
const scheduleStaffQuery = ref("");
```

新增计算：

```ts
const normalizedScheduleStaffQuery = computed(() => scheduleStaffQuery.value.trim().toLowerCase());

const filteredScheduleStaff = computed(() => {
  if (!data.value || !normalizedScheduleStaffQuery.value) {
    return data.value?.staff ?? [];
  }

  const query = normalizedScheduleStaffQuery.value;
  return data.value.staff.filter((staff) => {
    return staff.name.toLowerCase().includes(query) || staff.jobId.toLowerCase().includes(query);
  });
});
```

`ScheduleGrid` 调用从：

```vue
<ScheduleGrid :staff="data.staff" />
```

调整为：

```vue
<ScheduleGrid :staff="filteredScheduleStaff" />
```

`ScheduleGrid` 本身继续负责：

- 按 `sortOrder` 排序。
- 合并停用历史人员展示规则。
- 处理单元格点击排班。
- 处理固定列宽度。

## 批量操作边界

搜索不改变批量操作范围。

也就是说，当前阶段的批量操作按钮仍按当前用户可编辑人员和当前周规则执行，不因为搜索只显示部分人员而缩小操作范围。

原因：

- 批量操作是高影响行为，如果让搜索隐式改变范围，用户容易误操作。
- 本阶段先把搜索定位为“查找和查看工具”，不作为批量操作过滤器。

后续如果需要“仅对搜索结果批量操作”，应作为独立设计增加明确开关或确认提示。

## 权限规则

搜索不绕过任何权限。

- `viewer` 可以搜索并查看全科排班，仍然只读。
- `scheduler` 可以搜索全科排班，但只能编辑自己可管理人员。
- `admin` 可以搜索并编辑所有启用人员。

单元格是否可编辑仍由 `editableStaffIds` 和 `ScheduleGrid.canEditStaff` 决定。

## 测试计划

前端组件测试：

- 搜索框输入姓名时，只显示匹配人员排班行。
- 搜索框输入工号时，只显示匹配人员排班行。
- 搜索词自动去除首尾空格。
- 搜索大小写不敏感。
- 清空搜索后恢复全部人员。
- 空结果时显示“未找到匹配人员”。
- 搜索不影响周统计 tab 的汇总数据。
- 搜索不改变批量操作按钮的可用状态和权限计算。

样式测试：

- 桌面端搜索区域和批量操作、班次画笔间距合理。
- 手机端搜索框占满宽度，结果计数和清空按钮不挤压排班表。

## 非目标

本阶段不实现：

- 后端搜索接口。
- SQLite 查询优化。
- 搜索周统计、月结与奖金。
- 搜索结果影响打印周表、打印月表或 PDF。
- 搜索结果影响批量操作范围。
- 按人员类型筛选。
- 多条件高级筛选。
