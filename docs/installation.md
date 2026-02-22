# Installation

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **npm** (included with Node.js)
- A **Meta developer app** with Marketing API access
- A **Facebook ad account**

---

## 1. Clone the Repository

```bash
git clone https://github.com/aaronyarm/meta-mcp-server.git ~/meta-mcp-server
cd ~/meta-mcp-server
```

> The setup script and Claude Desktop config assume the repo lives at `~/meta-mcp-server`. If you clone elsewhere, update the paths in `claude-desktop-config.json` and `scripts/get-token.ts`.

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Build

```bash
npm run build
```

This compiles TypeScript to `dist/`. The entry point Claude Desktop will call is `dist/index.js`.

---

## 4. Authenticate

Run the interactive OAuth setup to get a long-lived access token:

```bash
npm run setup
```

This opens a browser window for Facebook login, exchanges the auth code for a 60-day token, and writes it directly to your Claude Desktop config. See [Authentication](Authentication) for details.

---

## 5. Verify

After setup, confirm the token has the right permissions:

```bash
node check-token.mjs
```

This reads the token from your Claude Desktop config and prints all granted permissions.

---

## 6. Restart Claude Desktop

Claude Desktop reads its config at startup. Restart it to pick up the new MCP server.

---

## Development Mode

Run without building (uses `tsx` for direct TypeScript execution):

```bash
npm run dev
```

---

## Project Structure

```
meta-mcp-server/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── config.ts         # Environment variable config
│   ├── meta-client.ts    # Meta Graph API client + rate limiter
│   ├── tools/
│   │   ├── management.ts # Account/campaign/adset/ad read tools
│   │   ├── analyst.ts    # Insights + intelligence report
│   │   ├── creator.ts    # Image upload + campaign deployment
│   │   ├── debug.ts      # Ad delivery diagnostics
│   │   ├── duplicator.ts # Campaign deep-copy
│   │   ├── audience.ts   # Custom audience management
│   │   ├── updater.ts    # Status + budget updates
│   │   └── pixels.ts     # Pixel management
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Rate limiter and helpers
├── scripts/
│   └── get-token.ts      # OAuth setup wizard
├── check-token.mjs       # Token permission checker
├── .env.example          # Environment variable template
└── claude-desktop-config.json  # Example Claude Desktop config
```
