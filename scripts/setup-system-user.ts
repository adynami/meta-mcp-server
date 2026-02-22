#!/usr/bin/env npx tsx
/**
 * Meta System User Token Wizard
 *
 * Checks your current token health and walks you through setting up
 * a System User token (non-expiring) in Business Manager.
 *
 * Run: npm run setup-system-user
 */

import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_ID = 'REDACTED_APP_ID';
const APP_SECRET = 'REDACTED_APP_SECRET';

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

function readCurrentToken(): string | null {
  try {
    if (fs.existsSync(CLAUDE_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
      return config?.mcpServers?.['meta-marketing']?.env?.META_ACCESS_TOKEN ?? null;
    }
  } catch { /* ignore */ }
  return process.env.META_ACCESS_TOKEN ?? null;
}

function writeTokenToConfig(token: string): void {
  if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
    console.log('Claude Desktop config not found — update META_ACCESS_TOKEN manually.');
    return;
  }
  const config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'));
  if (config?.mcpServers?.['meta-marketing']?.env) {
    config.mcpServers['meta-marketing'].env.META_ACCESS_TOKEN = token;
    fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('Updated Claude Desktop config with new token.');
  }
}

async function checkToken(token: string): Promise<{
  type: string;
  app_id: string;
  expires_at: number;
  scopes: string[];
  user_id?: string;
  name?: string;
  is_valid: boolean;
}> {
  const appToken = `${APP_ID}|${APP_SECRET}`;
  const url = `https://graph.facebook.com/v25.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`debug_token failed: ${data.error.message}`);
  return data.data;
}

async function fetchMe(token: string): Promise<{ id: string; name: string }> {
  const url = `https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
  const raw = await httpsGet(url);
  return JSON.parse(raw);
}

async function extendToken(token: string): Promise<{ access_token: string; expires_in: number }> {
  const url = `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(token)}`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`Token extension failed: ${data.error.message}`);
  return data;
}

async function fetchBusinessManagers(token: string): Promise<Array<{ id: string; name: string }>> {
  const url = `https://graph.facebook.com/v25.0/me/businesses?fields=id,name&access_token=${encodeURIComponent(token)}&limit=50`;
  const raw = await httpsGet(url);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(`Could not fetch businesses: ${data.error.message}`);
  return data.data ?? [];
}

function printSeparator(): void { console.log('\n' + '─'.repeat(60) + '\n'); }

async function main(): Promise<void> {
  console.log('\nMeta System User Token Wizard\n');
  printSeparator();

  const token = readCurrentToken();
  if (!token) {
    console.log('No token found. Run `npm run setup` first to authenticate.');
    process.exit(1);
  }

  // Step 1: Check current token
  console.log('Step 1 — Checking current token...\n');
  let tokenInfo: any;
  try {
    tokenInfo = await checkToken(token);
  } catch (err: any) {
    console.error(`Token check failed: ${err.message}`);
    console.log('Your token may be invalid. Run `npm run setup` to get a new token.');
    process.exit(1);
  }

  const me = await fetchMe(token).catch(() => null);
  const expiresAt = tokenInfo.expires_at;
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = expiresAt ? Math.floor((expiresAt - now) / 86400) : null;
  const isSystemUser = tokenInfo.type === 'SYSTEM_USER';
  const neverExpires = expiresAt === 0 || expiresAt === null;

  console.log(`User:        ${me?.name ?? 'Unknown'} (${me?.id ?? 'unknown'})`);
  console.log(`Token type:  ${tokenInfo.type ?? 'unknown'}`);
  if (neverExpires) {
    console.log('Expiry:      Never (non-expiring token)');
  } else if (daysLeft !== null) {
    const status = daysLeft < 7 ? '⚠️  EXPIRING SOON' : daysLeft < 0 ? '❌ EXPIRED' : 'OK';
    console.log(`Expiry:      ${daysLeft} days (${status})`);
  }
  console.log(`Permissions: ${(tokenInfo.scopes ?? []).join(', ')}`);

  if (isSystemUser && neverExpires) {
    printSeparator();
    console.log('You already have a non-expiring System User token.');
    console.log('No action needed.');
    return;
  }

  printSeparator();

  // Step 2: Offer to extend user token if it's a regular user token
  if (tokenInfo.type === 'USER' && !neverExpires) {
    console.log('Step 2 — Extending your token to 60 days...\n');
    try {
      const extended = await extendToken(token);
      const extDays = Math.floor((extended.expires_in ?? 5184000) / 86400);
      console.log(`Extended successfully! New token expires in ${extDays} days.`);
      writeTokenToConfig(extended.access_token);
      console.log('Restart Claude Desktop to use the extended token.');
    } catch (err: any) {
      console.log(`Could not extend token: ${err.message}`);
    }
    printSeparator();
  }

  // Step 3: System User setup instructions
  console.log('Step 3 — Set up a non-expiring System User token\n');
  console.log('System Users live in Meta Business Manager and generate tokens that');
  console.log('never expire. Ideal for production MCP server deployments.\n');

  let businesses: Array<{ id: string; name: string }> = [];
  try {
    businesses = await fetchBusinessManagers(token);
  } catch { /* ignore */ }

  if (businesses.length > 0) {
    console.log('Your Business Manager(s):');
    businesses.forEach((b, i) => console.log(`  ${i + 1}. ${b.name} (ID: ${b.id})`));
  }

  console.log('\nHow to create a System User token:');
  console.log('');
  console.log('  1. Go to: https://business.facebook.com/settings');
  console.log('  2. Select your Business Manager account');
  console.log('  3. Navigate to: Users → System Users');
  console.log('  4. Click "Add" to create a new System User');
  console.log('     - Role: Admin (for full API access)');
  console.log('     - Name: e.g. "Meta MCP Server"');
  console.log('  5. After creating, click the System User → "Generate New Token"');
  console.log('  6. Select the app: Meta Marketing MCP (or your app)');
  console.log('  7. Grant permissions:');
  console.log('     ads_management, ads_read, business_management,');
  console.log('     read_insights, pages_read_engagement, pages_manage_ads');
  console.log('  8. Copy the generated token (it never expires)');
  console.log('  9. Grant the System User access to your Ad Account:');
  console.log('     Business Settings → Accounts → Ad Accounts → Assign Assets');
  console.log('');
  console.log('  Then update META_ACCESS_TOKEN in your Claude Desktop config:');
  console.log(`  ${CLAUDE_CONFIG_PATH}`);
  console.log('');
  console.log('  Or run: npm run setup to re-authenticate with the new token.');
}

main().catch(console.error);
