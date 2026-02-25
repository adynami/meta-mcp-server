import { config } from '../config.js';

export function validateMetaId(id: string): void {
  if (!/^\d+$/.test(id) && !/^act_\d+$/.test(id)) {
    throw new Error(`Invalid Meta ID: ${id}`);
  }
}

export async function graphGet(objectPath: string, params: Record<string, any> = {}): Promise<any> {
  const qp = new URLSearchParams({ access_token: config.accessToken });
  for (const [k, v] of Object.entries(params)) {
    qp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}?${qp.toString()}`;
  const response = await fetch(url);
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

export async function graphPost(objectPath: string, params: Record<string, any>): Promise<any> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}`;
  const formBody = new URLSearchParams();
  formBody.append('access_token', config.accessToken);
  for (const [k, v] of Object.entries(params)) {
    formBody.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    const err = new Error(e.message ?? `HTTP ${response.status}`) as any;
    err.response = { error: e };
    throw err;
  }
  return data;
}

export async function graphDelete(objectPath: string): Promise<any> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${objectPath}`;
  const formBody = new URLSearchParams({ access_token: config.accessToken });
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });
  const data = await response.json() as any;
  if (!response.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(e.message ?? `HTTP ${response.status}`);
  }
  return data;
}
