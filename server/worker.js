import { json, sameSecret, viewerPassword } from './src/http/request.js';
import { analytics, leagueWards, playerHeroes, playerProfile, serveHome, upload, wardEvents } from './src/http/site.js';
import { discordInteraction } from './src/integrations/discord.js';
import { displaySnapshot } from './src/http/display-snapshot.js';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/discord/interactions' && request.method === 'POST') return discordInteraction(request, env);
    if (path === '/api/matches' && request.method === 'POST') return upload(request, env);
    if (path === '/api/display-snapshot' && ['GET', 'POST'].includes(request.method)) return displaySnapshot(request, env);
    if (!await sameSecret(viewerPassword(request.headers.get('Authorization')), env.VIEW_PASSWORD)) {
      return json(401, { error: '请输入内战网站的访问密码' }, { 'WWW-Authenticate': 'Basic realm="Dota Inhouse", charset="UTF-8"' });
    }
    if ((path === '/' || path === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveHome(request, env);
    }
    if (/^\/app\/[a-z-]+\.js$/.test(path) && (request.method === 'GET' || request.method === 'HEAD')) {
      return env.ASSETS.fetch(request);
    }
    const playerRoute = /^\/api\/players\/([a-f0-9]{32})(\/heroes)?$/.exec(path);
    if (playerRoute && request.method === 'GET') {
      return playerRoute[2] ? playerHeroes(env.DB, playerRoute[1]) : playerProfile(env.DB, playerRoute[1]);
    }
    if (path === '/api/analytics' && request.method === 'GET') return analytics(env.DB);
    if (path === '/api/analytics/wards' && request.method === 'GET') return leagueWards(env.DB);
    if (path === '/api/analytics/ward-events' && request.method === 'GET') return wardEvents(env.DB);
    const matchWards = /^\/api\/matches\/([1-9]\d{0,19})\/wards$/.exec(path);
    if (matchWards && request.method === 'GET') return wardEvents(env.DB, matchWards[1]);
    return json(404, { error: 'Page not found' });
  },
};
