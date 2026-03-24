# 部署到内测版 sullytest-beta.vercel.app
# 用法：在终端里运行  .\deploy-beta.ps1

$originalConfig = Get-Content .vercel\project.json -Raw
$betaConfig = '{"projectId":"prj_NEW_BETA_ID","orgId":"team_JCOqULvu04AL4mcsmVHWo0Xk","projectName":"sullytest-beta"}'

# 先获取 beta 项目的真实 ID
# 临时切换到 beta 项目
Set-Content .vercel\project.json $betaConfig

Write-Host "正在部署到内测版..." -ForegroundColor Cyan
npx vercel --prod --yes

# 恢复原始配置
Set-Content .vercel\project.json $originalConfig
Write-Host "部署完成！内测链接: https://sullytest-beta.vercel.app" -ForegroundColor Green
