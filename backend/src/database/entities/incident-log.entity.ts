import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { Incident } from './incident.entity.js';
import { User } from './user.entity.js';

@Entity('incident_logs')
@Index('IDX_incident_logs_incident_created', ['incidentId', 'createdAt'])
export class IncidentLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sự cố có hoạt động được ghi nhận
  @Column({
    name: 'incident_id',
    type: 'uuid',
  })
  incidentId: string;

  @ManyToOne(() => Incident)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  // Người thực hiện hành động
  @Column({
    name: 'actor_id',
    type: 'uuid',
    nullable: true,
  })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  // Hành động được thực hiện
  @Column({
    type: 'varchar',
  })
  action: string;

  // Trạng thái trước khi thay đổi
  @Column({
    name: 'old_status',
    type: 'varchar',
    nullable: true,
  })
  oldStatus: string | null;

  // Trạng thái sau khi thay đổi
  @Column({
    name: 'new_status',
    type: 'varchar',
    nullable: true,
  })
  newStatus: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  note: string | null;

  // Thông tin bổ sung dạng JSON
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
