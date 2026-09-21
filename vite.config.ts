import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['DATABASE_URL', 'APP_PASSWORD', 'SESSION_SECRET']) {
    if (env[key]) process.env[key] = env[key];
  }
  return { plugins: [react(), {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/api') return next();
        try {
          const { default: handler } = await server.ssrLoadModule('/api/index.ts');
          await handler(req, res);
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API local indisponível. Confira a configuração do servidor.' }));
        }
      });
    },
  }] };
});
