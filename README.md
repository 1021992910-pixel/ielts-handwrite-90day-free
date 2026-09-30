# 90天雅思手写学习台（免费离线版）

这是一个面向 iPad 和 Apple Pencil 的静态学习网页。

- 不要求登录
- 不使用 AI 接口或 API Key
- 不产生 Token 或服务器费用
- 单词与机经拼写通过 iPad“随手写”转文字后在浏览器本地判分
- 学习进度和手写纸保存在当前浏览器，可导出备份
- 首次联网打开后可通过 Safari“添加到主屏幕”使用

## 本地检查

```powershell
npm run build
npm run validate
$env:PREVIEW_PORT=4179; node local-server.mjs
```

## 发布

`.github/workflows/pages.yml` 会把 `site/` 目录发布到 GitHub Pages。
