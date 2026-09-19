#!/usr/bin/env bash
# Deploy TokenScope + RiskConsumer to Bradbury testnet.
#
# Run from the repository root:   bash tools/deploy_bradbury.sh
#
# ---------------------------------------------------------------------------
# READ THIS FIRST — two things about Bradbury changed on 2026-09-19, and both
# of them stop this script dead if you do not know about them.
#
# 1. THE CLI MUST BE PINNED TO 0.39.2.
#    genlayer 0.40.0-rc.3 (published 2026-09-03) speaks the v0.6 calldata
#    format and cannot talk to old-format contracts on Bradbury at all. Reads
#    against the LIVE 1.0.0 deployment fail under it with
#      ValueError: call to private method `Contract.__handle_undefined_method__`
#    and deploys fail at eth_estimateGas. 0.39.2 is the last release that
#    speaks the format Bradbury's deployed contracts were built with.
#
#      npm install -g genlayer@0.39.2
#
# 2. THE DEPLOY CEILING IS NOW ~20,170 BYTES OF SOURCE, AND TOKENSCOPE IS OVER
#    IT. Bradbury rejects any transaction whose gas limit exceeds 2**24
#    (16,777,216) with `gas limit too high`, and deploy gas runs at ~809.5 gas
#    per source byte. The 1.1.0 artifact is 51,390 bytes -> ~41.8M gas.
#
#    This is not a TokenScope problem. The 52,070-byte 1.0.0 artifact that is
#    live on Bradbury RIGHT NOW cannot be redeployed either; that was checked
#    by pulling it from git and trying it byte for byte. Measurements and the
#    bisection are in docs/PROBE.md section 11.
#
#    The script still runs end to end, because the day the cap is raised this
#    is exactly what should be run. It checks the size first and tells you
#    what it expects to happen.
# ---------------------------------------------------------------------------
#
# Needs a funded Bradbury account. Deploys the same artifacts that are live on
# Studionet - verify with `shasum -a 256 build/*.min.py` against deployments.json.
set -euo pipefail

cd "$(dirname "$0")/.."

# Measured 2026-09-19 by bisection against padded probe contracts.
BRADBURY_GAS_CAP=16777216
GAS_PER_BYTE=810
GAS_FIXED=240000

echo "==> genlayer CLI version"
genlayer --version
cat <<'NOTE'
    If that is not 0.39.2, stop: 0.40.x cannot call old-format Bradbury
    contracts. `npm install -g genlayer@0.39.2`
NOTE

echo
echo "==> switching to Bradbury"
genlayer network set testnet-bradbury

echo
echo "==> artifact checksums (must match deployments.json)"
shasum -a 256 build/TokenScope.min.py build/RiskConsumer.min.py

echo
echo "==> projected deploy gas against Bradbury's per-transaction cap"
for artifact in build/TokenScope.min.py build/RiskConsumer.min.py; do
  bytes=$(wc -c < "$artifact" | tr -d ' ')
  gas=$(( bytes * GAS_PER_BYTE + GAS_FIXED ))
  if [ "$gas" -le "$BRADBURY_GAS_CAP" ]; then
    verdict="fits"
  else
    verdict="OVER THE CAP - expect 'gas limit too high'"
  fi
  printf '    %-28s %7s bytes  ~%9s gas   %s\n' \
    "$artifact" "$bytes" "$gas" "$verdict"
done
echo "    cap ${BRADBURY_GAS_CAP} (2**24), ~${GAS_PER_BYTE} gas/byte  ->  ceiling ~20,170 source bytes"

echo
echo "==> deploying TokenScope"
genlayer deploy --contract build/TokenScope.min.py 2>&1 | tee /tmp/ts_deploy.log

ORACLE=$(grep -oE "0x[a-fA-F0-9]{40}" /tmp/ts_deploy.log | tail -1)
if [ -z "$ORACLE" ]; then
  echo "!! could not read the oracle address from the deploy output" >&2
  echo "!! if the log says 'gas limit too high', that is the ceiling above," >&2
  echo "!! not a fault in the contract. See docs/PROBE.md section 11." >&2
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
echo
echo "Milestone 1.1.0 surface:"
echo "  genlayer write $ORACLE rescan_token --args 1"
echo "  genlayer call  $ORACLE get_risk_history --args 1"
echo "  genlayer call  $ORACLE batch_scan --args '[\"0xdAC17F958D2ee523a2206206994597C13D831ec7\",\"0x6982508145454ce325ddbe47a25d4ec3d2311933\"]' ethereum"
echo "  genlayer call  $CONSUMER get_oracle_stats"
echo "  genlayer write $CONSUMER list_token --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo
echo "Verify the deployed source matches the local artifact:"
echo "  genlayer code $ORACLE | diff - build/TokenScope.min.py"
echo
echo "Switch back to Studionet with:  genlayer network set studionet"
