# Deploying the dgorch engine

Runbook for running orchestrator-v2 (`dgorch`) on a small always-on box, so
runs survive your laptop closing. Two options: a GCP VM (primary, below) or
the Docker image (`deploy/Dockerfile`, header comments explain usage).

**Every step here is run by a human.** Nothing in this directory creates
billable cloud resources, registers webhooks, or handles credentials on its
own — the scripts stop where credentials or money start.

## 1. Create the VM

```bash
gcloud auth login                      # once
./deploy/gcp-vm.sh YOUR_PROJECT_ID    # creates e2-small "dgorch-engine" (billable)
```

Idempotent — if the VM exists it says so and exits. The startup script
installs git, Node 22, cloudflared, then clones this repo to
`/opt/deepgem-coding-config` and builds `orchestrator-v2`. Watch progress:

```bash
gcloud compute ssh dgorch-engine --project YOUR_PROJECT_ID --zone us-central1-a \
  --command 'sudo journalctl -u google-startup-scripts -f'
```

## 2. SSH in, install the Linear key

```bash
gcloud compute ssh dgorch-engine --project YOUR_PROJECT_ID --zone us-central1-a

mkdir -p ~/.dgorch
printf '%s' 'lin_api_...' > ~/.dgorch/linear.key
chmod 600 ~/.dgorch/linear.key
```

The engine reads `LINEAR_API_KEY` from the environment; export it from the
key file when starting (shown in step 5).

## 3. Authenticate Claude on the VM

Either log in with Claude Code (subscription auth):

```bash
claude login
```

…or set an API key for the Agent SDK:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

(For systemd, put it in the unit's `Environment=` lines — step 5.)

## 4. Expose the webhook port (cloudflared quick tunnel)

Linear pushes verdict events (issue status / comment changes) to a webhook so
the engine doesn't have to poll. Quick start:

```bash
cloudflared tunnel --url http://localhost:8787
```

This prints an `https://<random>.trycloudflare.com` URL. Then, in Linear
**Settings → API → Webhooks**:

1. Create a webhook pointing at that URL.
2. Subscribe it to issue **status change** and **comment** events (team DEE).
3. Copy the webhook **signing secret** Linear shows you.

On the VM:

```bash
export LINEAR_WEBHOOK_SECRET='<signing secret from Linear>'
```

Note: a quick tunnel gets a **new URL on every restart** — re-point the Linear
webhook if you restart cloudflared (or set up a named tunnel for a stable
hostname). Webhooks are an optimization: the engine also polls Linear every
the `--poll-sec` interval (default 120s), so missed webhooks only mean slower pickup.

## 5. Start the engine

The repo under orchestration must be on the VM (clone it into e.g.
`~/projects/<name>`). State lives in `<repo>/.dgorch`, so `serve` is safe to
restart — it resumes from SQLite.

Quick (tmux):

```bash
tmux new -s dgorch
cd /opt/deepgem-coding-config/orchestrator-v2
export LINEAR_API_KEY="$(cat ~/.dgorch/linear.key)"
export LINEAR_TEAM_KEY=DEE          # your Linear team key
export LINEAR_WEBHOOK_SECRET=... # from step 4
# poll interval is a flag: --poll-sec 60
node dist/index.js serve --repo ~/projects/myproject --prd ~/projects/myproject/prd.md --webhook-port 8787
```

Durable (systemd) — `/etc/systemd/system/dgorch.service`:

```ini
[Unit]
Description=dgorch engine (orchestrator-v2 serve)
After=network-online.target
Wants=network-online.target

[Service]
User=YOUR_SSH_USER
WorkingDirectory=/opt/deepgem-coding-config/orchestrator-v2
Environment=NODE_ENV=production
# (poll interval via --poll-sec flag on ExecStart)
Environment=LINEAR_TEAM_KEY=DEE
Environment=LINEAR_WEBHOOK_SECRET=REPLACE_ME
# Or: Environment=ANTHROPIC_API_KEY=REPLACE_ME (if not using `claude login`)
ExecStart=/bin/bash -lc 'export LINEAR_API_KEY="$(cat ~/.dgorch/linear.key)"; exec node dist/index.js serve --repo %h/projects/myproject --prd %h/projects/myproject/prd.md --webhook-port 8787 --poll-sec 60'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dgorch
journalctl -u dgorch -f
```

## Teardown

```bash
gcloud compute instances delete dgorch-engine --project YOUR_PROJECT_ID --zone us-central1-a
```
