const { DISCORD_APPLICATION_ID: app, DISCORD_GUILD_ID: guild, DISCORD_BOT_TOKEN: token } = process.env;
if (!/^\d{15,22}$/.test(app ?? '') || !/^\d{15,22}$/.test(guild ?? '') || !token?.trim()) {
  throw new Error('Set DISCORD_APPLICATION_ID, DISCORD_GUILD_ID and DISCORD_BOT_TOKEN');
}

const command = {
  type: 1, name: 'winrate', description: '查看私人内战的全员或个人胜率',
  options: [
    { type: 3, name: 'player', description: '选一位内战玩家。留空时显示所有人', autocomplete: true },
    { type: 4, name: 'page', description: '全员榜的页码，每页 15 人', min_value: 1 },
  ],
};
const response = await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`, {
  method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command),
});
const result = await response.json();
if (!response.ok) throw new Error(`Discord registration failed (${response.status}): ${result.message ?? 'unknown error'}`);
console.log(`Registered /${result.name} in the configured Discord server.`);
