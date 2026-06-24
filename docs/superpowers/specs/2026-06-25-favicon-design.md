# 网站专属 Icon 设计

## 背景

当前浏览器中打开系统页面时没有显示网站专属 icon。检查结果：

- `index.html` 只有基础 meta 和标题，没有 favicon 声明。
- 项目没有 `public/` 静态资源目录。
- 项目内没有现成的 `favicon.ico`、`favicon.svg`、logo、manifest 或其他可复用图标资源。

因此浏览器只能显示默认图标。

## 目标

- 浏览器标签页显示“护理排班管理系统”的专属 icon。
- 图标风格和当前后台系统的蓝色专业感一致。
- 实现保持轻量，不引入图片生成流程或额外依赖。
- 不改变页面布局、业务逻辑、登录逻辑、权限逻辑或构建流程。

## 推荐方案

采用 SVG favicon：

- 新增 `public/favicon.svg`。
- 在 `index.html` 的 `<head>` 中添加：

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Vite 会将 `public/` 下的文件按根路径发布，所以 `/favicon.svg` 可直接被浏览器加载。

## 图标视觉

图标使用简洁的方形底图，适配浏览器标签页小尺寸显示：

- 背景：品牌蓝色。
- 前景：白色“护”字，突出护理系统属性。
- 辅助元素：轻量日历格或医疗十字二选一；如果小尺寸识别度不够，优先保留“护”字。
- 尺寸：SVG 使用 `viewBox="0 0 64 64"`，保证缩放清晰。

推荐第一版使用“蓝底 + 白色护字 + 简单日历角标”。这个方案比完整院徽或复杂插画更适合 16px/32px favicon 场景。

## 文件范围

包含：

- `public/favicon.svg`
- `index.html`
- 新增或更新一个轻量测试，检查 `index.html` 包含 favicon 声明，且 `public/favicon.svg` 存在。

不包含：

- 不新增 `favicon.ico`。
- 不新增 `apple-touch-icon.png`。
- 不新增 `site.webmanifest`。
- 不做 PWA。
- 不修改页面 header、登录页、系统内 logo 或标题文案。

## 验证口径

实现后需要验证：

- `index.html` 包含 `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`。
- `public/favicon.svg` 存在，并且是有效 SVG。
- `npm run test` 通过。
- `npm run build` 通过。
- 本地浏览器打开页面后，标签页可加载 `/favicon.svg`。

## 风险与取舍

SVG favicon 对现代浏览器支持良好，体积小且清晰。老浏览器对 SVG favicon 的支持不如 `.ico`，但本系统主要面向现代桌面浏览器和局域网/内部使用场景，先采用 SVG 足够轻量。

如果后续需要兼容更老的浏览器或移动端桌面图标，可以再补充 `favicon.ico` 和 `apple-touch-icon.png`，但本次不扩大范围。
