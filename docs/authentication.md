# Authentication

meta-mcp-server uses a **long-lived Meta access token** (valid for ~60 days) to call the Marketing API.

---

## Automated Setup (Recommended)

```bash
npm run setup
```

The setup wizard (`scripts/get-token.ts`) handles the full OAuth flow:

1. **Opens a browser** to Facebook's login dialog requesting the required scopes
2. **Runs a local HTTP server** on port 9876 to catch the OAuth redirect
3. **Exchanges the auth code** for a short-lived token
4. **Exchanges the short-lived token** for a long-lived token (~60 days)
5. **Fetches your ad accounts** (personal + Business Manager accounts)
6. **Writes the config** to `~/Library/Application Support/Claude/claude_desktop_config.json`

After the wizard completes, **restart Claude Desktop** to activate the server.

---

## Required OAuth Scopes

| Scope | Purpose |
|---|---|
| `ads_management` | Create and manage ads |
| `ads_read` | Read ad account data |
| `business_management` | Access Business Manager resources |
| `read_insights` | Pull performance metrics |
| `pages_read_engagement` | Read page data |
| `pages_manage_ads` | Manage page-linked ads |
| `pages_show_list` | List pages |
| `catalog_management` | Manage product catalogs |

---

## Manual Setup

If you prefer to generate a token manually:

1. Go to [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
2. Select your app and generate a token with the scopes listed above
3. Exchange it for a long-lived token via the Graph API:
   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
4. Add the token to your `.env` file or Claude Desktop config

---

## Token Expiry

Long-lived tokens expire after **60 days**. When a token expires:

- Tools will return: `Auth expired (code 190). Run "npm run setup" to re-authenticate.`
- Run `npm run setup` again to get a fresh token

---

## Checking Token Permissions

```bash
node check-token.mjs
```

Reads the token from your Claude Desktop config and prints:

- Token prefix (first 20 characters)
- All granted permissions and their status
- Relevant API response headers

---

## App Credentials

The app ID and secret are pre-configured in `config.ts` and `get-token.ts`. If you want to use your own Meta app:

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
2. Add the **Marketing API** product
3. Update `APP_ID` and `APP_SECRET` in `scripts/get-token.ts`
4. Update `META_APP_ID` and `META_APP_SECRET` in your environment or Claude Desktop config
