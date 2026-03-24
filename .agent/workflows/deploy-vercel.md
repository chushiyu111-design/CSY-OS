---
description: 强制发布项目到 Vercel (含 Beta 和 正式服) 的标准流程
---

由于本项目配置了特殊的 `vercel.json`，且很容易被 Vercel 的 "Ignored Build Step" 或缓存拦截，**所有 AI 助手（包括你在内）在完成代码修改后，如果用户要求“推送更新”或“发版”，请严格按照以下步骤使用 Vercel CLI 强制发布**，不要仅依赖 `git push`。

### 1. 发布到 Beta 测试环境
（Beta 环境使用独立的 `project.json.beta` 配置别名）
如果当前位于 `feature/voice-input-beta` 分支，请直接运行以下命令强制发布：

```powershell
// turbo-all
Copy-Item .vercel\project.json .vercel\project.json.bak -Force
Copy-Item .vercel\project.json.beta .vercel\project.json -Force
npx vercel --prod --force --yes
Copy-Item .vercel\project.json.bak .vercel\project.json -Force
```

### 2. 发布到 Production 正式环境
发布正式环境需要将代码合并至 `main` 分支。请依次运行以下命令：

```powershell
// turbo-all
git checkout main
git merge feature/voice-input-beta
npx vercel --prod --force --yes
git push origin main
git checkout feature/voice-input-beta
```

**⚠️ 助手须知的强制准则：**
1. **不要省略 `--force`**：绕过缓存的核心。
2. **不要省略 `--yes`**：避免命令行弹出任何需要用户手动点击的确认选项。
3. 请优先使用这个工作流（Workflow）执行发布操作！
