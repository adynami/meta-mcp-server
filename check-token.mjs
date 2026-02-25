#!/usr/bin/env node
// Quick token permission check — run with: node check-token.mjs

import { readFileSync } from 'node:fs';

// Pull token from the Claude Desktop config
const configPath = `${process.env.HOME}/Library/Application Support/Claude/claude_desktop_config.json`;
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
const token = cfg.mcpServers['meta-marketing'].env.META_ACCESS_TOKEN;

if (!token) {
  console.error('No META_ACCESS_TOKEN found in Claude Desktop config');
  process.exit(1);
}

console.log('Token (first 20 chars):', token.slice(0, 20) + '...');
console.log('');

const url = `https://graph.facebook.com/v25.0/me/permissions?access_token=${token}`;
console.log('GET', url.replace(token, '<token>'));
console.log('');

const res = await fetch(url);

// Log relevant response headers
console.log('=== Response Headers ===');
for (const [key, val] of res.headers.entries()) {
  if (
    key.includes('x-business') ||
    key.includes('x-app') ||
    key.includes('x-ad') ||
    key.includes('x-fb') ||
    key.includes('ads_api') ||
    key.includes('access_tier')
  ) {
    console.log(`  ${key}: ${val}`);
  }
}

// Also log www-authenticate which sometimes carries tier info
const wwwAuth = res.headers.get('www-authenticate');
if (wwwAuth) console.log('  www-authenticate:', wwwAuth);
console.log('');

const data = await res.json();

console.log('=== Permissions ===');
if (data.data) {
  for (const p of data.data) {
    console.log(`  ${p.permission.padEnd(40)} ${p.status}`);
  }
} else {
  console.log(JSON.stringify(data, null, 2));
}
