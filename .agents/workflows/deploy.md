---
description: 部署 CSY-OS 前端到 Vercel
---

# CSY-OS 部署流程

| 项目 | 值 |
|------|------|
| Vercel 项目 | `csy-os` |
| GitHub 仓库 | `chushiyu111-design/CSY-OS` |
| 部署方式 | 推送 `main` 分支 → Vercel 自动构建部署 |

## 部署到正式环境

用户说"部署/上线"时执行以下步骤：

// turbo-all

1. 确保代码已提交
```bash
git add -A && git commit -m "<提交信息>"
```
2. 推送到远程 main 分支，Vercel 自动部署
```bash
git push origin main
```

## 后端相关

前端配合独立后端 `csyos-backend`（新加坡 2H4G VPS），用于图扩散记忆检索、24/7 Agent、多端同步。
