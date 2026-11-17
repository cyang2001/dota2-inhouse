const encoder = new TextEncoder();
const maxUploadBytes = 32 * 1024;
const noCache = 'private, no-store';

export function json(status, data, headers) {
  return Response.json(data, { status, headers: { 'Cache-Control': noCache, ...headers } });
}

export async function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const [given, wanted] = await Promise.all([actual, expected].map((value) =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  return crypto.subtle.timingSafeEqual(given, wanted);
}

export function viewerPassword(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const value = atob(header.slice(6));
    return value.startsWith('dota:') ? value.slice(5) : null;
  } catch {
    return null;
  }
}

export async function readSummary(request) {
  if (!request.body || !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Expected a JSON match summary');
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request)));
}

export async function readBytes(request) {
  if (!request.body) throw new Error('Expected a request body');
  const reader = request.body.getReader();
  const buffer = new Uint8Array(maxUploadBytes);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > buffer.length) throw new RangeError('Match summary is too large');
      buffer.set(value, length);
      length += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return buffer.subarray(0, length);
}
