import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FirebaseAuthGuard } from './core/auth/firebase-auth.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = new Set<string>([
    'http://localhost:5173',
    'http://localhost:3000',
    'https://lydg.vercel.app',
  ]);

  app.enableCors({
    origin: (origin, callback) => {
      // Some clients (e.g. curl, server-to-server) may not send Origin
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Authorization, X-Organization-Code, x-organization-code, Cache-Control, Pragma',
    credentials: true,
  });
  const firebaseAuthGuard = app.get(FirebaseAuthGuard);
  app.useGlobalGuards(firebaseAuthGuard);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
