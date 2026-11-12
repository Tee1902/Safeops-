import { PartialType, OmitType } from '@nestjs/swagger';

import { CreateIncidentDto } from './create-incident.dto.js';

export class UpdateIncidentDto extends PartialType(
  OmitType(CreateIncidentDto, ['attachmentIds'] as const),
  {
    skipNullProperties: false,
  },
) {}
