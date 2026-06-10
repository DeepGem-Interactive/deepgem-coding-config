#!/usr/bin/env bash
#
# linear-attach-put.sh — Step 2 of attaching a file to a Linear issue.
#
# Linear's MCP attachment flow is three steps, two of which are MCP tool calls
# the Coordinator makes directly; this script is the middle (raw byte PUT):
#
#   1. MCP:  prepare_attachment_upload(issue, filename, contentType, size)
#            → returns { uploadRequest: { url, headers }, assetUrl }
#   2. THIS: linear-attach-put.sh <file> '<uploadRequest JSON>'   (within 60s)
#   3. MCP:  create_attachment_from_upload(issue, assetUrl)
#
# Pass the whole uploadRequest object (or the full prepare response) as the
# second argument; the script pulls .url and .headers and PUTs the bytes with
# those exact signed headers. Prints "HTTP 200" on success.
#
set -euo pipefail

FILE="${1:-}"; REQ="${2:-}"
[ -n "$FILE" ] && [ -n "$REQ" ] || { echo "usage: linear-attach-put.sh <file> '<uploadRequest-json>'" >&2; exit 1; }
[ -f "$FILE" ] || { echo "linear-attach-put: file not found: $FILE" >&2; exit 1; }

python3 - "$FILE" "$REQ" <<'PY'
import json, sys, urllib.request, urllib.error
file, req = sys.argv[1], sys.argv[2]
r = json.loads(req)
# Accept either the uploadRequest object or the full prepare response.
if "uploadRequest" in r:
    r = r["uploadRequest"]
url = r["url"]
headers = r.get("headers", {})
data = open(file, "rb").read()
request = urllib.request.Request(url, data=data, method="PUT", headers=headers)
try:
    resp = urllib.request.urlopen(request)
    print("HTTP", resp.status)
except urllib.error.HTTPError as e:
    sys.stderr.write("HTTP %s: %s\n" % (e.code, e.read()[:300]))
    sys.exit(1)
PY
