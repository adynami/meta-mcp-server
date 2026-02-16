#!/usr/bin/env npx tsx
/**
 * Meta OAuth Token Helper
 *
 * Flow:
 * 1. Opens browser to Facebook Login Dialog
 * 2. Runs a tiny local HTTP server to catch the redirect
 * 3. Exchanges the code for a short-lived token
 * 4. Exchanges the short-lived token for a long-lived token (60 days)
 * 5. Writes the token to the Claude Desktop config
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const APP_ID = '691127188799372';
const APP_SECRET = '29f21e2dfb5dd4c91b41634f51b1c8af';
const REDIRECT_URI = 'http://localhost:9876/callback';
const SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'pages_manage_ads',
].join(',');

const CLAUDE_CONFIG_PATH = path.join(
  process.env.HOME ?? '~',
  'Library/Application Support/Claude/claude_desktop_config.json',
);

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const url = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`Token exchange failed: ${data.error.message}`);
  return data.access_token;
}

async function exchangeForLongLived(shortToken: string): Promise<{ token: string; expires_in: number }> {
  const url = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`Long-lived exchange failed: ${data.error.message}`);
  return { token: data.access_token, expires_in: data.expires_in ?? 5184000 };
}

async function fetchAdAccounts(token: string): Promise<Array<{ id: string; name: string }>> {
  const url = `https://graph.facebook.com/v19.0/me/adaccounts?fields=account_id,name&access_token=${token}&limit=10`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`Failed to fetch ad accounts: ${data.error.message}`);
  return (data.data ?? []).map((a: any) => ({ id: `act_${a.account_id}`, name: a.name }));
}

function writeClaudeConfig(token: string, adAccountId: string): void {
  let config: any = {};
  if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
  }

  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers['meta-marketing'] = {
    command: 'node',
    args: [path.join(process.env.HOME ?? '~', 'meta-mcp-server/dist/index.js')],
    env: {
      META_ACCESS_TOKEN: token,
      META_AD_ACCOUNT_ID: adAccountId,
      META_APP_ID: APP_ID,
      META_APP_SECRET: APP_SECRET,
      META_API_VERSION: 'v19.0',
      DRY_RUN: 'false',
    },
  };

  fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function main(): Promise<void> {
  console.log('\n🔐 Meta Marketing API — OAuth Setup\n');

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:9876`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth Failed</h1><p>${url.searchParams.get('error_description') ?? error}</p><p>You can close this tab.</p>`);
          console.error(`\nAuth failed: ${error}`);
          server.close();
          resolve();
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>No code received</h1>');
          server.close();
          resolve();
          return;
        }

        try {
          console.log('Exchanging code for token...');
          const shortToken = await exchangeCodeForToken(code);

          console.log('Exchanging for long-lived token (60 days)...');
          const { token, expires_in } = await exchangeForLongLived(shortToken);
          const expiryDays = Math.floor(expires_in / 86400);

          console.log(`Got long-lived token (expires in ${expiryDays} days)`);

          console.log('\nFetching your ad accounts...');
          const accounts = await fetchAdAccounts(token);

          let selectedAccount: string;
          if (accounts.length === 0) {
            console.error('No ad accounts found. Make sure the user has ads_read permission.');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>No Ad Accounts Found</h1><p>Check permissions.</p>');
            server.close();
            resolve();
            return;
          } else if (accounts.length === 1) {
            selectedAccount = accounts[0].id;
            console.log(`Using account: ${accounts[0].name} (${accounts[0].id})`);
          } else {
            console.log('\nAvailable ad accounts:');
            accounts.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} (${a.id})`));
            selectedAccount = accounts[0].id;
            console.log(`\nAuto-selecting first account: ${accounts[0].name} (${accounts[0].id})`);
            console.log('Edit the Claude Desktop config to change this.');
          }

          writeClaudeConfig(token, selectedAccount);
          console.log(`\nConfig written to: ${CLAUDE_CONFIG_PATH}`);
          console.log('Restart Claude Desktop to activate the MCP server.\n');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="font-family: system-ui; max-width: 600px; margin: 40px auto; text-align: center;">
              <h1 style="color: #22c55e;">Connected!</h1>
              <p>Ad Account: <strong>${selectedAccount}</strong></p>
              <p>Token expires in <strong>${expiryDays} days</strong></p>
              <p>Claude Desktop config has been updated.<br>Restart Claude Desktop to start using the Meta Marketing tools.</p>
              <p style="color: #888; margin-top: 40px;">You can close this tab.</p>
            </body></html>
          `);
        } catch (err: any) {
          console.error(`\nError: ${err.message}`);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error</h1><pre>${err.message}</pre>`);
        }

        server.close();
        resolve();
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(9876, () => {
      const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code`;

      console.log('Opening browser for Facebook login...\n');
      console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

      // Open browser (macOS)
      try {
        execSync(`open "${authUrl}"`);
      } catch {
        console.log('Could not open browser automatically.');
      }
    });
  });
}

main().catch(console.error);
