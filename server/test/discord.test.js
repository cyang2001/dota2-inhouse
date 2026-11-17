import assert from 'node:assert/strict';
import test from 'node:test';
import { discordInteraction } from '../src/integrations/discord.js';

const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const keyHex = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
const firstId = '1'.repeat(32);
const otherId = '2'.repeat(32);
const env = {
  DISCORD_PUBLIC_KEY: keyHex, DISCORD_GUILD_ID: 'example-guild', DISCORD_CHANNEL_ID: 'example-channel',
  DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ summary: JSON.stringify({
    winner: 'radiant', players: [{ id: firstId, name: '示例玩家', team: 'radiant' },
      { id: otherId, name: '示例玩家', team: 'dire' }],
  }) }] }) }) }) },
};

async function sign(payload, bodyOverride) {
  const body = JSON.stringify(payload);
  const time = String(Math.floor(Date.now() / 1000));
  const signature = await crypto.subtle.sign('Ed25519', keys.privateKey, new TextEncoder().encode(time + body));
  return new Request('https://local.example/discord/interactions', { method: 'POST', body: bodyOverride ?? body, headers: {
    'X-Signature-Ed25519': Buffer.from(signature).toString('hex'), 'X-Signature-Timestamp': time,
  } });
}

function command(options = [], type = 2, channel = env.DISCORD_CHANNEL_ID) {
  return { type, guild_id: env.DISCORD_GUILD_ID, channel: { id: channel }, data: { name: 'winrate', options } };
}

test('signed Discord PING succeeds and tampering is rejected', async () => {
  const ping = await discordInteraction(await sign({ type: 1 }), env);
  assert.deepEqual(await ping.json(), { type: 1 });
  assert.equal((await discordInteraction(await sign({ type: 1 }, '{"type":2}'), env)).status, 401);
});

test('discord can list everyone and autocomplete distinguishes duplicate names', async () => {
  const list = await (await discordInteraction(await sign(command()), env)).json();
  assert.equal(list.data.flags, 64);
  assert.match(list.data.content, /1 胜 0 负.*100%/);
  assert.match(list.data.content, /0 胜 1 负.*0%/);
  const auto = await (await discordInteraction(await sign(command([{ name: 'player', value: '示例' }], 4)), env)).json();
  assert.deepEqual(auto.data.choices.map((entry) => entry.value), [firstId, otherId]);
  const exact = await (await discordInteraction(await sign(command([{ name: 'player', value: otherId }])), env)).json();
  assert.match(exact.data.content, /0 胜 1 负/);
});

test('an otherwise valid command from another channel gets no standings', async () => {
  const result = await (await discordInteraction(await sign(command([], 2, 'other')), env)).json();
  assert.match(result.data.content, /测试频道/);
  const auto = await (await discordInteraction(await sign(command([], 4, 'other')), env)).json();
  assert.deepEqual(auto.data.choices, []);
});
