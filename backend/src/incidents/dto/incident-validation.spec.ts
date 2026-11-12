import { ValidationPipe } from '@nestjs/common';
import { CreateIncidentDto } from './create-incident.dto.js';
import { UpdateIncidentDto } from './update-incident.dto.js';
import { IncidentQueryDto } from './incident-query.dto.js';
import { RejectIncidentDto } from './review-incident.dto.js';
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe('Incident input boundary', () => {
  const valid = {
    title: 'Fire',
    incidentTypeId: 1,
    latitude: 10.7,
    longitude: 106.6,
    severity: 'HIGH',
  };
  it.each([
    { title: '   ' },
    { latitude: 91 },
    { latitude: false },
    { latitude: '' },
    { longitude: ' ' },
    { incidentTypeId: true },
    { longitude: -181 },
    { latitude: 10.12345678 },
    { severity: 'URGENT' },
    { incidentTypeId: 0 },
    { reporterId: 'another-user' },
    { status: 'VERIFIED' },
  ])('rejects invalid creation fields %j', async (fields) => {
    await expect(
      pipe.transform(
        { ...valid, ...fields },
        { type: 'body', metatype: CreateIncidentDto },
      ),
    ).rejects.toThrow();
  });
  it.each([
    'title',
    'description',
    'address',
    'latitude',
    'longitude',
    'incidentTypeId',
    'severity',
  ])('rejects null patch field %s', async (field) => {
    await expect(
      pipe.transform(
        { [field]: null },
        { type: 'body', metatype: UpdateIncidentDto },
      ),
    ).rejects.toThrow();
  });
  it('converts pagination query strings to numbers', async () => {
    const query = await pipe.transform(
      { page: '2', limit: '5' },
      { type: 'query', metatype: IncidentQueryDto },
    );
    expect(query).toMatchObject({ page: 2, limit: 5 });
  });
  it('rejects a whitespace-only rejection reason', async () => {
    await expect(
      pipe.transform(
        { reason: '  ' },
        { type: 'body', metatype: RejectIncidentDto },
      ),
    ).rejects.toThrow();
  });
});
