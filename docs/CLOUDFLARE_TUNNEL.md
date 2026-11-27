# Cloudflare Tunnel — public BoxBox Replay

This host already has a Cloudflare-connected, remotely managed tunnel:

- connector container: `cloudflared-ssh-tunnel`
- network mode: `host`
- tunnel ID: `62eac503-f5aa-463a-93a1-7e6a9590897b`
- current SSH hostname: `ssh-homelab.kelanach.xyz`
- BoxBox local health: `http://127.0.0.1:8501/api/healthz`
- Tailscale health: `http://100.124.184.116:8501/api/healthz`

The connector can reach the published port on `localhost`; no new tunnel token is
needed for the existing tunnel. The only required Cloudflare change is a public
hostname routed to `HTTP://localhost:8501`.

## App-side change already made

`web/nginx.conf` now trusts `CF-Connecting-IP` **only** when nginx sees the
request from Docker's bridge gateway (`172.16.0.0/12`) or loopback. A direct LAN
or Tailscale request keeps its real source address.

This matters because the API's per-client AI limiter keys on `X-Real-IP`. Without
this, every Cloudflare visitor reaches nginx as `172.23.0.1` and shares one
3/min + 20/hour bucket.

The app still publishes `0.0.0.0:8501`, so the existing Tailscale address keeps
working. The tunnel is the only intended public path; do not port-forward 8501.

## Cloudflare dashboard steps

1. Open **Cloudflare Zero Trust → Networks → Tunnels**.
2. Select the tunnel with ID `62eac503-f5aa-463a-93a1-7e6a9590897b`
   (the connector is `cloudflared-ssh-tunnel`).
3. Open **Public Hostname → Add a public hostname**.
4. Fill:
   - **Subdomain:** `boxbox`
   - **Domain:** `kelanach.xyz`
   - **Path:** leave empty
   - **Service type:** `HTTP`
   - **URL:** `localhost:8501`
5. Keep **Host header** empty unless Cloudflare requires it; nginx uses
   `server_name _`.
6. Save. Cloudflare creates the DNS record automatically.
7. Wait for the hostname to show **Healthy**, then test:

```bash
curl -fsS https://boxbox.kelanach.xyz/api/healthz
# {"ok":true}

curl -sI https://boxbox.kelanach.xyz/ | grep -i content-security-policy
curl -s https://boxbox.kelanach.xyz/api/ai/status
```

Do not change the existing `ssh-homelab.kelanach.xyz` public hostname.

## Cloudflare settings

### SSL

- Enable **Always Use HTTPS**.
- Cloudflare terminates TLS at the edge; the origin service is HTTP on
  `localhost:8501` through the encrypted tunnel.
- Do not create an origin certificate for this route.

### WAF rate limit

Add a rate-limit rule for the paid-key paths:

- Expression:
  `http.request.uri.path matches "^/api/(ai|coach)/"`
- Requests: `10` per `1 minute`
- Action: **Block**
- Duration: `1 minute`

The app already enforces 3/min + 20/hour per client and 6/min shared. Cloudflare
is the outer limit, not a replacement.

### AI key and cost

Public visitors can hit `/api/ai/*` if `OPENCODE_API_KEY` is configured in the
server `.env`. Put a hard monthly spend cap on the OpenCode provider. If that is
not acceptable, leave the key unset on this deployment; the rest of the app stays
usable and the UI says AI is not configured.

### Access

For a private staging hostname (`boxbox-staging.kelanach.xyz`), add Cloudflare
Access with an email policy. For the public `boxbox` hostname, leave Access off;
the app already has no accounts and is intended to be public.

## Tailscale

Tailscale is **not** removed by the tunnel setup. The app remains published on
the host, so this keeps working after the nginx deploy:

```bash
curl -fsS http://100.124.184.116:8501/api/healthz
```

If you later decide to bind only to localhost, Tailscale access will stop. Do not
do that while this requirement is active.

## Rollback

- Remove the `boxbox` public hostname from the tunnel.
- No app rollback is needed; the local and Tailscale endpoints are unchanged.
- The tunnel connector and `ssh-homelab` route are untouched.

## Sources

- Cloudflare Tunnel: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/>
- Public hostnames: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/routing-to-tunnel/>
- `CF-Connecting-IP`: <https://developers.cloudflare.com/fundamentals/reference/http-headers/>
- Rate limiting rules: <https://developers.cloudflare.com/waf/rate-limiting-rules/>
