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
import { LoginHistory } from '../users/login-history.entity';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private firebaseInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepo: Repository<LoginHistory>,
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

  private parseUserAgent(userAgent: string | undefined): { browser: string; os: string; deviceType: string } {
    if (!userAgent) {
      return { browser: 'Unknown', os: 'Unknown', deviceType: 'Unknown' };
    }

    let browser = 'Unknown';
    let os = 'Unknown';
    let deviceType = 'Desktop';

    // Detect browser
    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';

    // Detect OS
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';

    // Detect device type
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      deviceType = 'Mobile';
    } else if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
      deviceType = 'Tablet';
    }

    return { browser, os, deviceType };
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
    const ipAddress = request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress || null;
    const userAgent = request.headers['user-agent'] || null;

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

    // Mettre à jour les informations de connexion
    const { browser, os, deviceType } = this.parseUserAgent(userAgent);
    
    await this.usersRepo.update(user.id, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      loginCount: (user.loginCount || 0) + 1,
    });

    // Enregistrer dans l'historique de connexion
    try {
      const loginRecord = this.loginHistoryRepo.create({
        userId: user.id,
        ipAddress,
        userAgent,
        browser,
        os,
        deviceType,
        loginStatus: 'success',
      });
      await this.loginHistoryRepo.save(loginRecord);
    } catch (err) {
      console.error('[LOGIN_HISTORY] Failed to save login history:', err);
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
