import { json, sameSecret, viewerPassword } from './src/http/request.js';
import { analytics, playerHeroes, serveHome, upload } from './src/http/site.js';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/matches' && request.method === 'POST') return upload(request, env);
    if (!await sameSecret(viewerPassword(request.headers.get('Authorization')), env.VIEW_PASSWORD)) {
      return json(401, { error: '请输入内战网站的访问密码' }, { 'WWW-Authenticate': 'Basic realm="Dota Inhouse", charset="UTF-8"' });
    }
    if ((path === '/' || path === '/index.html') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveHome(request, env);
    }
    const playerRoute = /^\/api\/players\/([a-f0-9]{32})\/heroes$/.exec(path);
    if (playerRoute && request.method === 'GET') return playerHeroes(env.DB, playerRoute[1]);
    if (path === '/api/analytics' && request.method === 'GET') return analytics(env.DB);
    return json(404, { error: 'Page not found' });
  },
};
