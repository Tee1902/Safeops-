import { ValidationPipe, type Type } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RegisterDto } from '../src/auth/dto/register.dto.js';
import { LoginDto } from '../src/auth/dto/login.dto.js';
import { CreateUserDto } from '../src/users/dto/create-user.dto.js';
import { UpdateUserDto } from '../src/users/dto/update-user.dto.js';
import { UpdateUserStatusDto } from '../src/users/dto/update-user-status.dto.js';
import { UpdateUserRoleDto } from '../src/users/dto/update-user-role.dto.js';
import { ChangePasswordDto } from '../src/users/dto/change-password.dto.js';
import { CreateIncidentDto } from '../src/incidents/dto/create-incident.dto.js';
import { UpdateIncidentDto } from '../src/incidents/dto/update-incident.dto.js';
import { RejectIncidentDto } from '../src/incidents/dto/review-incident.dto.js';
import {
  AssignmentNoteDto,
  CreateAssignmentDto,
} from '../src/assignments/assignments.dto.js';
import {
  CreateIncidentTypeDto,
  UpdateIncidentTypeDto,
} from '../src/incident-types/incident-types.dto.js';

const contracts: Record<string, Type<unknown>> = {
  'POST /api/auth/register': RegisterDto,
  'POST /api/auth/login': LoginDto,
  'POST /api/users': CreateUserDto,
  'PATCH /api/users/{{userId}}': UpdateUserDto,
  'PATCH /api/users/me': UpdateUserDto,
  'PATCH /api/users/{{userId}}/status': UpdateUserStatusDto,
  'PATCH /api/users/{{userId}}/role': UpdateUserRoleDto,
  'PATCH /api/users/me/password': ChangePasswordDto,
  'POST /api/incidents': CreateIncidentDto,
  'PATCH /api/incidents/{{incidentId}}': UpdateIncidentDto,
  'PATCH /api/incidents/{{incidentId}}/reject': RejectIncidentDto,
  'PATCH /api/incidents/{{incidentId}}/close': AssignmentNoteDto,
  'POST /api/incidents/{{incidentId}}/assignments': CreateAssignmentDto,
  ...Object.fromEntries(
    ['accept', 'start', 'complete', 'cancel'].map((action) => [
      `PATCH /api/assignments/{{assignmentId}}/${action}`,
      AssignmentNoteDto,
    ]),
  ),
  'POST /api/incident-types': CreateIncidentTypeDto,
  'PATCH /api/incident-types/{{incidentTypeId}}': UpdateIncidentTypeDto,
};
interface PostmanItem {
  request: {
    method: string;
    url: string;
    body?: { mode: string; raw: string };
  };
}
describe('Generated Postman request bodies match actual API validation', () => {
  let requests: Record<string, PostmanItem['request']>;
  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['scripts/export-postman.mjs']);
    const collection = JSON.parse(
      await readFile('docs/SafeOps.postman_collection.json', 'utf8'),
    ) as { item: { item: PostmanItem[] }[] };
    requests = Object.fromEntries(
      collection.item
        .flatMap((g) => g.item)
        .map(({ request }) => [
          request.method + ' ' + request.url.replace('{{baseUrl}}', ''),
          request,
        ]),
    );
  });
  it.each(Object.entries(contracts))(
    '%s accepts the generated body after replacing variables',
    async (key, metatype) => {
      const vars: Record<string, string> = {
        email: 'review@example.com',
        password: 'ReviewPassword123!',
        newPassword: 'NewReviewPassword123!',
        roleId: '3',
        incidentTypeId: '1',
        securityUserId: 'd835b7c5-f14e-431d-994c-909d357a8a41',
      };
      const request = requests[key];
      expect(request?.body?.mode).toBe('raw');
      const raw = request.body!.raw.replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => vars[name] ?? 'unresolved',
      );
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(JSON.parse(raw), { type: 'body', metatype }),
      ).resolves.toBeDefined();
      if (key === 'POST /api/auth/login')
        expect(request.body!.raw).toContain('{{email}}');
    },
  );
});
