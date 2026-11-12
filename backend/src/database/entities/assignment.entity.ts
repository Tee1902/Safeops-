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

@Entity('assignments')
@Index('IDX_assignments_one_active', ['incidentId'], {
  unique: true,
  where: `"status" IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
})
@Index('IDX_assignments_security_status', ['securityUserId', 'status'])
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sự cố được phân công
  @Column({
    name: 'incident_id',
    type: 'uuid',
  })
  incidentId: string;

  @ManyToOne(() => Incident)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  // Nhân viên an ninh được giao xử lý
  @Column({
    name: 'security_user_id',
    type: 'uuid',
  })
  securityUserId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'security_user_id' })
  securityUser: User;

  // Người thực hiện phân công
  @Column({
    name: 'assigned_by',
    type: 'uuid',
  })
  assignedBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by' })
  assigner: User;

  @Column({
    type: 'text',
    nullable: true,
  })
  note: string | null;

  @Column({
    type: 'varchar',
  })
  status: string;

  @CreateDateColumn({
    name: 'assigned_at',
    type: 'timestamptz',
  })
  assignedAt: Date;

  @Column({
    name: 'accepted_at',
    type: 'timestamptz',
    nullable: true,
  })
  acceptedAt: Date | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    nullable: true,
  })
  startedAt: Date | null;

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  completedAt: Date | null;
}
