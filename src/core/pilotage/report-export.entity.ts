import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'module_a_pilotage', name: 'report_exports' })
export class ReportExport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'organization_id', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'uuid', name: 'report_id', nullable: true })
  reportId!: string | null;

  @Column({ type: 'date', name: 'period_start', nullable: true })
  periodStart!: string | null;

  @Column({ type: 'date', name: 'period_end', nullable: true })
  periodEnd!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'period_type', nullable: true })
  periodType!: string | null;

  @Column({ type: 'varchar', length: 20 })
  format!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name', nullable: true })
  fileName!: string | null;

  @Column({ type: 'text', name: 'storage_url', nullable: true })
  storageUrl!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload!: unknown;

  @Column({ type: 'uuid', name: 'generated_by', nullable: true })
  generatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'generated_at' })
  generatedAt!: Date;
}
