import { displayIsCurrent, displaySource, publishDisplay } from '../repositories/display-snapshot.js';
import { json, readBytes, sameSecret } from './request.js';

export async function displaySnapshot(request, env) {
  const token = request.headers.get('Authorization');
  if (!(token?.startsWith('Bearer ') && await sameSecret(token.slice(7), env.UPLOAD_TOKEN))) {
    return json(401, { error: 'Upload authorization required' });
  }
  if (request.method === 'GET') {
    const source = await displayIsCurrent(env.DB) ? null : await displaySource(env.DB);
    return source ? json(200, source) : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBytes(request, 1500 * 1024)));
  } catch (error) {
    return json(error instanceof RangeError ? 413 : 400, { error: 'Invalid display snapshot body' });
  }
  if (!Number.isSafeInteger(input?.revision) || input.revision < 0 || !Array.isArray(input.data?.standings) ||
      typeof input.data?.overview?.matches !== 'number' || !input.data?.wards || !input.data?.profiles) {
    return json(400, { error: 'Invalid display snapshot structure' });
  }
  return await publishDisplay(env.DB, input.revision, input.data)
    ? json(200, { revision: input.revision })
    : json(409, { error: 'Match data changed during snapshot generation' });
}
