# ============================================================
# deploy-prod.ps1 - 正式链接部署脚本 (sullytest-2-delta.vercel.app)
# ============================================================
# 警告：此脚本会更新正式链接！请确认功能已在 beta 测试通过。
#
# 正式链接已连接 GitHub，推送 main 分支即可自动部署。
# 只有在需要绕过 GitHub 自动部署时，才需手动运行此脚本。
# ============================================================

Write-Host ""
Write-Host "=========================================" -ForegroundColor Red
Write-Host "  ⚠️  警告：即将部署到正式链接  ⚠️" -ForegroundColor Red
Write-Host "  sullytest-2-delta.vercel.app" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Red
Write-Host ""
Write-Host "当前 Git 分支：$(git branch --show-current)" -ForegroundColor Cyan
Write-Host "最新 Commit：$(git log --oneline -1)" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  正式链接已连接 GitHub，推送 main 分支即可自动部署。" -ForegroundColor Yellow
Write-Host "    通常不需要手动运行此脚本！" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "确定要手动部署到正式链接吗？输入 'YES' 确认，其他任意键取消"

if ($confirm -ne "YES") {
    Write-Host ""
    Write-Host "✅ 已取消，未部署任何内容。" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "切换到 sullytest-2 项目..." -ForegroundColor Cyan
npx vercel link --project sullytest-2 --yes

Write-Host ""
Write-Host "正在部署到正式链接..." -ForegroundColor Cyan
npx vercel --prod --yes

Write-Host ""
Write-Host "更新 sullytest-2-delta 别名..." -ForegroundColor Cyan
$deployment = npx vercel ls sullytest-2 2>&1 | Select-String "Ready.*Production" | Select-Object -First 1
Write-Host $deployment

Write-Host ""
Write-Host "部署完成！请重新链接回 beta 项目..." -ForegroundColor Green
npx vercel link --project sullytest-beta --yes

Write-Host ""
Write-Host "✅ 已切回 sullytest-beta，下次 vercel --prod 仍指向 beta。" -ForegroundColor Green
