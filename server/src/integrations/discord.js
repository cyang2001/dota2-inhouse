import { listMatches } from '../repositories/matches.js';
import { playerStandings } from '../services/analytics.js';
import { json, readBytes } from '../http/request.js';

const ephemeralFlag = 64;
const perPage = 15;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const playerPrefix = /^[0-9a-f]{32}$/;
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });

function decodeHex(value, bytes) {
  if (!value || value.length !== bytes * 2 || !/^[\da-f]+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/../g), (pair) => Number.parseInt(pair, 16));
}

async function signedPayload(request, publicKey) {
  const signature = decodeHex(request.headers.get('X-Signature-Ed25519'), 64);
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  const keyBytes = decodeHex(publicKey, 32);
  if (!signature || !keyBytes || !/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;
  const raw = await readBytes(request);
  const prefix = encoder.encode(timestamp);
  const message = new Uint8Array(prefix.length + raw.length);
  message.set(prefix);
  message.set(raw, prefix.length);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'Ed25519', false, ['verify']);
  if (!await crypto.subtle.verify('Ed25519', key, signature, message)) return null;
  return JSON.parse(decoder.decode(raw));
}

function reply(content) {
  return json(200, { type: 4, data: { content, flags: ephemeralFlag, allowed_mentions: { parse: [] } } });
}

function cleanName(name) {
  return String(name).replace(/\p{C}/gu, ' ').trim();
}

function playerLine(row) {
  const name = Array.from(cleanName(row.name)).slice(0, 40).join('').replace(/[\\`*_~|<>\[\]()]/g, '\\$&');
  return `${name} · ${row.games} 场 · ${row.wins} 胜 ${row.losses} 负 · ${percent.format(row.winRate)}`;
}

function choices(standings, search) {
  return {
    type: 8,
    data: { choices: standings.filter((row) => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
      .slice(0, 25).map((row) => ({ name: `${Array.from(cleanName(row.name)).slice(0, 42).join('')} (${row.id.slice(-6)})`, value: row.id })) },
  };
}

export async function discordInteraction(request, env) {
  const { DISCORD_PUBLIC_KEY, DISCORD_GUILD_ID, DISCORD_CHANNEL_ID } = env;
  if (!DISCORD_PUBLIC_KEY || !DISCORD_GUILD_ID || !DISCORD_CHANNEL_ID) return json(503, { error: 'Discord is awaiting configuration' });
  let interaction;
  try {
    interaction = await signedPayload(request, DISCORD_PUBLIC_KEY);
  } catch {
    return json(401, { error: 'Invalid Discord signature or request' });
  }
  if (!interaction) return json(401, { error: 'Invalid Discord signature or request' });
  if (interaction.type === 1) return json(200, { type: 1 });

  const autocomplete = interaction.type === 4;
  if (interaction.guild_id !== DISCORD_GUILD_ID || (interaction.channel?.id ?? interaction.channel_id) !== DISCORD_CHANNEL_ID) {
    return autocomplete ? json(200, choices([], '')) : reply('这个命令只在内战测试频道使用。');
  }
  if (interaction.data?.name !== 'winrate' || (!autocomplete && interaction.type !== 2)) return reply('未识别的命令。');
  const standings = playerStandings(await listMatches(env.DB));
  const options = interaction.data.options ?? [];
  const player = options.find((option) => option.name === 'player')?.value;
  if (autocomplete) return json(200, choices(standings, typeof player === 'string' ? player : ''));
  if (player) {
    const query = String(player).trim();
    const matches = playerPrefix.test(query) ? standings.filter((row) => row.id === query) :
      standings.filter((row) => row.name.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (matches.length === 1) return reply(playerLine(matches[0]));
    return reply(matches.length > 1 ? '找到重名玩家，请从玩家建议里选一位。' : '没有找到这个玩家，请从玩家建议里选一位。');
  }
  if (!standings.length) return reply('暂无已验证的内战战绩。');
  const pages = Math.ceil(standings.length / perPage);
  const page = options.find((option) => option.name === 'page')?.value ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > pages) return reply(`请输入 1 到 ${pages} 的页码。`);
  const rows = standings.slice((page - 1) * perPage, page * perPage);
  const header = `**内战胜率 · 第 ${page}/${pages} 页 · ${standings.length} 人**`;
  const lines = rows.map((row, i) => `${(page - 1) * perPage + i + 1}. ${playerLine(row)}`);
  return reply([header, ...lines].join('\n'));
}
