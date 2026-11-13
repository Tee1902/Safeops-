import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type SchemaObject,
} from '@nestjs/swagger';

const string = { type: 'string' } as const;
const integer = { type: 'integer' } as const;
const user: SchemaObject = {
  type: 'object',
  properties: {
    id: { ...string, format: 'uuid' },
    fullName: string,
    email: { ...string, format: 'email' },
    phone: { ...string, nullable: true },
    avatarUrl: { ...string, nullable: true },
    roleId: integer,
    role: { ...string, enum: ['ADMIN', 'OPERATOR', 'SECURITY', 'REPORTER'] },
    isActive: { type: 'boolean' },
    emailVerified: { type: 'boolean' },
    lastLoginAt: { ...string, format: 'date-time', nullable: true },
    createdAt: { ...string, format: 'date-time' },
    updatedAt: { ...string, format: 'date-time' },
  },
};
const pagination = {
  total: integer,
  page: integer,
  limit: integer,
  totalPages: integer,
};
const tokenResponse: SchemaObject = {
  type: 'object',
  required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
  properties: {
    message: string,
    accessToken: string,
    tokenType: { ...string, enum: ['Bearer'] },
    expiresIn: { ...integer, example: 900 },
    user,
  },
};
const message: SchemaObject = {
  type: 'object',
  properties: { message: string },
};
const userMessage: SchemaObject = {
  type: 'object',
  properties: { message: string, user },
};
const results: Record<string, SchemaObject> = {
  'GET /api/health': {
    type: 'object',
    properties: { status: { ...string, enum: ['ok'] } },
  },
  'POST /api/auth/register': userMessage,
  'POST /api/auth/login': tokenResponse,
  'POST /api/auth/refresh': tokenResponse,
  'POST /api/auth/logout': message,
  'GET /api/auth/profile': {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: { ...string, format: 'uuid' },
          email: string,
          role: string,
          sessionId: { ...string, format: 'uuid' },
        },
      },
    },
  },
  'GET /api/users/me': user,
  'PATCH /api/users/me': user,
  'PATCH /api/users/me/password': message,
  'GET /api/users': {
    type: 'object',
    properties: {
      ...pagination,
      users: {
        type: 'array',
        items: user,
        description:
          'Operator chỉ nhận id, fullName, role, isActive, avatarUrl.',
      },
    },
  },
  'POST /api/users': userMessage,
  'GET /api/users/{id}': user,
  'PATCH /api/users/{id}': user,
  'PATCH /api/users/{id}/role': userMessage,
  'PATCH /api/users/{id}/status': userMessage,
  'GET /api/users/{id}/audit-logs': {
    type: 'object',
    properties: {
      ...pagination,
      logs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: string,
            actorId: string,
            targetUserId: string,
            action: string,
            changes: { type: 'object', additionalProperties: true },
            createdAt: { ...string, format: 'date-time' },
          },
        },
      },
    },
  },
  'GET /api/roles': {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: integer,
        code: string,
        name: string,
        description: { ...string, nullable: true },
      },
    },
  },
  'POST /api/uploads': {
    type: 'object',
    properties: {
      urls: { type: 'array', items: string },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: string,
            url: string,
            filename: string,
            mimeType: string,
            size: integer,
          },
        },
      },
    },
  },
  'POST /api/incidents': {
    type: 'object',
    properties: {
      message: string,
      incident: {
        type: 'object',
        properties: {
          id: { ...string, format: 'uuid' },
          reporterId: { ...string, format: 'uuid' },
          incidentTypeId: integer,
          title: string,
          description: { ...string, nullable: true },
          latitude: string,
          longitude: string,
          address: { ...string, nullable: true },
          severity: { ...string, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          status: { ...string, enum: ['PENDING'] },
          verifiedBy: { ...string, nullable: true },
          rejectionReason: { ...string, nullable: true },
          verifiedAt: { ...string, nullable: true },
          resolvedAt: { ...string, nullable: true },
          createdAt: { ...string, format: 'date-time' },
          updatedAt: { ...string, format: 'date-time' },
        },
      },
    },
  },
  'GET /api/dashboard/summary': {
    type: 'object',
    properties: {
      total: integer,
      byStatus: { type: 'object', additionalProperties: integer },
    },
  },
};

const incident = results['POST /api/incidents'].properties!
  .incident as SchemaObject;
incident.properties!.status = {
  ...string,
  enum: [
    'PENDING',
    'VERIFIED',
    'REJECTED',
    'ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
  ],
};
const pageOf = (item: SchemaObject): SchemaObject => ({
  type: 'object',
  properties: { ...pagination, items: { type: 'array', items: item } },
});
const assignment: SchemaObject = {
  type: 'object',
  properties: {
    id: { ...string, format: 'uuid' },
    incidentId: { ...string, format: 'uuid' },
    securityUserId: { ...string, format: 'uuid' },
    assignedBy: { ...string, format: 'uuid' },
    status: {
      ...string,
      enum: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    },
    note: { ...string, nullable: true },
    assignedAt: { ...string, format: 'date-time' },
    acceptedAt: { ...string, format: 'date-time', nullable: true },
    startedAt: { ...string, format: 'date-time', nullable: true },
    completedAt: { ...string, format: 'date-time', nullable: true },
    incident,
  },
};
const attachment: SchemaObject = {
  type: 'object',
  properties: {
    id: string,
    incidentId: string,
    uploadedBy: string,
    fileName: string,
    fileUrl: { ...string, example: '/api/attachments/<uuid>/content' },
    fileType: string,
    fileSize: string,
    createdAt: { ...string, format: 'date-time' },
  },
};
const incidentType: SchemaObject = {
  type: 'object',
  properties: {
    id: integer,
    code: string,
    name: string,
    description: { ...string, nullable: true },
    icon: { ...string, nullable: true },
    isActive: { type: 'boolean' },
  },
};
const log: SchemaObject = {
  type: 'object',
  properties: {
    id: string,
    incidentId: string,
    actorId: string,
    action: string,
    oldStatus: { ...string, nullable: true },
    newStatus: { ...string, nullable: true },
    note: { ...string, nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    createdAt: { ...string, format: 'date-time' },
  },
};
const notification: SchemaObject = {
  type: 'object',
  properties: {
    id: string,
    userId: string,
    incidentId: string,
    type: string,
    title: string,
    message: string,
    isRead: { type: 'boolean' },
    readAt: { ...string, format: 'date-time', nullable: true },
    createdAt: { ...string, format: 'date-time' },
  },
};
Object.assign(results, {
  'GET /api/incidents': pageOf(incident),
  'GET /api/incidents/{id}': incident,
  'PATCH /api/incidents/{id}': incident,
  'PATCH /api/incidents/{id}/verify': incident,
  'PATCH /api/incidents/{id}/reject': incident,
  'PATCH /api/incidents/{id}/close': incident,
  'GET /api/incidents/{id}/logs': pageOf(log),
  'POST /api/incidents/{id}/assignments': assignment,
  'GET /api/incidents/{id}/assignments': pageOf(assignment),
  'GET /api/assignments/me': pageOf(assignment),
  'GET /api/assignments/security-users': pageOf({
    type: 'object',
    properties: { id: string, fullName: string },
  }),
  ...Object.fromEntries(
    ['accept', 'start', 'complete', 'cancel'].map((action) => [
      `PATCH /api/assignments/{id}/${action}`,
      { type: 'object', properties: { assignment, incident } },
    ]),
  ),
  'GET /api/incident-types': pageOf(incidentType),
  'POST /api/incident-types': incidentType,
  'PATCH /api/incident-types/{id}': incidentType,
  'POST /api/incidents/{id}/attachments': attachment,
  'GET /api/incidents/{id}/attachments': pageOf(attachment),
  'DELETE /api/attachments/{id}': message,
  'GET /api/notifications': {
    ...pageOf(notification),
    properties: { ...pageOf(notification).properties, unreadCount: integer },
  },
  'PATCH /api/notifications/{id}/read': notification,
  'PATCH /api/notifications/read-all': {
    type: 'object',
    properties: { updated: integer },
  },
});

export function createSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SafeOps API')
    .setVersion('1.0.0')
    .setDescription(
      'SafeOps: Auth/RBAC, Users/Admin, Upload, Incidents, Assignments, Attachments, Notifications và Dashboard. JSON dùng success/data hoặc success/error. Refresh token chỉ nằm trong cookie HttpOnly. Socket.IO cùng host, path /socket.io/, auth.token là access JWT; sự kiện incident:created, incident:updated, assignment:created, assignment:updated, notification:created, notification:read, security:location, security:location-cleared. Khi realtime:ready phải đồng bộ lại REST. Chi tiết: backend/docs/WEBSOCKET-CONTRACT.md.',
    )
    .addBearerAuth()
    .addCookieAuth(
      'safeops_refresh',
      { type: 'apiKey', in: 'cookie' },
      'safeops_refresh',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const methods = ['get', 'post', 'patch', 'put', 'delete'] as const;
  for (const [path, item] of Object.entries(document.paths))
    for (const method of methods) {
      const operation = item[method];
      if (!operation) continue;
      const schema = results[`${method.toUpperCase()} ${path}`];
      const status =
        method === 'post' &&
        !['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(
          path,
        )
          ? '201'
          : '200';
      if (schema)
        operation.responses[status] = {
          description: 'Thành công',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'data'],
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: schema,
                },
              },
            },
          },
        };
      if (
        ['/api/uploads/{filename}', '/api/attachments/{id}/content'].includes(
          path,
        ) &&
        method === 'get'
      )
        operation.responses['200'] = {
          description: 'Ảnh nhị phân sau khi kiểm tra quyền',
          content: Object.fromEntries(
            [
              'image/jpeg',
              'image/png',
              'image/webp',
              ...(path.includes('/attachments/') ? ['application/pdf'] : []),
            ].map((mime) => [
              mime,
              { schema: { type: 'string', format: 'binary' } },
            ]),
          ),
        };
      for (const [code, description] of Object.entries({
        400: 'Dữ liệu không hợp lệ',
        401: 'Chưa xác thực/phiên hết hạn',
        403: 'Không đủ quyền',
        404: 'Không tìm thấy',
        409: 'Xung đột',
        413: 'Ảnh quá lớn',
        422: 'Không thể xử lý dữ liệu',
        429: 'Quá nhiều yêu cầu',
        500: 'Lỗi hệ thống',
        503: 'Dịch vụ chưa sẵn sàng',
      })) {
        operation.responses[code] = {
          description,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [false] },
                  error: {
                    type: 'object',
                    properties: {
                      code: string,
                      message: {
                        oneOf: [string, { type: 'array', items: string }],
                      },
                    },
                  },
                  path: string,
                  timestamp: { ...string, format: 'date-time' },
                },
              },
            },
          },
        };
      }
      if (path === '/api/auth/login' || path === '/api/auth/refresh') {
        const success = operation.responses[status];
        if (success && 'description' in success)
          success.headers = {
            'Set-Cookie': {
              description:
                'safeops_refresh=<opaque>; HttpOnly; SameSite=Lax; Path=/api/auth; Secure trong production',
              schema: string,
            },
          };
      }
    }
  return document;
}
export function setupSwagger(app: INestApplication) {
  SwaggerModule.setup('api/docs', app, createSwaggerDocument(app), {
    jsonDocumentUrl: '/api/docs-json',
    swaggerOptions: { persistAuthorization: false },
  });
}
