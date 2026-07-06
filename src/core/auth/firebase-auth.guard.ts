import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as https from 'https';
import { User } from '../users/user.entity';
import { LoginHistory } from '../users/login-history.entity';
import { Employee } from '../hr/employee.entity';
import { UserDeviceService } from './user-device.service';

interface CachedUserContext {
  expiresAt: number;
  userId: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
}

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);
  private firebaseInitialized = false;

  // Cache mémoire: firebase uid -> contexte utilisateur résolu (TTL 5 min).
  // Évite 3 SELECT à chaque requête API. À remplacer par Redis pour scale-out.
  private readonly userCache = new Map<string, CachedUserContext>();
  private readonly userCacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(LoginHistory)
    private readonly loginHistoryRepo: Repository<LoginHistory>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    // forwardRef car UserDeviceService est dans le même module que ce guard
    // et l'enregistrement croisé crée une dépendance circulaire au runtime.
    @Inject(forwardRef(() => UserDeviceService))
    private readonly userDeviceService: UserDeviceService,
  ) { }

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
      // Custom HTTP agent with better timeout and keep-alive settings
      // to handle Render's egress issues with googleapis.com
      const httpAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 5,
        maxFreeSockets: 2,
        timeout: 10000,
        scheduling: 'fifo',
      });

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        httpAgent,
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

    // Routes publiques (sans authentification requise)
    // - / : root
    // - /health/db : health check pour load balancers
    // - /public/* : API publique (careers, etc.)
    if (
      path === '/' ||
      path === '/health/db' ||
      path.startsWith('/public/')
    ) {
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

    // verifyIdToken doit récupérer les clés publiques Google (googleapis.com).
    // Sur certains egress (IP PaaS), ce fetch échoue par intermittence (403/
    // réseau) → on retente quelques fois AVANT de rejeter, mais uniquement sur
    // les erreurs transitoires (pas sur un token réellement invalide/expiré).
    let decodedToken: admin.auth.DecodedIdToken | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const msg = (error as Error).message || '';
        const transient =
          /fetching public keys|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timeout|403|ECONNREFUSED|fetch error/i.test(
            msg,
          );
        if (!transient) break; // token invalide/expiré → inutile de retenter
        // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
      }
    }
    if (!decodedToken) {
      // Diagnostic : le message Firebase précise la cause exacte (mismatch de
      // FIREBASE_PROJECT_ID, ou "Error fetching public keys" = egress Google KO).
      const configuredProject =
        this.configService.get<string>('FIREBASE_PROJECT_ID');
      this.logger.warn(
        `[auth] verifyIdToken échoué (FIREBASE_PROJECT_ID=${configuredProject}): ${(lastError as Error)?.message}`,
      );
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const externalId = decodedToken.uid;
    const email = decodedToken.email ?? null;

    // 1) Cache hit : on n'interroge la DB que toutes les userCacheTtlMs.
    const cached = this.userCache.get(externalId);
    if (cached && cached.expiresAt > Date.now()) {
      request.user = {
        id: cached.userId,
        email: cached.email,
        organizationId: cached.organizationId,
        firebaseUid: externalId,
        employeeId: cached.employeeId,
        firstName: cached.firstName,
        lastName: cached.lastName,
      };
      return true;
    }

    // 2) Résolution du compte (par externalId, fallback email)
    let user: User | null = await this.usersRepo.findOne({ where: { externalId } });
    let foundByEmail = false;

    if (!user && email) {
      user = await this.usersRepo.findOne({ where: { email } });
      foundByEmail = !!user;
    }

    if (user && foundByEmail) {
      if (!user.externalId) {
        await this.usersRepo.update(user.id, { externalId });
        user.externalId = externalId;
      } else if (user.externalId !== externalId) {
        this.logger.warn(
          `[auth] compte ${email} déjà lié à un autre uid (DB=${user.externalId}, token=${externalId})`,
        );
        throw new UnauthorizedException(
          "Ce compte est déjà lié à un autre identifiant. Veuillez contacter votre administrateur.",
        );
      }
    }

    if (!user) {
      this.logger.warn(
        `[auth] aucun compte trouvé (uid=${externalId}, email=${email ?? 'n/a'})`,
      );
      throw new UnauthorizedException(
        'Aucun compte trouvé pour cet utilisateur. Veuillez contacter votre administrateur.',
      );
    }

    // 3) Update login_count atomiquement (UPDATE … = login_count + 1)
    //    et historique : sur premier hit du cache (donc ~ par session).
    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for'] ||
      request.connection?.remoteAddress ||
      null;
    const userAgent = request.headers['user-agent'] || null;
    const { browser, os, deviceType } = this.parseUserAgent(userAgent);

    try {
      await this.usersRepo
        .createQueryBuilder()
        .update(User)
        .set({
          lastLoginAt: () => 'NOW()',
          lastLoginIp: ipAddress,
          loginCount: () => '"login_count" + 1',
        })
        .where('id = :id', { id: user.id })
        .execute();
    } catch (err) {
      this.logger.warn(`Échec mise à jour login_count: ${(err as Error).message}`);
    }

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
      this.logger.warn(`Échec enregistrement login history: ${(err as Error).message}`);
    }

    // 4) Récupération employee.id (n'a besoin que d'une colonne)
    const employee = await this.employeeRepo
      .createQueryBuilder('employee')
      .select(['employee.id'])
      .where('employee.userId = :userId', { userId: user.id })
      .getOne();

    // 5) Mise en cache (TTL 5 min)
    this.userCache.set(externalId, {
      expiresAt: Date.now() + this.userCacheTtlMs,
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      employeeId: employee?.id ?? null,
    });

    request.user = {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      firebaseUid: externalId,
      employeeId: employee?.id ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    // 6) Check device (best-effort) — déclenche l'INSERT/UPDATE et notifie
    // les RH si nouveau device ou device partagé. N'échoue jamais l'auth.
    // Tourne uniquement en branche cache miss : pas de coût supplémentaire
    // sur les requêtes API normales (le cache TTL de 5 min absorbe la charge).
    const fingerprint =
      (request.headers['x-device-fingerprint'] as string | undefined) ??
      (request.headers['X-Device-Fingerprint'] as string | undefined) ??
      '';
    if (fingerprint) {
      void this.userDeviceService
        .checkDevice({
          userId: user.id,
          organizationId: user.organizationId,
          deviceFingerprint: fingerprint,
          userAgent: typeof userAgent === 'string' ? userAgent : null,
          ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
        })
        .catch(err => this.logger.warn(`checkDevice a échoué: ${(err as Error).message}`));
    }

    return true;
  }

  /**
   * Invalide le cache utilisateur (à appeler en cas de changement de profil).
   */
  invalidateUserCache(externalId: string): void {
    this.userCache.delete(externalId);
  }
}
