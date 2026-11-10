// In local development the site and API run on different ports. Passing /api through here gives
// the site the same address it has in production, so the API needs no cross-site settings.
const http = require('node:http');

const { getDefaultConfig } = require('expo/metro-config');

const API_PORT = Number(process.env.API_PORT ?? 8787); // another port lets two copies run side by side
const config = getDefaultConfig(__dirname);

config.server.enhanceMiddleware = (metro) => (req, res, next) => {
  if (!req.url.startsWith('/api/')) return metro(req, res, next);
  const { method, headers, url: path } = req;
  const upstream = http.request(
    { host: 'localhost', port: API_PORT, path, method, headers },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'API_DOWN', message: 'The local API is not running.' } }));
  });
  req.pipe(upstream);
};

module.exports = config;
