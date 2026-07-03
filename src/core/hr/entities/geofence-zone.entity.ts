import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/organizations.entity';
import { User } from '../../users/user.entity';
 
import { numericTransformer } from '../../../common/typeorm/numeric-transformer';
export interface PolygonCoordinate {
  lat: number;
  lng: number;
}

@Entity({ schema: 'module_c_rh', name: 'geofence_zones' })
export class GeofenceZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Centre de la zone (pour affichage sur carte)
  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'center_latitude', nullable: true })
  centerLatitude!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'center_longitude', nullable: true })
  centerLongitude!: number | null;

  // Polygone: tableau de coordonnées [{lat, lng}, ...]
  // Stocké en JSONB pour flexibilité
  @Column({ type: 'jsonb', name: 'polygon_coordinates', nullable: true })
  polygonCoordinates!: PolygonCoordinate[] | null;

  // Anciens champs conservés pour compatibilité (cercle)
  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'latitude', nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal',
    transformer: numericTransformer, precision: 10, scale: 7, name: 'longitude', nullable: true })
  longitude!: number | null;

  @Column({ type: 'integer', nullable: true })
  radius!: number | null;

  // Type de zone: 'polygon' ou 'circle'
  @Column({ type: 'varchar', length: 20, name: 'zone_type', default: 'polygon' })
  zoneType!: string;

  // Actif ou non
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  // Type de zone (office, site, etc.)
  @Column({ type: 'varchar', length: 50, default: 'office' })
  type!: string;

  // Adresse textuelle
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
