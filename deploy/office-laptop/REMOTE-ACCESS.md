# Remote Access Setup (Cloudflare Tunnel)

Access your FHE Project Board from anywhere with a free Cloudflare Tunnel.
No port forwarding. No VPN. Free HTTPS with a real domain.

## Quick Start (if tunnel already created)

If you've already created the tunnel in Cloudflare, just run:
```bash
bash deploy/office-laptop/go-live.sh
```
It will prompt for your token and URL, then start everything.

---

## Full Setup

### 1. Create a Cloudflare account
Go to https://dash.cloudflare.com and sign up (free).

### 2. Add your domain
- Go to your Cloudflare dashboard
- Click **Add a site** and follow the steps to add your domain
- Update your domain's nameservers to the ones Cloudflare gives you

### 3. Create a tunnel
1. Go to https://one.dash.cloudflare.com
2. Click **Networks** → **Tunnels** → **Create a tunnel**
3. Select **Cloudflared** as the connector type
4. Name it `FHE-Project-Board`
5. Follow the install connector steps — you'll see a token (starts with `eyJ...`)
6. **Copy and save that token** — you'll need it

### 4. Add a route (Published Application)
After the tunnel is created and showing as **Healthy**:

1. Click on your tunnel name (FHE-Project-Board)
2. Click **Edit**
3. You'll see **"Add a route"** with these options:
   - **Published application** ← Click this one
   - Private hostname
   - Private CIDR
   - VPC
4. Fill in the route:
   - **Subdomain**: `board` (or whatever you want — this becomes `board.yourdomain.com`)
   - **Domain**: select your domain from the dropdown
   - **Path**: leave blank
   - **Service Type**: `HTTP`
   - **URL**: `app:8080`
5. Click **Save hostname**

### 5. Launch everything
On your office laptop, from the project root:
```bash
bash deploy/office-laptop/go-live.sh
```

The script will:
- Generate secure database and JWT passwords (if first run)
- Ask for your Cloudflare tunnel token
- Ask for your public URL (e.g., `https://board.yourdomain.com`)
- Build and start the app, database, and tunnel
- Run migrations and seed the default admin user

### 6. Log in
Open your public URL in any browser:
- **Email**: `admin@floridahorizoneng.com`
- **Password**: `admin123`
- **Change the password immediately after first login!**

---

## Managing the App

**View all logs:**
```bash
cd deploy/office-laptop
docker compose -f docker-compose.prod.yml logs -f
```

**View tunnel logs only:**
```bash
docker compose -f docker-compose.prod.yml logs tunnel
```

**Stop everything:**
```bash
docker compose -f docker-compose.prod.yml --profile tunnel down
```

**Restart the app (e.g., after config change):**
```bash
docker compose -f docker-compose.prod.yml --profile tunnel restart
```

**Stop remote access only (keep app running locally):**
```bash
docker compose -f docker-compose.prod.yml stop tunnel
```

**Manual database backup:**
```bash
docker compose -f docker-compose.prod.yml --profile backup run --rm db-backup
```

## Troubleshooting

**Tunnel shows "No routes":**
You skipped step 4. Edit the tunnel in Cloudflare → Add a route → Published application → set service to `http://app:8080`.

**Tunnel won't connect:**
```bash
docker compose -f docker-compose.prod.yml logs tunnel
```
Check that the token in `.env` matches what Cloudflare shows.

**App not reachable through tunnel:**
Make sure the route's service URL is `http://app:8080` (not `localhost:8080`). The `app` hostname resolves inside the Docker network.

**502 Bad Gateway:**
The app container may still be starting. Wait 30 seconds and refresh. Check app logs:
```bash
docker compose -f docker-compose.prod.yml logs app
```

**Want to change the public URL later:**
Edit `deploy/office-laptop/.env`, update `CLIENT_URL`, then:
```bash
docker compose -f docker-compose.prod.yml restart app
```
