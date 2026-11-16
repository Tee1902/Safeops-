import {
  Injectable,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import ExcelJS from 'exceljs';
import { IncidentsService } from './incidents.service.js';
import { IncidentQueryDto } from './dto/incident-query.dto.js';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { requireManager } from '../common/workflow.js';

export class IncidentExportQueryDto extends OmitType(IncidentQueryDto, [
  'page',
  'limit',
] as const) {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'csv';
}

export function spreadsheetText(value: string) {
  // Control characters before a formula must also be neutralized for CSV readers.
  // eslint-disable-next-line no-control-regex
  return /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
}

@Injectable()
export class IncidentExportService {
  constructor(private readonly incidents: IncidentsService) {}
  async export(query: IncidentExportQueryDto, actor: AuthenticatedUser) {
    requireManager(actor);
    const items = await this.incidents
      .filtered(Object.assign(new IncidentQueryDto(), query), actor)
      .select([
        'incident.id',
        'incident.title',
        'incident.status',
        'incident.severity',
        'incident.incidentTypeId',
        'incident.latitude',
        'incident.longitude',
        'incident.address',
        'incident.createdAt',
        'incident.verifiedAt',
        'incident.resolvedAt',
      ])
      .orderBy('incident.created_at', 'DESC')
      .addOrderBy('incident.id', 'DESC')
      .limit(10001)
      .getMany();
    if (items.length > 10000)
      throw new PayloadTooLargeException(
        'Export is limited to 10,000 incidents. Narrow the filters.',
      );
    const headers = [
      'ID',
      'Tiêu đề',
      'Trạng thái',
      'Mức độ',
      'Loại sự cố (ID)',
      'Vĩ độ',
      'Kinh độ',
      'Địa chỉ',
      'Ngày tạo (UTC)',
      'Ngày xác minh (UTC)',
      'Ngày giải quyết (UTC)',
    ];
    const rows = items.map((item) => [
      item.id,
      spreadsheetText(item.title),
      item.status,
      item.severity,
      item.incidentTypeId,
      Number(item.latitude),
      Number(item.longitude),
      spreadsheetText(item.address ?? ''),
      item.createdAt.toISOString(),
      item.verifiedAt?.toISOString() ?? '',
      item.resolvedAt?.toISOString() ?? '',
    ]);
    let buffer: Buffer;
    if (query.format === 'xlsx') {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Sự cố');
      sheet.addRow(headers);
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: 'A1', to: 'K1' };
      buffer = Buffer.from(await book.xlsx.writeBuffer());
    } else {
      const escape = (value: string | number) =>
        `"${String(value).replaceAll('"', '""')}"`;
      buffer = Buffer.from(
        '\uFEFF' +
          [headers, ...rows]
            .map((row) => row.map(escape).join(','))
            .join('\r\n') +
          '\r\n',
      );
    }
    return new StreamableFile(buffer, {
      type:
        query.format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8',
      disposition: `attachment; filename="safeops-incidents.${query.format}"`,
      length: buffer.length,
    });
  }
}
