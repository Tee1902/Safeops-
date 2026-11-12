import 'reflect-metadata';

import AppDataSource from '../data-source.js';
import { IncidentType } from '../entities/incident-type.entity.js';

const incidentTypes = [
  {
    code: 'FIRE',
    name: 'Cháy, nổ',
    description: 'Các sự cố cháy, nổ và nguy cơ hỏa hoạn.',
    icon: 'flame',
    isActive: true,
  },
  {
    code: 'ACCIDENT',
    name: 'Tai nạn',
    description: 'Các sự cố tai nạn giao thông và tai nạn khác.',
    icon: 'car',
    isActive: true,
  },
  {
    code: 'MEDICAL',
    name: 'Cấp cứu y tế',
    description: 'Các tình huống cần hỗ trợ hoặc cấp cứu y tế.',
    icon: 'heart-pulse',
    isActive: true,
  },
  {
    code: 'SECURITY',
    name: 'An ninh, trật tự',
    description: 'Các sự cố liên quan đến an ninh và trật tự.',
    icon: 'shield-alert',
    isActive: true,
  },
  {
    code: 'ENVIRONMENT',
    name: 'Sự cố môi trường',
    description: 'Các sự cố ô nhiễm và vấn đề môi trường.',
    icon: 'leaf',
    isActive: true,
  },
  {
    code: 'INFRASTRUCTURE',
    name: 'Hạ tầng, cơ sở vật chất',
    description: 'Các sự cố liên quan đến hạ tầng và cơ sở vật chất.',
    icon: 'construction',
    isActive: true,
  },
  {
    code: 'OTHER',
    name: 'Khác',
    description: 'Các sự cố chưa thuộc những nhóm được phân loại.',
    icon: 'ellipsis',
    isActive: true,
  },
];

async function seedIncidentTypes() {
  try {
    await AppDataSource.initialize();

    const repository = AppDataSource.getRepository(IncidentType);

    // Re-running setup must preserve catalog edits and disabled types.
    await repository
      .createQueryBuilder()
      .insert()
      .values(incidentTypes)
      .orIgnore()
      .execute();

    console.log('Seed incident_types thành công!');
  } catch (error) {
    console.error('Seed incident_types thất bại:', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seedIncidentTypes();
