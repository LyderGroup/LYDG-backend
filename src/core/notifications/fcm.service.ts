import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { FcmToken } from './fcm-token.entity';

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmMulticastMessage {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  constructor(
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepo: Repository<FcmToken>,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try { 
      if (admin.apps.length > 0) {
        this.app = admin.apps[0]!;
        return;
      }

      // intialisation de firebase adminLe SDK
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn('Firebase credentials not configured. FCM notifications will be disabled.');
        return;
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }
 
  async registerToken(
    userId: string,
    organizationId: string,
    token: string,
    deviceType?: string,
    device_id?: string,
  ): Promise<FcmToken> { 
    if (device_id) {
      await this.fcmTokenRepo.update(
        { userId, device_id },
        { isActive: false },
      );
    }
 
    const existing = await this.fcmTokenRepo.findOne({
      where: { userId, token },
    });

    if (existing) {
      existing.isActive = true;
      existing.device_type = deviceType ?? existing.device_type;
      existing.device_id = device_id ?? existing.device_id;
      return this.fcmTokenRepo.save(existing);
    }

    const fcmToken = this.fcmTokenRepo.create({
      userId,
      organizationId,
      token,
      device_type: deviceType ?? null,
      device_id: device_id ?? null,
      isActive: true,
    });

    return this.fcmTokenRepo.save(fcmToken);
  }
 
  async getTokensForUser(userId: string): Promise<string[]> {
    const tokens = await this.fcmTokenRepo.find({
      where: { userId, isActive: true },
      select: ['token'],
    });

    return tokens.map(t => t.token);
  }
 
  async getTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const tokens = await this.fcmTokenRepo
      .createQueryBuilder('ft')
      .where('ft.userId IN (:...userIds)', { userIds })
      .andWhere('ft.isActive = true')
      .getMany();

    const map = new Map<string, string[]>();
    for (const token of tokens) {
      const existing = map.get(token.userId) ?? [];
      existing.push(token.token);
      map.set(token.userId, existing);
    }

    return map;
  }

  async sendToOne(message: FcmMessage): Promise<boolean> {
    if (!this.app) {
      this.logger.warn('Firebase not initialized. Skipping notification.');
      return false;
    }

    try {
      await admin.messaging().send({
        token: message.token,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data ?? {},
      });
      return true;
    } catch (error: any) {
      this.logger.error('Failed to send FCM notification', error);

      // Si le token est invalide, le désactiver
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        await this.deactivateToken(message.token);
      }

      return false;
    }
  }

  /**
   * Envoie une notification à plusieurs tokens.
   */
  async sendToMany(message: FcmMulticastMessage): Promise<number> {
    if (!this.app) {
      this.logger.warn('Firebase not initialized. Skipping notification.');
      return 0;
    }

    if (message.tokens.length === 0) {
      return 0;
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: message.tokens,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data ?? {},
      });

      // Désactiver les tokens invalides
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(message.tokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await this.fcmTokenRepo.update(
          { token: In(invalidTokens) },
          { isActive: false },
        );
      }

      return response.successCount;
    } catch (error) {
      this.logger.error('Failed to send multicast FCM notification', error);
      return 0;
    }
  }

  /**
   * Envoie une notification à tous les appareils d'un utilisateur.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
    const tokens = await this.getTokensForUser(userId);
    if (tokens.length === 0) {
      return 0;
    }

    return this.sendToMany({
      tokens,
      title,
      body,
      data,
    });
  }

  /**
   * Envoie une notification à plusieurs utilisateurs.
   */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<number> {
    const tokensMap = await this.getTokensForUsers(userIds);
    const allTokens = Array.from(tokensMap.values()).flat();

    if (allTokens.length === 0) {
      return 0;
    }

    return this.sendToMany({
      tokens: allTokens,
      title,
      body,
      data,
    });
  }

  /**
   * Désactive un token FCM.
   */
  async deactivateToken(token: string): Promise<void> {
    await this.fcmTokenRepo.update(
      { token },
      { isActive: false },
    );
  }

  /**
   * Supprime les tokens inactifs depuis plus de 30 jours.
   */
  async cleanOldTokens(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await this.fcmTokenRepo
      .createQueryBuilder()
      .delete()
      .where('isActive = false')
      .andWhere('updatedAt < :date', { date: thirtyDaysAgo })
      .execute();
  }
}
