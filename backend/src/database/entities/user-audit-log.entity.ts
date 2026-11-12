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

@Entity('user_audit_logs')
@Index('IDX_user_audit_target_created', ['targetUserId', 'createdAt'])
export class UserAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'actor_id' }) actor: User;
  @Column({ name: 'target_user_id', type: 'uuid' }) targetUserId: string;
  @ManyToOne(() => User)
  @JoinColumn({ name: 'target_user_id' })
  targetUser: User;
  @Column({ type: 'varchar', length: 50 }) action: string;
  @Column({ type: 'jsonb' }) changes: Record<string, unknown>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
