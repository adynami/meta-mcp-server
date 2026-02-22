# Configuration

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `META_ACCESS_TOKEN` | Yes | — | Long-lived Meta access token |
| `META_AD_ACCOUNT_ID` | Yes | — | Ad account ID in `act_XXXXXXXXX` format |
| `META_APP_ID` | No | `REDACTED_APP_ID` | Meta app ID |
| `META_APP_SECRET` | No | *(configured)* | Meta app secret |
| `META_API_VERSION` | No | `v25.0` | Meta Graph API version |
| `DRY_RUN` | No | `false` | Set to `true` to simulate write operations |

> `META_AD_ACCOUNT_ID` must start with `act_`. The server validates this at startup and will refuse to start without it.

---

## Claude Desktop Config

The `npm run setup` wizard writes this automatically. To configure manually, edit:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "meta-marketing": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/meta-mcp-server/dist/index.js"],
      "env": {
        "META_ACCESS_TOKEN": "YOUR_LONG_LIVED_ACCESS_TOKEN",
        "META_AD_ACCOUNT_ID": "act_YOUR_ACCOUNT_ID",
        "META_APP_ID": "REDACTED_APP_ID",
        "META_APP_SECRET": "REDACTED_APP_SECRET",
        "META_API_VERSION": "v25.0",
        "DRY_RUN": "false"
      }
    }
  }
}
```

Replace `YOUR_USERNAME` with your macOS username and fill in your token and account ID.

---

## .env File (Alternative)

For local development with `npm run dev`, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
META_ACCESS_TOKEN=your_long_lived_access_token
META_AD_ACCOUNT_ID=act_123456789
META_APP_ID=REDACTED_APP_ID
META_APP_SECRET=your_app_secret
META_API_VERSION=v25.0
DRY_RUN=false
```

> `.env` is gitignored. Never commit it.

---

## Multiple Ad Accounts

The server is configured for one ad account at a time. To switch accounts:

1. Update `META_AD_ACCOUNT_ID` in the Claude Desktop config
2. Restart Claude Desktop

Or maintain separate config entries with different names:

```json
{
  "mcpServers": {
    "meta-account-a": {
      "command": "node",
      "args": ["/Users/you/meta-mcp-server/dist/index.js"],
      "env": {
        "META_AD_ACCOUNT_ID": "act_111111111",
        ...
      }
    },
    "meta-account-b": {
      "command": "node",
      "args": ["/Users/you/meta-mcp-server/dist/index.js"],
      "env": {
        "META_AD_ACCOUNT_ID": "act_222222222",
        ...
      }
    }
  }
}
```

---

## API Version

The server defaults to `v25.0`. Meta API versions are supported for ~2 years after release. If you need to pin to a specific version, set `META_API_VERSION` in your config.
