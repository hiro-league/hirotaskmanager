# Introduction

The following instructions apply to google vm instance or any instance using Debian 6.0 or later. You may consult with your AI Agent on specific instructions for your instance.

Give your AI Agent information about:
- Host (google cloud)
- OS (Debian 6.0 or later)
- Architecture (x86_64)

# Step-by-step instructions


## **1. Pick hostname/DNS**

You need a public hostname (e.g. hirotm.example.com)
Create an A record pointing to the VPS's public IP address.

Confirm from your client that the DNS has been updated.
```bash
dig +short hirotm.example.com
```

If you don't have a public hostname, Caddy will refuse to issue a TLS cert until DNS resolves. The certificate is used for HTTPS and is required for the app to work.


## **2. Prepare system**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl unzip ca-certificates debian-keyring debian-archive-keyring apt-transport-https ufw
```


## **3. Create a dedicated system user (optional)**

```bash
sudo useradd --system --create-home --shell /bin/bash --home-dir /home/taskmanager taskmanager
sudo -iu taskmanager
```

Confirmation: Now the prompt should be `taskmanager@<hostname>:~$`

Security note: Don't use the root user for the app. Give it its own home so Bun and the ~/.taskmanager profiles are isolated. This is a security best practice.


## **4. Install Bun**

Install:

```bash
curl -fsSL https://bun.sh/install | bash
```

Add Path to ~/.bashrc:

```bash
echo "export BUN_INSTALL=\"\$HOME/.bun\"" >> ~/.bashrc
echo "export PATH=\"\$BUN_INSTALL/bin:\$PATH\"" >> ~/.bashrc
```

confirm bun is installed
```bash
bun --version
```

**Note** You can use npm instead of bun, but bun is recommended for better performance.

## **5. Install Hiro Task Manager**

```bash
sudo -iu taskmanager
~/.bun/bin/bun install -g @hiroleague/taskmanager
```

Confirmation:

```bash
hirotm --version
```

## **6. Firewall — only expose 80/443**

The only ports the public internet needs are SSH, HTTP, and HTTPS.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

## **7. Install a TLS reverse proxy**

The Task Manager API listens on `127.0.0.1:3001`. You need a public-facing reverse proxy that terminates HTTPS for your hostname (from step 1) and forwards to that loopback port.

Pick **one** of the two paths below:

- **7a — Caddy** — minimal config, automatic Let's Encrypt certs out of the box.
- **7b — nginx** — the most widely deployed web server; HTTPS via Certbot.

---

### **7a. Caddy (fresh VPS, nothing on 80/443)**

Caddy auto-provisions HTTPS certificates from Let's Encrypt for the hostname you set up in step 1.

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Write the site config — replace `hirotm.example.com` with the hostname you set up in step 1:

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
hirotm.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
EOF

sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Watch the log on the first reload to confirm Let's Encrypt issued the cert:

```bash
sudo journalctl -u caddy -f
```

If you see `certificate obtained successfully`, you're good. Press `Ctrl+C` to stop tailing.

---

### **7b. nginx**

Install nginx and Certbot's nginx plugin (Certbot handles the Let's Encrypt certificate and renewal):

```bash
# Debian/Ubuntu
sudo apt install -y nginx certbot python3-certbot-nginx

# RHEL/CentOS/Rocky/Alma
sudo dnf install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

Create the vhost — replace `hirotm.example.com` with the hostname from step 1. Drop it where your distro expects (`/etc/nginx/sites-available/` + symlink on Debian/Ubuntu, or `/etc/nginx/conf.d/` on RHEL-style). Start with HTTP only; Certbot will rewrite this file to add HTTPS in the next command.

```bash
sudo tee /etc/nginx/conf.d/hirotm.conf >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name hirotm.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```

Issue the certificate and let Certbot wire HTTPS into the same vhost (it will add `listen 443 ssl;`, the cert paths, and an HTTP→HTTPS redirect):

```bash
sudo certbot --nginx -d hirotm.example.com
```

Verify nginx is happy and the renewal timer is active:

```bash
sudo nginx -t
sudo systemctl status certbot.timer --no-pager
```

A quick smoke test from the VM (will 502 until step 10 starts the Task Manager — that's expected here):

```bash
curl -I https://hirotm.example.com
```

## **8. Run the Task Manager setup wizard**

Run the wizard as the `taskmanager` user. Accepting the defaults puts everything under `~/.taskmanager/profiles/vps/`, which is exactly what the systemd unit above expects.

```bash
sudo -iu taskmanager bash -lc 'hirotaskmanager --setup-server --profile vps'
```

Answer the prompts as follows:

| Prompt | Answer |
|---|---|
| port | `3001` (default) |
| data_dir | press Enter (default) |
| auth_dir | press Enter (default) |
| Should this server accept connections from other machines on the network? | **N** — the reverse proxy (Caddy or nginx) handles remote traffic and forwards it to the loopback-bound API |
| Require a CLI API key for local connections too? | **Y** — defense in depth, so remote callers proxied through Caddy still need a key |
| open browser on start? | **N** — headless server |
| mint a first CLI API key now? | **Y** — label it e.g. `Desktop` |
| set as default profile? | **Y** |
| start server now? | **N** — systemd will own the lifecycle |

> **Important:** When the wizard mints the CLI API key, it prints a `tmk-…` string **once**. Copy it now into your password manager — you'll paste it into your laptop's client profile in step 12. The server only stores a SHA-256 hash; if you lose it, you must mint a new one.


## **10. Start the server under systemd**

```bash
sudo systemctl enable --now taskmanager
sudo systemctl status taskmanager --no-pager
```

Tail the logs to confirm it bound to `127.0.0.1:3001`:

```bash
sudo journalctl -u taskmanager -f
```


## **11. First web login**

From your laptop browser, visit `https://hirotm.example.com`:

1. Choose a **passphrase**.
2. The **recovery key** prints once into the server log. Grab it from the journal and store it in your password manager — it's the only way back into the web UI if you forget the passphrase:

   ```bash
   sudo journalctl -u taskmanager | grep -i "recovery"
   ```

3. Log in with your passphrase.


## **12. Connect a CLI client (from your laptop)**

On your local machine (not the VPS):

```bash
bun install -g @hiroleague/taskmanager
hirotaskmanager --setup-client --profile work
#   api_url : https://hirotm.example.com
#   api_key : tmk-…   (paste from step 9)
#   set as default profile? : Y
```

Verify:

```bash
hirotm boards list
```


## **12. Start Hiro Task Manager as a servce on boot (Optional)**

This makes the Task Manager server start automatically on boot and restart on failure. Create the unit file *before* running the wizard — we'll start the service after the wizard creates the profile.

```bash
sudo tee /etc/systemd/system/taskmanager.service >/dev/null <<'EOF'
[Unit]
Description=Hiro Task Manager
After=network.target

[Service]
Type=simple
User=taskmanager
Group=taskmanager
Environment=PATH=/home/taskmanager/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/taskmanager/.bun/bin/hirotaskmanager server start
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/taskmanager/.taskmanager
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
```

Don't `enable` or `start` it yet — the wizard in the next step needs to create the profile first.


## **Day-2 operations**

Run on the VPS as your sudo user:

```bash
# Service lifecycle
sudo systemctl restart taskmanager
sudo systemctl status taskmanager --no-pager
sudo journalctl -u taskmanager -n 200 --no-pager

# CLI API key management
sudo -iu taskmanager hirotaskmanager server api-key list
sudo -iu taskmanager hirotaskmanager server api-key generate --label "Laptop"
sudo -iu taskmanager hirotaskmanager server api-key revoke tmk-xxxx

# Updates
sudo -iu taskmanager bash -lc 'bun update -g @hiroleague/taskmanager'
sudo systemctl restart taskmanager
```


## **Backups**

All server state lives under one directory — back it up regularly (e.g. nightly to object storage):

- `/home/taskmanager/.taskmanager/` — profile config, CLI key hashes, board/task data, web auth.

```bash
sudo tar czf /root/taskmanager-backup-$(date +%F).tgz /home/taskmanager/.taskmanager
```
