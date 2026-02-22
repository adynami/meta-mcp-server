# Troubleshooting

## Server Won't Start

**Error: `META_ACCESS_TOKEN is required`**

The environment variable is not set. Check:
- `META_ACCESS_TOKEN` is present in the Claude Desktop config `env` block
- There are no typos in the variable name
- The config file is valid JSON

**Error: `META_AD_ACCOUNT_ID must start with "act_"`**

Your account ID is missing the `act_` prefix. Change `123456789` to `act_123456789`.

---

## Authentication Errors

**Error: `Auth expired (code 190). Run "npm run setup" to re-authenticate.`**

Your long-lived token has expired (tokens last ~60 days). Re-run:

```bash
cd ~/meta-mcp-server && npm run setup
```

Restart Claude Desktop after the wizard completes.

**Error: `Permission denied (code 10). The access token may not have the required permissions.`**

The token was generated without all required scopes. Re-run `npm run setup` and ensure you approve all requested permissions on the Facebook login screen.

To check current permissions:
```bash
node check-token.mjs
```

---

## Rate Limiting

**Error: `Rate limited (code 4 or 17). Try again in a moment.`**

Meta's Marketing API has usage limits. The server includes a shared rate limiter that queues calls. If you hit this:

- Wait 1–2 minutes and retry
- Avoid sending many rapid requests in quick succession

---

## Campaign Deployment Failures

**`meta_deploy_campaign` returns `{ success: false, rolled_back: true }`**

The server automatically rolls back partial creations. The `failed_at` field tells you which step failed: `campaign`, `adset`, or `ad`.

Common causes:

| `failed_at` | Likely Cause |
|---|---|
| `campaign` | Invalid objective or budget |
| `adset` | Invalid targeting spec, bid strategy requires `bid_amount`, or pixel required |
| `ad` | Invalid `image_hash`, missing `page_id`, or ad copy policy violation |

Use `DRY_RUN=true` to validate your parameters before going live.

**Ad copy rejected**

Meta reviews ad creatives against its advertising policies. Common rejection reasons:
- Prohibited content (certain industries, claims, or language)
- Images with too much text overlay (>20% rule, though less strictly enforced now)
- Landing page not matching ad content

Check the `issues[]` array in the response for the specific rejection reason.

---

## Image Upload Issues

**Error: file not found or file too large**

- Ensure the path is **absolute** (e.g. `/Users/you/images/ad.jpg`, not `~/images/ad.jpg`)
- Maximum file size is 30 MB
- Supported formats: `jpg`, `jpeg`, `png`, `gif`, `bmp`, `webp`

**Warning about aspect ratio**

Aspect ratios outside 0.5:1 – 2:1 may be cropped by Meta. Recommended:
- **1:1** (1080×1080) for feed ads
- **1.91:1** (1200×628) for link ads

---

## `meta_duplicate_campaign` Times Out

The duplication process polls Meta's async job API. If the job takes longer than ~5 minutes, the tool will return a timeout error. This is rare but can happen for campaigns with many ad sets. Try again — the async job may have completed on Meta's side.

---

## Claude Can't Find the Tools

If Claude responds "I don't have access to Meta advertising tools":

1. Confirm the server is listed in `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Check that `dist/index.js` exists (run `npm run build` if not)
3. Restart Claude Desktop
4. Check Claude Desktop's MCP logs for startup errors

**macOS log location:**
```
~/Library/Logs/Claude/mcp-server-meta-marketing.log
```

---

## API Version Mismatch

If tools return unexpected fields or errors about unsupported parameters, your `META_API_VERSION` may be out of date. The server defaults to `v25.0`. Update if needed:

```json
"META_API_VERSION": "v25.0"
```
