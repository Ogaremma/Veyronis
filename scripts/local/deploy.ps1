$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$root\local\contracts.json")) { New-Item -ItemType Directory -Force "$root\local" | Out-Null }
$accounts = node "$root\scripts\local\accounts.mjs" | ConvertFrom-Json
$env:LOCAL_VERIFIER_ADDRESS = ($accounts.accounts | Where-Object role -eq "verifier").address
$deployer = ($accounts.accounts | Where-Object role -eq "deployer")
$forge = "C:\Users\HP\.foundry\bin\forge.exe"
if (-not (Test-Path $forge)) { throw "Forge was not found at $forge." }
Push-Location $root
try {
  & $forge script contracts/script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --private-key $deployer.privateKey --broadcast
  if ($LASTEXITCODE -ne 0) { throw "Local registry deployment failed." }
  $broadcast = Get-Content "$root\broadcast\DeployLocal.s.sol\31337\run-latest.json" | ConvertFrom-Json
  $registry = $broadcast.transactions | Where-Object { $_.contractName -eq "EvidenceClaimRegistry" } | Select-Object -First 1
  if (-not $registry.contractAddress) { throw "Deployment broadcast did not contain EvidenceClaimRegistry." }
  @{ chainId = 31337; rpcUrl = "http://127.0.0.1:8545"; evidenceRegistry = $registry.contractAddress; deployedAt = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content "$root\local\contracts.json"
  Write-Host "Local deployment written to local/contracts.json: $($registry.contractAddress)"
} finally { Pop-Location }
