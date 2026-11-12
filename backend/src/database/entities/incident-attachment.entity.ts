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

@Entity('incident_attachments')
@Index('IDX_attachments_incident', ['incidentId'])
export class IncidentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sự cố mà tệp đính kèm thuộc về
  @Column({
    name: 'incident_id',
    type: 'uuid',
  })
  incidentId: string;

  @ManyToOne(() => Incident)
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  // Người tải tệp lên
  @Column({
    name: 'uploaded_by',
    type: 'uuid',
  })
  uploadedBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User;

  @Column({
    name: 'file_name',
    type: 'varchar',
  })
  fileName: string;

  @Column({
    name: 'file_url',
    type: 'text',
  })
  fileUrl: string;

  @Column({
    name: 'file_type',
    type: 'varchar',
  })
  fileType: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
  })
  fileSize: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
