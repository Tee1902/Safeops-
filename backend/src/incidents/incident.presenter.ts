import type { Incident } from '../database/entities/incident.entity.js';

/** Explicit public fields: list serialization must never traverse user relations. */
export function presentIncidentListItem(item: Incident) {
  const type = item.incidentType;
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    incidentTypeId: item.incidentTypeId,
    reporterId: item.reporterId,
    verifiedBy: item.verifiedBy,
    latitude: item.latitude,
    longitude: item.longitude,
    address: item.address,
    severity: item.severity,
    status: item.status,
    rejectionReason: item.rejectionReason,
    verifiedAt: item.verifiedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    resolvedAt: item.resolvedAt,
    incidentType: type
      ? {
          id: type.id,
          code: type.code,
          name: type.name,
          description: type.description,
          icon: type.icon,
          isActive: type.isActive,
          createdAt: type.createdAt,
          updatedAt: type.updatedAt,
        }
      : null,
  };
}
