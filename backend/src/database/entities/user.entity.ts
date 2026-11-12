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

import { Role } from './role.entity.js';
import { Exclude } from 'class-transformer';
import type { Relation } from 'typeorm';

@Entity('users')
@Index('UQ_users_email_normalized', { synchronize: false })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'full_name',
    type: 'varchar',
  })
  fullName: string;

  @Column({
    type: 'varchar',
    unique: true,
  })
  email: string;

  @Exclude()
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Exclude()
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  phone: string | null;

  @Column({
    name: 'avatar_url',
    type: 'text',
    nullable: true,
  })
  avatarUrl: string | null;

  @Column({
    name: 'role_id',
    type: 'int',
  })
  roleId: number;

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_id' })
  role: Relation<Role>;

  @Column({
    name: 'is_active',
    type: 'boolean',
  })
  isActive: boolean;

  @Column({
    name: 'email_verified',
    type: 'boolean',
  })
  emailVerified: boolean;

  @Column({
    name: 'last_login_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastLoginAt: Date | null;

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
}
