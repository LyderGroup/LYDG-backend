import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { UserDevice } from './user-device.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { FcmService } from '../notifications/fcm.service';

export type DeviceCheckOutcome =
  | { status: 'known' }
  | { status: 'new' }
  | { status: 'shared'; otherUserIds: string[] };

interface RegisterDeviceInput {
  userId: string;
  organizationId: string | null;
  deviceFingerprint: string;
  userAgent: string | null;
  ipAddress: string | null;
}

@Injectable()
export class UserDeviceService {
  private readonly logger = new Logger(UserDeviceService.name);

  constructor(
    @InjectRepository(UserDevice)
    private readonly devicesRepo: Repository<UserDevice>,
    private readonly dataSource: DataSource,
    // InAppNotificationService et FcmService sont déjà exportés par
    // NotificationModule (déclaré @Global), donc disponibles ici.
    private readonly notificationService: InAppNotificationService,
    private readonly fcmService: FcmService,
  ) {}

  /**
   * Reçoit le fingerprint à chaque requête authentifiée et :
   *   - update lastSeenAt si déjà connu pour ce user ;
   *   - INSERT + notification RH si nouveau pour ce user ;
   *   - INSERT + notification RH "device partagé" si un autre user actif
   *     possède déjà ce fingerprint.
   *
   * Idempotent : appel multiple depuis le guard ne crée pas de doublons
   * (UNIQUE partial index sur (user_id, device_fingerprint) WHERE active).
   *
   * Best-effort : les erreurs de notification ne bloquent pas l'auth.
   */
  async checkDevice(input: RegisterDeviceInput): Promise<DeviceCheckOutcome> {
    if (!input.deviceFingerprint) {
      return { status: 'known' }; // pas de fingerprint = pas de check, on laisse passer
    }

    const fp = input.deviceFingerprint.slice(0, 128); // sécurité, on borne

    // 1) Existe-t-il déjà un device actif pour ce user et ce fingerprint ?
    const existing = await this.devicesRepo.findOne({
      where: {
        userId: input.userId,
        deviceFingerprint: fp,
        revokedAt: IsNull(),
      },
    });

    if (existing) {
      // Mise à jour cheap : last_seen_at + ip_last_seen (atomique).
      await this.devicesRepo
        .createQueryBuilder()
        .update(UserDevice)
        .set({ lastSeenAt: () => 'CURRENT_TIMESTAMP', ipLastSeen: input.ipAddress })
        .where('id = :id', { id: existing.id })
        .execute();
      return { status: 'known' };
    }

    // 2) Le fingerprint est-il déjà associé à d'autres comptes actifs ?
    const otherDevices = await this.devicesRepo.find({
      where: { deviceFingerprint: fp, revokedAt: IsNull() },
      select: ['userId'],
    });
    const otherUserIds = otherDevices.map(d => d.userId).filter(uid => uid !== input.userId);
    const isShared = otherUserIds.length > 0;

    // 3) Insertion du nouveau device pour ce user.
    let inserted: UserDevice;
    try {
      inserted = await this.devicesRepo.save(
        this.devicesRepo.create({
          userId: input.userId,
          organizationId: input.organizationId,
          deviceFingerprint: fp,
          deviceName: this.guessDeviceName(input.userAgent),
          userAgent: input.userAgent,
          ipFirstSeen: input.ipAddress,
          ipLastSeen: input.ipAddress,
          isTrusted: false,
          revokedAt: null,
        }),
      );
    } catch (err) {
      // Race condition : le device a pu être créé entre le check et l'insert.
      // On retombe sur "known" sans erreur.
      this.logger.warn(`Insert user_device a échoué (race ?): ${(err as Error).message}`);
      return { status: 'known' };
    }

    // 4) Notification RH best-effort (n'échoue pas si le module notif a un pb).
    try {
      if (isShared) {
        await this.notifyHrSharedDevice(input, otherUserIds, inserted);
      } else {
        await this.notifyHrNewDevice(input, inserted);
      }
    } catch (err) {
      this.logger.warn(`Échec notification device : ${(err as Error).message}`);
    }

    return isShared ? { status: 'shared', otherUserIds } : { status: 'new' };
  }

  /** Liste les devices actifs d'un utilisateur (le plus récent d'abord). */
  async listForUser(userId: string): Promise<UserDevice[]> {
    return this.devicesRepo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });
  }

  /** Marque un device comme révoqué (visible mais non utilisable). */
  async revokeForUser(userId: string, deviceId: string): Promise<void> {
    const device = await this.devicesRepo.findOne({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException('Device introuvable');
    if (device.revokedAt) return;
    await this.devicesRepo.update(
      { id: deviceId },
      { revokedAt: new Date() },
    );
  }

  /**
   * Heuristique simple pour proposer un libellé human-friendly.
   * La vraie source pour l'utilisateur reste le user-agent complet.
   */
  private guessDeviceName(userAgent: string | null): string | null {
    if (!userAgent) return null;
    const ua = userAgent;
    const browser = /Edg/i.test(ua) ? 'Edge'
      : /Firefox/i.test(ua) ? 'Firefox'
      : /Chrome/i.test(ua) ? 'Chrome'
      : /Safari/i.test(ua) ? 'Safari'
      : 'Browser';
    const os = /Windows/i.test(ua) ? 'Windows'
      : /Mac OS/i.test(ua) ? 'macOS'
      : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
      : /Linux/i.test(ua) ? 'Linux'
      : 'Unknown';
    return `${browser} • ${os}`;
  }

  /**
   * Cherche les userIds qui ont la permission d'admin RH. Utilisé pour
   * router les notifications de device. Filtré par organisation.
   *
   * On considère "RH gestion" = HR_ATTENDANCE_MANAGE OU HR_EMPLOYEES_READ_ALL.
   */
  private async findHrAdminUserIds(organizationId: string | null): Promise<string[]> {
    if (!organizationId) return [];
    const rows: Array<{ user_id: string }> = await this.dataSource.query(
      `
      SELECT DISTINCT ur.user_id
      FROM core.user_roles ur
      INNER JOIN core.roles r ON r.id = ur.role_id
      INNER JOIN core.role_permissions rp ON rp.role_id = r.id
      INNER JOIN core.permissions p ON p.id = rp.permission_id
      WHERE ur.is_active = true
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND r.is_active = true
        AND (r.organization_id = $1 OR r.organization_id IS NULL)
        AND p.code IN ('hr.attendance.manage', 'hr.employees.read.all')
      `,
      [organizationId],
    );
    return rows.map(r => r.user_id);
  }

  /** Retourne "Prénom Nom" pour un userId, ou 'Employé inconnu' si introuvable. */
  private async getUserDisplayName(userId: string): Promise<string> {
    try {
      const rows: Array<{ first_name?: string; last_name?: string }> =
        await this.dataSource.query(
          `SELECT first_name, last_name FROM core.users WHERE id = $1 LIMIT 1`,
          [userId],
        );
      if (rows[0]) {
        const name = `${rows[0].first_name ?? ''} ${rows[0].last_name ?? ''}`.trim();
        if (name) return name;
      }
    } catch {
      // best-effort
    }
    return 'Employé inconnu';
  }

  /** Retourne noms de plusieurs userId en une seule requête. */
  private async getUserDisplayNames(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    try {
      const rows: Array<{ id: string; first_name?: string; last_name?: string }> =
        await this.dataSource.query(
          `SELECT id, first_name, last_name FROM core.users WHERE id = ANY($1)`,
          [userIds],
        );
      const map: Record<string, string> = {};
      for (const r of rows) {
        map[r.id] = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Employé inconnu';
      }
      return map;
    } catch {
      return {};
    }
  }

  private async notifyHrNewDevice(
    input: RegisterDeviceInput,
    device: UserDevice,
  ): Promise<void> {
    const recipientIds = await this.findHrAdminUserIds(input.organizationId);
    if (recipientIds.length === 0) return;

    const employeeName = await this.getUserDisplayName(input.userId);
    const deviceLabel = device.deviceName ?? 'Appareil inconnu';
    const ipLabel = device.ipFirstSeen ? ` — IP : ${device.ipFirstSeen}` : '';
    const when = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

    const data = {
      type: 'device_new' as const,
      userId: input.userId,
      deviceId: device.id,
      deviceName: deviceLabel,
      ip: device.ipFirstSeen,
    };
    const title = 'Nouvel appareil détecté';
    const message =
      `${employeeName} s'est connecté depuis un nouvel appareil.\n` +
      `Appareil : ${deviceLabel}${ipLabel}\n` +
      `Date : ${when}`;

    await this.notificationService.createMany(
      recipientIds.map(userId => ({
        userId,
        organizationId: input.organizationId!,
        type: 'mention' as any,
        title,
        message,
        data,
      })),
    );
    void this.fcmService.sendToUsers(recipientIds, title,
      `${employeeName} — ${deviceLabel}${ipLabel}`,
      { type: 'device_new', userId: input.userId, deviceId: device.id },
    );
  }

  private async notifyHrSharedDevice(
    input: RegisterDeviceInput,
    otherUserIds: string[],
    device: UserDevice,
  ): Promise<void> {
    const recipientIds = await this.findHrAdminUserIds(input.organizationId);
    if (recipientIds.length === 0) return;

    const allUserIds = [input.userId, ...otherUserIds];
    const names = await this.getUserDisplayNames(allUserIds);
    const nameList = allUserIds.map(uid => names[uid] ?? uid).join(', ');
    const deviceLabel = device.deviceName ?? 'Appareil inconnu';
    const ipLabel = device.ipFirstSeen ? ` — IP : ${device.ipFirstSeen}` : '';
    const when = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });

    const data = {
      type: 'device_shared' as const,
      userId: input.userId,
      deviceId: device.id,
      otherUserIds,
      ip: device.ipFirstSeen,
    };
    const title = 'Appareil partagé entre comptes';
    const message =
      `Un même appareil est utilisé par ${allUserIds.length} comptes : ${nameList}.\n` +
      `Appareil : ${deviceLabel}${ipLabel}\n` +
      `Date : ${when}\n` +
      `Vérification recommandée.`;

    await this.notificationService.createMany(
      recipientIds.map(userId => ({
        userId,
        organizationId: input.organizationId!,
        type: 'mention' as any,
        title,
        message,
        data,
      })),
    );
    void this.fcmService.sendToUsers(recipientIds, title,
      `${deviceLabel}${ipLabel} — ${allUserIds.length} comptes`,
      { type: 'device_shared', userId: input.userId, deviceId: device.id },
    );
  }
}
