import { defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/** The HTTPS switch is local-only and requires a certificate trusted by the device. */
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localTLS = command === 'serve' && process.env.VANO_DEV_HTTPS === '1';
  const certDir = path.resolve('.local-https');
  const https = localTLS ? {
    cert: fs.readFileSync(path.join(certDir,'vano-local.pem')),
    key: fs.readFileSync(path.join(certDir,'vano-local-key.pem')),
  } : undefined;
  return {
    envPrefix:'VITE_',
    server:{
      port:5174,
      strictPort:true,
      host:'0.0.0.0',
      // Development only. Production assets are served by the hardened Node server behind HTTPS.
      fs:{ strict:true },
      https,
      proxy:{'/api':{target:`http://127.0.0.1:${env.API_PORT || 8878}`,changeOrigin:false}},
    },
    build:{sourcemap:false,outDir:'dist',target:'es2022'},
  };
});
