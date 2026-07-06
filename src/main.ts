import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { corsOriginCallback } from './core/security/cors.config';
import { AllExceptionsFilter } from './core/security/all-exceptions.filter';
import { SupabaseStorageService } from './core/storage/supabase-storage.service';

// Certains hébergeurs (IP partagées de PaaS) ont leur egress IPv6 bloqué par
// Google → 403 "Error fetching public keys" sur googleapis.com, ce qui casse
// la vérification des tokens Firebase. Forcer IPv4 fiabilise l'egress Google.
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // En-têtes de sécurité (HSTS, X-Frame-Options, X-Content-Type-Options, etc.).
  // crossOriginResourcePolicy assoupli pour permettre le chargement des
  // pièces jointes /uploads depuis le frontend.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // géré par nginx côté frontend
    }),
  );

  // Sécurité : bloquer l'accès direct aux documents RH via /uploads/hr-documents/*.
  // Ces fichiers DOIVENT passer par GET /core/hr/documents/:id/download qui
  // vérifie permission RH et assignation. On retourne 403 plutôt que 404
  // pour signaler explicitement que le path est volontairement protégé.
  app.use('/uploads/hr-documents', (_req, res) => {
    res.status(403).json({
      statusCode: 403,
      message: 'Accès direct aux documents RH interdit. Utilisez l\'endpoint sécurisé.',
    });
  });

  // /uploads/* (autres dossiers : leave-requests, employee-documents, etc.)
  // servis depuis Supabase Storage — le disque Render est éphémère. Ce
  // middleware s'exécute avant les guards Nest (comme l'ancien statique), donc
  // ces fichiers restent accessibles par URL comme auparavant. Les documents RH
  // sensibles sont bloqués plus haut (403) et passent par l'endpoint permissionné.
  const storageService = app.get(SupabaseStorageService);
  app.use('/uploads', async (req: any, res: any, next: any) => {
    // Laisse le routage Nest gérer le reste (préflight CORS OPTIONS, etc.).
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    // req.path est relatif au point de montage → "leave-requests/<uuid>.pdf".
    let key: string;
    try {
      key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    } catch {
      res.status(400).end();
      return;
    }
    if (!key || key.includes('..')) {
      res.status(400).end();
      return;
    }
    try {
      const stored = await storageService.download(key);
      if (!stored) {
        res.status(404).end();
        return;
      }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Type', stored.contentType);
      const isInline = /\.(pdf|png|jpe?g|webp|gif|svg)$/i.test(key);
      if (!isInline) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.send(stored.buffer);
    } catch {
      res.status(500).end();
    }
  });

  // Trust proxy pour récupérer la vraie IP derrière un reverse proxy
  app.set('trust proxy', 1);

  // Validation globale stricte
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filtre global d'exceptions (masque les détails internes en prod)
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: corsOriginCallback,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Authorization, X-Organization-Code, x-organization-code, X-Device-Fingerprint, x-device-fingerprint, Cache-Control, Pragma',
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`Backend démarré sur le port ${port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[Bootstrap] Échec du démarrage:', err);
  process.exit(1);
});
