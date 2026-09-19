#!/usr/bin/env bash
# Deploy TokenScope + RiskConsumer to GenLayer Studio Devnet (chain 61997).
#
# Run from the repository root:   bash tools/deploy_studio_dev.sh
#
# ---------------------------------------------------------------------------
# Two things about studio-dev differ from the older networks, and both of them
# stop a deploy dead if you do not know about them.
#
# 1. IT RUNS THE v0.6 CONTRACT FORMAT. The artifacts in build/ carry the
#    two-line runner header
#
#        # v0.3.0
#        # { "Depends": "py-genlayer:test" }
#
#    and use `gl.contract.Contract`, `gl.storage.TreeMap`, `gl.storage.allow`
#    and `gl.vm.run_nondet`. A pre-v0.6 artifact deploys and then dies at
#    runtime; the only error reported is `invalid_contract runner malformed`,
#    which names neither the line nor the reason. docs/PROBE.md section 12 has
#    how each of those was established.
#
# 2. EVERY WRITE NEEDS A FEE. Without one the transaction reverts with
#    `FeeValueMustBeNonZero(1)`. `--fee-value` alone is NOT enough - the
#    distribution object has to go along with it, which is what this script
#    reads out of `genlayer estimate-fees` below.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> genlayer CLI version"
genlayer --version

echo
echo "==> switching to studio-dev"
genlayer network set studio-dev

echo
echo "==> artifact checksums (must match deployments.json)"
shasum -a 256 build/TokenScope.min.py build/RiskConsumer.min.py

echo
echo "==> runner header (must be the v0.6 two-liner)"
head -2 build/TokenScope.min.py

echo
echo "==> estimating fees"
FEES_JSON=$(genlayer estimate-fees --json 2>/dev/null | tail -1)
DIST=$(python3 -c "import json,sys; print(json.dumps({'distribution': json.loads(sys.argv[1])['distribution']}))" "$FEES_JSON")
FEE_VALUE=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['feeValue'])" "$FEES_JSON")
echo "    feeValue $FEE_VALUE"

echo
echo "==> deploying TokenScope"
genlayer deploy --contract build/TokenScope.min.py \
  --fees "$DIST" --fee-value "$FEE_VALUE" 2>&1 | tee /tmp/ts_deploy.log

ORACLE=$(grep -oE "contract_address: '0x[a-fA-F0-9]{40}'" /tmp/ts_deploy.log \
         | grep -oE "0x[a-fA-F0-9]{40}" | tail -1)
if [ -z "$ORACLE" ]; then
  echo "!! could not read the oracle address from the deploy output" >&2
  echo "!! FINISHED_WITH_ERROR usually means a format mismatch - run" >&2
  echo "!!   genlayer receipt <tx> | tr ',' '\\n' | grep -i stderr" >&2
  exit 1
fi
echo
echo "==> TokenScope deployed at $ORACLE"

echo
echo "==> setting the demo fee to 0"
# The CLI has no flag for attaching CONTRACT value to a write - `--fee-value`
# is the network fee deposit, a different thing - so a non-zero fee_wei would
# make request_risk uncallable from the command line. set_fee is owner-only
# and bounded to 0..0.1 GEN; the fee path itself is covered by the offline
# suite.
genlayer write "$ORACLE" set_fee --args 0 --fees "$DIST" --fee-value "$FEE_VALUE"

echo
echo "==> deploying RiskConsumer pointed at $ORACLE"
genlayer deploy --contract build/RiskConsumer.min.py --args "$ORACLE" \
  --fees "$DIST" --fee-value "$FEE_VALUE" 2>&1 | tee /tmp/rc_deploy.log

CONSUMER=$(grep -oE "contract_address: '0x[a-fA-F0-9]{40}'" /tmp/rc_deploy.log \
           | grep -oE "0x[a-fA-F0-9]{40}" | tail -1)

echo
echo "======================================================================"
echo "  TokenScope     $ORACLE"
echo "  RiskConsumer   $CONSUMER"
echo "======================================================================"
echo
echo "Smoke test (reads are free and need no fee):"
echo "  genlayer call  $ORACLE get_config"
echo "  genlayer call  $ORACLE get_stats"
echo
echo "Scoring a token is a write, so it needs the fee flags:"
echo "  genlayer write $ORACLE request_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum --fees '\$DIST' --fee-value \$FEE_VALUE"
echo
echo "Milestone 1.1.0 surface:"
echo "  genlayer call  $ORACLE get_risk --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo "  genlayer call  $ORACLE get_risk_history --args 1"
echo "  genlayer call  $ORACLE batch_scan --args '[\"0xdAC17F958D2ee523a2206206994597C13D831ec7\",\"0x6982508145454ce325ddbe47a25d4ec3d2311933\"]' ethereum"
echo "  genlayer call  $ORACLE check_rug_pull --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo "  genlayer call  $CONSUMER preview_listing --args 0xdAC17F958D2ee523a2206206994597C13D831ec7 ethereum"
echo
echo "Verify the deployed source matches the local artifact:"
echo "  genlayer code $ORACLE | diff - build/TokenScope.min.py"
