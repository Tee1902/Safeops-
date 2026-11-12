import fs from 'node:fs/promises';

const document = JSON.parse(await fs.readFile('docs/openapi.json', 'utf8'));
const resolveSchema = (schema = {}) =>
  schema.$ref
    ? resolveSchema(document.components.schemas[schema.$ref.split('/').at(-1)])
    : schema;
function example(schema, key = '') {
  schema = resolveSchema(schema);
  if (key === 'email') return '{{email}}';
  if (['password', 'currentPassword'].includes(key)) return '{{password}}';
  if (['newPassword', 'confirmPassword'].includes(key))
    return '{{newPassword}}';
  if (key === 'securityUserId') return '{{securityUserId}}';
  if (key === 'roleId') return '{{roleId}}';
  if (key === 'incidentTypeId') return '{{incidentTypeId}}';
  if (key === 'latitude') return 10.7769;
  if (key === 'longitude') return 106.7009;
  if (key === 'role') return 'SECURITY';
  if (key === 'phone') return '0901234567';
  if (key === 'avatarUrl') return null;
  if (key === 'code') return 'MEDICAL_REVIEW';
  if (schema.example !== undefined) return schema.example;
  if (key === 'reason' || key === 'note') return 'Ghi chú xử lý sự cố';
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return true;
  if (['number', 'integer'].includes(schema.type)) return schema.minimum ?? 1;
  if (schema.type === 'object' || schema.properties)
    return Object.fromEntries(
      Object.entries(schema.properties ?? {})
        .filter(([, s]) => !s.readOnly)
        .map(([k, s]) => [k, example(s, k)]),
    );
  return key === 'fullName'
    ? 'Người dùng SafeOps'
    : key === 'title'
      ? 'Sự cố tại tòa nhà A'
      : 'Thông tin mẫu';
}
const groups = new Map();
for (const [route, operations] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (!['get', 'post', 'patch', 'delete', 'put'].includes(method)) continue;
    const group = operation.tags?.[0] ?? 'SafeOps';
    const url =
      '{{baseUrl}}' +
      route.replace(
        /\{([^}]+)\}/g,
        (_, name) =>
          '{{' +
          (name === 'id'
            ? route.includes('/users/')
              ? 'userId'
              : route.startsWith('/api/assignments/')
                ? 'assignmentId'
                : route.startsWith('/api/attachments/')
                  ? 'attachmentId'
                  : route.startsWith('/api/notifications/')
                    ? 'notificationId'
                    : route.startsWith('/api/incident-types/')
                      ? 'incidentTypeId'
                      : 'incidentId'
            : name) +
          '}}',
      );
    const request = {
      method: method.toUpperCase(),
      header: [],
      url,
      description: operation.summary ?? operation.operationId,
    };
    if (operation.security?.length)
      request.auth = {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
      };
    if (operation.requestBody?.content?.['application/json']) {
      request.header.push({ key: 'Content-Type', value: 'application/json' });
      const body = example(
        operation.requestBody.content['application/json'].schema,
      );
      if (method === 'patch' && route.endsWith('/users/me'))
        request.body = {
          mode: 'raw',
          raw: JSON.stringify({ fullName: 'Người dùng SafeOps' }, null, 2),
        };
      else
        request.body = {
          mode: 'raw',
          raw: JSON.stringify(body, null, 2).replace(
            /"\{\{(roleId|incidentTypeId)\}\}"/g,
            '{{$1}}',
          ),
        };
    } else if (operation.requestBody?.content?.['multipart/form-data']) {
      request.body = {
        mode: 'formdata',
        formdata: [
          {
            key: route === '/api/uploads' ? 'files' : 'file',
            type: 'file',
            src: [],
            description: 'Chọn ảnh/tệp trên máy',
          },
        ],
      };
    }
    const item = {
      name: operation.summary ?? method.toUpperCase() + ' ' + route,
      request,
    };
    if (['/api/auth/login', '/api/auth/refresh'].includes(route))
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 200) pm.collectionVariables.set('accessToken', pm.response.json().data.accessToken);",
            ],
          },
        },
      ];
    if (route === '/api/incidents' && method === 'post')
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 201) pm.collectionVariables.set('incidentId', pm.response.json().data.incident.id);",
            ],
          },
        },
      ];
    if (route === '/api/roles' && method === 'get')
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 200) { const role=pm.response.json().data.find(r=>r.code==='SECURITY'); if(role) pm.collectionVariables.set('roleId',role.id); }",
            ],
          },
        },
      ];
    if (route === '/api/incident-types' && method === 'get')
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 200) { const type=pm.response.json().data.items.find(t=>t.code!=='OTHER'); if(type) pm.collectionVariables.set('incidentTypeId',type.id); }",
            ],
          },
        },
      ];
    if (route === '/api/uploads' && method === 'post')
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 201) { const file=pm.response.json().data.files[0]; pm.collectionVariables.set('fileId',file.id); pm.collectionVariables.set('filename',file.filename); }",
            ],
          },
        },
      ];
    if (route === '/api/incidents/{id}/assignments' && method === 'post')
      item.event = [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "if (pm.response.code === 201) pm.collectionVariables.set('assignmentId',pm.response.json().data.id);",
            ],
          },
        },
      ];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
}
const collection = {
  info: {
    name: 'SafeOps integrated API',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description:
      'Import collection, set email/password, login to save accessToken. The cookie jar stores refresh cookie. baseUrl has no /api suffix. GET roles and incident-types populate actual numeric IDs. Use different accounts for Reporter, Admin/Operator, and Security workflow steps.',
  },
  variable: Object.entries({
    baseUrl: 'http://localhost:3000',
    email: 'reporter@example.com',
    password: '',
    newPassword: '',
    accessToken: '',
    userId: '',
    incidentId: '',
    assignmentId: '',
    securityUserId: '',
    attachmentId: '',
    notificationId: '',
    incidentTypeId: '',
    roleId: '',
    fileId: '',
    filename: '',
  }).map(([key, value]) => ({ key, value, type: 'string' })),
  item: [...groups].map(([name, item]) => ({ name, item })),
};
await fs.writeFile(
  'docs/SafeOps.postman_collection.json',
  JSON.stringify(collection, null, 2) + '\n',
);
console.log(
  `Exported ${[...groups.values()].reduce((n, items) => n + items.length, 0)} Postman requests.`,
);
