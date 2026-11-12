import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { User } from './user.entity.js';
import { IncidentType } from './incident-type.entity.js';

@Entity('incidents')
@Index('IDX_incidents_reporter_created', ['reporterId', 'createdAt'])
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
  })
  title: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string | null;

  // Loại sự cố
  @Column({
    name: 'incident_type_id',
    type: 'int',
  })
  incidentTypeId: number;

  @ManyToOne(() => IncidentType)
  @JoinColumn({ name: 'incident_type_id' })
  incidentType: IncidentType;

  // Người báo cáo sự cố
  @Column({
    name: 'reporter_id',
    type: 'uuid',
  })
  reporterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  // Người xác minh sự cố
  @Column({
    name: 'verified_by',
    type: 'uuid',
    nullable: true,
  })
  verifiedBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifier: User | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
  })
  latitude: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 7,
  })
  longitude: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  address: string | null;

  @Column({
    type: 'varchar',
  })
  severity: string;

  @Column({
    type: 'varchar',
  })
  status: string;

  @Column({
    name: 'rejection_reason',
    type: 'text',
    nullable: true,
  })
  rejectionReason: string | null;

  @Column({
    name: 'verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  verifiedAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt: Date;

  @Column({
    name: 'resolved_at',
    type: 'timestamptz',
    nullable: true,
  })
  resolvedAt: Date | null;
}
