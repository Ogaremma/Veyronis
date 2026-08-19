$ErrorActionPreference = "Stop"
$anvil = "C:\Users\HP\.foundry\bin\anvil.exe"
if (-not (Test-Path $anvil)) { throw "Anvil was not found at $anvil. Foundry must be installed first." }
& $anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --mnemonic "test test test test test test test test test test test junk"
