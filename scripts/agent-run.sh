#!/usr/bin/env bash
# Runs one research lane headless with Claude Code.
# Usage: scripts/agent-run.sh <prompt-file> <model> <max-budget-usd> <transcript-out> [extra-prompt-text] [--no-mcp]
# Env:   ANTHROPIC_API_KEY (required), AGENT_API_KEY + SITE_URL (required unless --no-mcp)
# Exits non-zero on any agent or API error so the workflow fails and GitHub notifies the owner.
set -euo pipefail

PROMPT_FILE="$1"; MODEL="$2"; BUDGET="$3"; OUT="$4"; EXTRA="${5:-}"; MODE="${6:-}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY is not set}"

ARGS=(-p "$(cat "$PROMPT_FILE")${EXTRA:+

$EXTRA}" --model "$MODEL" --max-budget-usd "$BUDGET" --output-format stream-json --verbose
      --disallowedTools Bash Edit Write NotebookEdit)

if [ "$MODE" != "--no-mcp" ]; then
  : "${AGENT_API_KEY:?AGENT_API_KEY is not set}"; : "${SITE_URL:?SITE_URL is not set}"
  umask 077
  CFG="$(mktemp)"
  trap 'rm -f "$CFG"' EXIT
  # Written by Python from the environment so the key never appears in the command line or logs.
  python3 - "$CFG" <<'PY'
import json, os, sys
json.dump({"mcpServers": {"making-money": {
    "type": "http",
    "url": os.environ["SITE_URL"].rstrip("/") + "/api/mcp",
    "headers": {"Authorization": "Bearer " + os.environ["AGENT_API_KEY"]},
}}}, open(sys.argv[1], "w"))
PY
  ARGS+=(--mcp-config "$CFG" --strict-mcp-config --allowedTools mcp__making-money WebSearch WebFetch)
else
  ARGS+=(--allowedTools WebSearch WebFetch)
fi

set +e
npx -y @anthropic-ai/claude-code@2.1.289 "${ARGS[@]}" > "$OUT"
CODE=$?
set -e

# The last "result" event carries success, cost and the final text.
python3 - "$OUT" "$CODE" <<'PY'
import json, os, sys
path, code = sys.argv[1], int(sys.argv[2])
result = None
for line in open(path, encoding="utf-8", errors="replace"):
    try:
        ev = json.loads(line)
    except ValueError:
        continue
    if ev.get("type") == "result":
        result = ev
summary = os.environ.get("GITHUB_STEP_SUMMARY")
def out(s):
    print(s)
    if summary:
        with open(summary, "a") as f:
            f.write(s + "\n")
if not result:
    out(f"**Agent produced no result** (exit {code}). See the transcript artifact.")
    sys.exit(1)
cost = result.get("total_cost_usd")
out(f"**Cost:** ${cost:.4f}" if isinstance(cost, (int, float)) else "**Cost:** unknown")
out(f"**Turns:** {result.get('num_turns', '?')}  **Status:** {result.get('subtype', '?')}")
out("\n" + str(result.get("result", ""))[:4000])
if result.get("is_error") or code != 0:
    out(f"\n**Run failed** (exit {code}, subtype {result.get('subtype')}).")
    sys.exit(1)
PY
