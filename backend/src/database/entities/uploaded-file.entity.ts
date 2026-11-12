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
@Entity('uploaded_files')
@Index('IDX_uploaded_files_owner_id', ['ownerId'])
export class UploadedFile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'owner_id', type: 'uuid' }) ownerId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'owner_id' }) owner: User;
  @Column({ type: 'varchar', length: 50, unique: true }) filename: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 30 }) mimeType: string;
  @Column({ type: 'int' }) size: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
