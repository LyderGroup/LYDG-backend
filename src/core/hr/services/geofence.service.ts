import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeofenceZone, PolygonCoordinate } from '../entities/geofence-zone.entity';

export interface CreateGeofenceInput {
  name: string;
  description?: string;
  // Pour cercle (legacy)
  latitude?: number;
  longitude?: number;
  radius?: number;
  // Pour polygone
  polygonCoordinates?: PolygonCoordinate[];
  centerLatitude?: number;
  centerLongitude?: number;
  zoneType?: 'polygon' | 'circle';
  type?: string;
  address?: string;
}

export interface UpdateGeofenceInput {
  name?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  polygonCoordinates?: PolygonCoordinate[];
  centerLatitude?: number;
  centerLongitude?: number;
  zoneType?: 'polygon' | 'circle';
  isActive?: boolean;
  type?: string;
  address?: string;
}

export interface CheckLocationInput {
  latitude: number;
  longitude: number;
}

export interface CheckLocationResult {
  isInZone: boolean;
  zone?: GeofenceZone;
  distance?: number;
}

const GPS_TOLERANCE_METERS = 50;

@Injectable()
export class GeofenceService {
  constructor(
    @InjectRepository(GeofenceZone)
    private readonly geofenceRepo: Repository<GeofenceZone>,
  ) { }

  /**
   * Créer une nouvelle zone
   */
  async createZone(
    organizationId: string,
    input: CreateGeofenceInput,
    createdBy: string | null,
  ): Promise<GeofenceZone> {
    const zoneType = input.zoneType ?? (input.polygonCoordinates ? 'polygon' : 'circle');

    const zone = this.geofenceRepo.create({
      organizationId,
      name: input.name,
      description: input.description ?? null,
      // Champs cercle (legacy)
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      radius: input.radius ?? null,
      // Champs polygone
      polygonCoordinates: input.polygonCoordinates ?? null,
      centerLatitude: input.centerLatitude ?? input.latitude ?? null,
      centerLongitude: input.centerLongitude ?? input.longitude ?? null,
      zoneType,
      type: input.type ?? 'office',
      address: input.address ?? null,
      isActive: true,
      createdBy,
    });

    return this.geofenceRepo.save(zone);
  }

  /**
   * Lister toutes les zones d'une organisation
   */
  async listZones(organizationId: string): Promise<GeofenceZone[]> {
    return this.geofenceRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Récupérer une zone par ID
   */
  async getZone(organizationId: string, zoneId: string): Promise<GeofenceZone> {
    const zone = await this.geofenceRepo.findOne({
      where: { id: zoneId, organizationId },
    });

    if (!zone) {
      throw new NotFoundException('Zone non trouvée');
    }

    return zone;
  }

  /**
   * Mettre à jour une zone
   */
  async updateZone(
    organizationId: string,
    zoneId: string,
    input: UpdateGeofenceInput,
  ): Promise<GeofenceZone> {
    const zone = await this.getZone(organizationId, zoneId);

    if (input.name !== undefined) zone.name = input.name;
    if (input.description !== undefined) zone.description = input.description;
    if (input.latitude !== undefined) zone.latitude = input.latitude;
    if (input.longitude !== undefined) zone.longitude = input.longitude;
    if (input.radius !== undefined) zone.radius = input.radius;
    if (input.polygonCoordinates !== undefined) zone.polygonCoordinates = input.polygonCoordinates;
    if (input.centerLatitude !== undefined) zone.centerLatitude = input.centerLatitude;
    if (input.centerLongitude !== undefined) zone.centerLongitude = input.centerLongitude;
    if (input.zoneType !== undefined) zone.zoneType = input.zoneType;
    if (input.isActive !== undefined) zone.isActive = input.isActive;
    if (input.type !== undefined) zone.type = input.type;
    if (input.address !== undefined) zone.address = input.address;

    return this.geofenceRepo.save(zone);
  }

  async deleteZone(organizationId: string, zoneId: string): Promise<{ deleted: boolean }> {
    const zone = await this.getZone(organizationId, zoneId);
    await this.geofenceRepo.remove(zone);
    return { deleted: true };
  }

  async getDefaultZone(organizationId: string): Promise<GeofenceZone | null> {
    return this.geofenceRepo.findOne({
      where: { organizationId, isActive: true, type: 'office' },
    });
  }

  /**
   * Vérifier si une position est dans une zone autorisée
   */
  async checkLocation(
    organizationId: string,
    input: CheckLocationInput,
  ): Promise<CheckLocationResult> {
    const zones = await this.geofenceRepo.find({
      where: { organizationId, isActive: true },
    });

    if (zones.length === 0) {
      return { isInZone: true };
    }

    for (const zone of zones) {
      const isInZone = zone.zoneType === 'polygon'
        ? this.isPointInPolygon(input.latitude, input.longitude, zone.polygonCoordinates) ||
        this.isPointNearPolygonEdge(input.latitude, input.longitude, zone.polygonCoordinates, GPS_TOLERANCE_METERS)
        : this.isPointInCircle(input.latitude, input.longitude, zone.latitude, zone.longitude, zone.radius, GPS_TOLERANCE_METERS);

      if (isInZone) {
        const distance = this.calculateDistance(
          input.latitude,
          input.longitude,
          zone.centerLatitude ?? zone.latitude ?? 0,
          zone.centerLongitude ?? zone.longitude ?? 0,
        );
        return { isInZone: true, zone, distance };
      }
    }

    // Trouver la zone la plus proche
    let nearestZone = zones[0];
    let minDistance = this.calculateDistance(
      input.latitude,
      input.longitude,
      zones[0].centerLatitude ?? zones[0].latitude ?? 0,
      zones[0].centerLongitude ?? zones[0].longitude ?? 0,
    );

    for (const zone of zones.slice(1)) {
      const dist = this.calculateDistance(
        input.latitude,
        input.longitude,
        zone.centerLatitude ?? zone.latitude ?? 0,
        zone.centerLongitude ?? zone.longitude ?? 0,
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestZone = zone;
      }
    }

    return { isInZone: false, zone: nearestZone, distance: minDistance };
  }

  /**
   * Vérifier si un point est dans un cercle
   */
  private isPointInCircle(
    lat: number,
    lng: number,
    centerLat: number | null,
    centerLng: number | null,
    radius: number | null,
    tolerance: number = 0,
  ): boolean {
    if (centerLat === null || centerLng === null || radius === null) {
      return false;
    }
    const distance = this.calculateDistance(lat, lng, centerLat, centerLng);
    return distance <= radius + tolerance;
  }

  /**
   * Vérifier si un point est dans un polygone (algorithme Ray Casting)
   */
  private isPointInPolygon(
    lat: number,
    lng: number,
    polygon: PolygonCoordinate[] | null,
  ): boolean {
    if (!polygon || polygon.length < 3) {
      return false;
    }

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].lat;
      const yi = polygon[i].lng;
      const xj = polygon[j].lat;
      const yj = polygon[j].lng;

      const intersect =
        ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Vérifier si un point est à moins de toleranceMètres du bord du polygone
   */
  private isPointNearPolygonEdge(
    lat: number,
    lng: number,
    polygon: PolygonCoordinate[] | null,
    toleranceMeters: number,
  ): boolean {
    if (!polygon || polygon.length < 2) return false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const dist = this.distanceToSegment(
        lat, lng,
        polygon[j].lat, polygon[j].lng,
        polygon[i].lat, polygon[i].lng,
      );
      if (dist <= toleranceMeters) return true;
    }
    return false;
  }

  /**
   * Distance (en mètres) d'un point au segment [A→B] (approximation locale)
   */
  private distanceToSegment(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
  ): number {
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return this.calculateDistance(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const projLat = ax + t * dx, projLng = ay + t * dy;
    return this.calculateDistance(px, py, projLat, projLng);
  }

  /**
   * Calculer la distance entre deux points (Haversine)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance);
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
