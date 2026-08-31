#!/usr/bin/env bash
# Deploy TokenScope + RiskConsumer to Bradbury testnet.
#
# Run from the repository root:   bash tools/deploy_bradbury.sh
#
# Needs a funded Bradbury account. Deploys the same artifacts that are live on
# Studionet - verify with `shasum -a 256 build/*.min.py` against deployments.json.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> switching to Bradbury"
genlayer network set testnet-bradbury

echo "==> artifact checksums (must match deployments.json)"
shasum -a 256 build/TokenScope.min.py build/RiskConsumer.min.py

echo
echo "==> deploying TokenScope"
genlayer deploy --contract build/TokenScope.min.py 2>&1 | tee /tmp/ts_deploy.log

ORACLE=$(grep -oE "0x[a-fA-F0-9]{40}" /tmp/ts_deploy.log | tail -1)
if [ -z "$ORACLE" ]; then
  echo "!! could not read the oracle address from the deploy output" >&2
  exit 1
fi
echo
echo "==> TokenScope deployed at $ORACLE"

echo
echo "==> deploying RiskConsumer pointed at $ORACLE"
genlayer deploy --contract build/RiskConsumer.min.py --args "$ORACLE" 2>&1 | tee /tmp/rc_deploy.log

CONSUMER=$(grep -oE "0x[a-fA-F0-9]{40}" /tmp/rc_deploy.log | tail -1)

echo
echo "==> setting the demo fee to 0"
# The genlayer CLI hardcodes `value: 0n` on every write, so there is no way to
# attach payable value from the command line. A non-zero fee would make
# request_risk uncallable from the CLI. set_fee is owner-only, 0..0.1 GEN.
genlayer write "$ORACLE" set_fee --args 0

echo
echo "======================================================================"
echo "  TokenScope     $ORACLE"
echo "  RiskConsumer   $CONSUMER"
echo "======================================================================"
echo
echo "Smoke test:"
echo "  genlayer call  $ORACLE get_config"
echo "  genlayer write $ORACLE request_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo "  genlayer call  $ORACLE get_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo "  genlayer call  $ORACLE verify_risk --args 1"
echo "  genlayer call  $ORACLE check_rug_pull --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo "  genlayer call  $CONSUMER get_oracle_stats"
echo "  genlayer write $CONSUMER list_token --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo
echo "Verify the deployed source matches the local artifact:"
echo "  genlayer code $ORACLE | diff - build/TokenScope.min.py"
echo
echo "Switch back to Studionet with:  genlayer network set studionet"
