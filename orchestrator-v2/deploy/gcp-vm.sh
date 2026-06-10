#!/usr/bin/env bash
# Create the dgorch engine VM on GCP.
#
# Usage:
#   PROJECT_ID=my-gcp-project ./deploy/gcp-vm.sh
#   ./deploy/gcp-vm.sh my-gcp-project
#
# Optional env overrides: ZONE (default us-central1-a), VM_NAME (default
# dgorch-engine), MACHINE_TYPE (default e2-small).
#
# NOTE: this script creates billable resources. It is run BY a human who has
# already done `gcloud auth login` and has compute permissions on the project.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${1:-}}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "Usage: PROJECT_ID=<gcp-project> $0   (or: $0 <gcp-project>)" >&2
  exit 1
fi

ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-dgorch-engine}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"

# Resolve startup-script.sh next to this script, so the script works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTUP_SCRIPT="$SCRIPT_DIR/startup-script.sh"
if [[ ! -f "$STARTUP_SCRIPT" ]]; then
  echo "startup script not found: $STARTUP_SCRIPT" >&2
  exit 1
fi

# Idempotence: if the VM already exists, report and exit cleanly.
if gcloud compute instances describe "$VM_NAME" \
    --project "$PROJECT_ID" --zone "$ZONE" >/dev/null 2>&1; then
  echo "VM '$VM_NAME' already exists in $PROJECT_ID/$ZONE — nothing to do."
  echo "SSH in with: gcloud compute ssh $VM_NAME --project $PROJECT_ID --zone $ZONE"
  exit 0
fi

echo "Creating VM '$VM_NAME' ($MACHINE_TYPE, debian-12, 20GB) in $PROJECT_ID/$ZONE ..."
gcloud compute instances create "$VM_NAME" \
  --project "$PROJECT_ID" \
  --zone "$ZONE" \
  --machine-type "$MACHINE_TYPE" \
  --image-family debian-12 \
  --image-project debian-cloud \
  --boot-disk-size 20GB \
  --metadata-from-file startup-script="$STARTUP_SCRIPT"

cat <<EOF

VM created. The startup script (git, Node 22, cloudflared, repo clone + build)
runs on first boot and takes a few minutes. Follow-ups:

  # Watch startup-script progress:
  gcloud compute ssh $VM_NAME --project $PROJECT_ID --zone $ZONE \\
    --command 'sudo journalctl -u google-startup-scripts -f'

  # SSH in:
  gcloud compute ssh $VM_NAME --project $PROJECT_ID --zone $ZONE

  # (Optional) tunnel the webhook port to your laptop instead of cloudflared:
  gcloud compute ssh $VM_NAME --project $PROJECT_ID --zone $ZONE -- -L 8787:localhost:8787

Then follow deploy/README.md steps 2-5 (Linear key, Claude auth, cloudflared
tunnel, start the engine).
EOF
