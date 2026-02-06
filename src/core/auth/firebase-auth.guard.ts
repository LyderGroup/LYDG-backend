import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from '../users/user.entity';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private ensureFirebaseApp(): void {
    if (this.firebaseInitialized && admin.apps.length > 0) {
      return;
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing Firebase service account configuration');
    }

    privateKey = privateKey.replace(/\\n/g, '\n');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    this.firebaseInitialized = true;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const path: string = request.path || request.url || '';

    // Laisser passer l'healthcheck sans auth
    if (path === '/health/db') {
      return true;
    }

    const authHeader =
      (request.headers['authorization'] as string | undefined) ??
      (request.headers['Authorization'] as string | undefined) ??
      undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const idToken = authHeader.substring('Bearer '.length).trim();

    this.ensureFirebaseApp();

    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const externalId = decodedToken.uid;
    const email = decodedToken.email ?? null;

    let user: User | null = null;
    let foundByEmail = false;

    user = await this.usersRepo.findOne({ where: { externalId } });

    if (!user && email) {
      user = await this.usersRepo.findOne({ where: { email } });
      foundByEmail = !!user;
    }

    if (user && foundByEmail) {
      if (!user.externalId) {
        await this.usersRepo.update(user.id, { externalId });
        user.externalId = externalId;
      } else if (user.externalId !== externalId) {
        throw new UnauthorizedException(
          "Ce compte est déjà lié à un autre identifiant. Veuillez contacter votre administrateur.",
        );
      }
    }

    if (!user) {
      throw new UnauthorizedException(
        'Aucun compte trouvé pour cet utilisateur dans le core.users. Veuillez contacter votre administrateur.',
      );
    }

    request.user = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      firebaseUid: externalId,
      raw: user,
    };

    return true;
  }
}
