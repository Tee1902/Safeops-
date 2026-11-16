import type { SchemaObject } from '@nestjs/swagger';
import { INCIDENT_STATUSES, SEVERITIES } from '../common/workflow.js';
const integer = { type: 'integer', minimum: 0 } as const;
const string = { type: 'string' } as const;
const counts = (keys: readonly string[]): SchemaObject => ({
  type: 'object',
  required: [...keys],
  properties: Object.fromEntries(keys.map((key) => [key, integer])),
});
const metric: SchemaObject = {
  type: 'object',
  properties: {
    samples: integer,
    averageSeconds: { type: 'number', minimum: 0, nullable: true },
  },
};
export const dashboardStatisticsSchema: SchemaObject = {
  type: 'object',
  properties: {
    timezone: { ...string, enum: ['Asia/Saigon'] },
    granularity: { ...string, enum: ['day', 'month'] },
    total: integer,
    byStatus: counts(INCIDENT_STATUSES),
    bySeverity: counts(SEVERITIES),
    byType: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: integer, code: string, name: string, count: integer },
      },
    },
    trend: {
      type: 'array',
      items: { type: 'object', properties: { period: string, count: integer } },
    },
    responseTimes: {
      type: 'object',
      properties: { verification: metric, resolution: metric },
    },
  },
};
export const mapMarkerSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { ...string, format: 'uuid' },
    title: string,
    status: { ...string, enum: [...INCIDENT_STATUSES] },
    severity: { ...string, enum: [...SEVERITIES] },
    incidentTypeId: integer,
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    createdAt: { ...string, format: 'date-time' },
    updatedAt: { ...string, format: 'date-time' },
  },
};
