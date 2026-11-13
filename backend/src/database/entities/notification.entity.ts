import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { User } from './user.entity.js';
import { Incident } from './incident.entity.js';

@Entity('notifications')
@Index('IDX_notifications_user_read', ['userId', 'isRead'])
@Index('IDX_notifications_user_created_id', ['userId', 'createdAt', 'id'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Người nhận thông báo
  @Column({
    name: 'user_id',
    type: 'uuid',
  })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Sự cố liên quan (nếu có)
  @Column({
    name: 'incident_id',
    type: 'uuid',
    nullable: true,
  })
  incidentId: string | null;

  @ManyToOne(() => Incident, { nullable: true })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident | null;

  @Column({
    type: 'varchar',
  })
  type: string;

  @Column({
    type: 'varchar',
  })
  title: string;

  @Column({
    type: 'text',
  })
  message: string;

  @Column({
    name: 'is_read',
    type: 'boolean',
  })
  isRead: boolean;

  @Column({
    name: 'read_at',
    type: 'timestamptz',
    nullable: true,
  })
  readAt: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
