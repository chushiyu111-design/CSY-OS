---
description: 部署到正式/测试环境
---

# 部署链接与分支对应关系

| 环境 | 链接 | 部署方式 | Vercel 项目 |
|------|------|----------|------------|
| 🟢 正式环境 | https://sullytest-2-delta.vercel.app/ | Git 推送 `main` 分支（自动部署） | `sullytest-2` |
| 🟡 测试环境 | https://sullytest-beta.vercel.app/ | CLI 手动部署（`vercel --prod`） | `sullytest-beta` |

> [!IMPORTANT]
> - **正式环境**：只通过 Git 推送到 `main` 分支触发自动部署，**不要用 CLI 部署正式环境**
> - **测试环境**：故意断开了 Git 连接，只通过 CLI 手动部署
> - `.vercel/project.json` 必须始终指向 `sullytest-beta`（测试项目），确保 CLI 只能部署到测试环境

# 部署到测试环境（CLI）

用户说"部署到测试/beta"时执行以下步骤：

// turbo-all

1. 确保代码已提交
2. 本地构建
```bash
npx vite build
```
3. CLI 部署到测试环境
```bash
npx -y vercel --prod
```
4. 部署完成后验证：https://sullytest-beta.vercel.app/

# 部署到正式环境（Git）

用户说"部署到正式/上线"时执行以下步骤：

// turbo-all

1. 确保代码已提交到当前分支
2. 切换到 main 分支并合并
```bash
git checkout main
git merge <当前分支> --no-edit
```
3. 推送到远程，Vercel 会自动构建并部署
```bash
git push origin main
```
4. 切回开发分支
```bash
git checkout <开发分支>
```
5. 部署完成后验证：https://sullytest-2-delta.vercel.app/

# 注意事项

- `.vercel/project.json` 指向 `sullytest-beta`（测试），**绝对不要改成 `sullytest-2`**
- 正式环境不需要也不应该用 CLI 部署
- 测试环境不连 Git，防止意外自动部署
