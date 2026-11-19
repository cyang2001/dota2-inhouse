import { mapSources, patches } from './public/app/patches.js';
import { json, sameSecret, viewerPassword } from './src/http/request.js';
import { analytics, leagueWards, playerHeroes, playerProfile, serveHome, upload, wardEvents } from './src/http/site.js';
import { discordInteraction } from './src/integrations/discord.js';
import { displaySnapshot } from './src/http/display-snapshot.js';
import { getMatchAnalysis, uploadMatchAnalysis } from './src/http/match-analysis.js';

export default {
  async fetch(request, env) {
    const { pathname: path, searchParams } = new URL(request.url);
    const patch = searchParams.get('patch');
    const analysisRoute = /^\/api\/matches\/([1-9]\d{0,19})\/analysis$/.exec(path);
    if (analysisRoute && request.method === 'POST') return uploadMatchAnalysis(request, env, analysisRoute[1]);
    if (path === '/discord/interactions' && request.method === 'POST') return discordInteraction(request, env);
    if (path === '/api/matches' && request.method === 'POST') return upload(request, env);
    if (path === '/api/display-snapshot' && ['GET', 'POST'].includes(request.method)) return displaySnapshot(request, env);
    if (!await sameSecret(viewerPassword(request.headers.get('Authorization')), env.VIEW_PASSWORD)) {
      return json(401, { error: '请输入内战网站的访问密码' }, { 'WWW-Authenticate': 'Basic realm="Dota Inhouse", charset="UTF-8"' });
    }
    if ((path === '/' || path === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveHome(request, env);
    }
    if ((/^\/app\/[a-z-]+\.js$/.test(path) || Object.values(mapSources).includes(path)) && (request.method === 'GET' || request.method === 'HEAD')) {
      return env.ASSETS.fetch(request);
    }
    if (patch !== null && !patches.includes(patch)) return json(400, { error: 'Unsupported patch' });
    const playerRoute = /^\/api\/players\/([a-f0-9]{32})(\/heroes)?$/.exec(path);
    if (playerRoute && request.method === 'GET') {
      return playerRoute[2] ? playerHeroes(env.DB, playerRoute[1], patch) : playerProfile(env.DB, playerRoute[1], patch);
    }
    if (path === '/api/analytics' && request.method === 'GET') return analytics(env.DB, patch);
    if (path === '/api/analytics/wards' && request.method === 'GET') return leagueWards(env.DB, patch);
    if (path === '/api/analytics/ward-events' && request.method === 'GET') return wardEvents(env.DB, null, patch);
    const matchWards = /^\/api\/matches\/([1-9]\d{0,19})\/wards$/.exec(path);
    if (matchWards && request.method === 'GET') return wardEvents(env.DB, matchWards[1]);
    if (analysisRoute && request.method === 'GET') return getMatchAnalysis(env.DB, analysisRoute[1]);
    return json(404, { error: 'Page not found' });
  },
};
