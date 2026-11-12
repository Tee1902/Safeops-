# Kiến trúc SafeOps

Modular Monolith NestJS/TypeScript, PostgreSQL 17 cho dev hiện có, PostgreSQL 16 cho deployment mới, TypeORM migration. Auth, Users, Incidents, Assignments, IncidentLogs, Notifications, Dashboard, Gateway là 8 module nghiệp vụ. UploadsModule tách riêng việc nhận và đọc ảnh; IncidentTypesModule và AttachmentsModule giữ API nghiệp vụ đầy đủ của dự án hiện tại. AuthSession, UserAuditLog, UploadedFile là ba bảng hỗ trợ mới, ngoài 8 bảng nghiệp vụ và RevokedToken hiện có. Xem [INTEGRATION](INTEGRATION.md) cho trạng thái triển khai và [README](../README.md) cho lệnh chạy.

```mermaid
flowchart LR
    Browser[Frontend/browser] -->|HTTPS| Caddy[Caddy / TLS]
    Caddy -->|/api/*| API[NestJS API]
    Caddy -.->|tích hợp khi FE bàn giao| Next[Next.js standalone]
    API --> Guards[Throttler / JWT / Roles]
    Guards --> Services[Controller / DTO / Service]
    Services --> DB[(PostgreSQL 16)]
    Services --> Images[(Private uploads volume)]
    Migrate[Migration job] --> DB
```

Caddy là cổng duy nhất của production. Backend/PostgreSQL không publish port ra host. Backend tin đúng một proxy và chỉ nhận traffic qua mạng container. Dev publish PostgreSQL, pgAdmin, Mailhog trên loopback. API chạy user `node`, filesystem read-only ngoại trừ upload volume và `/tmp`; không copy `.env` vào image. Log truy vấn tắt mặc định.

Guard chạy trước interceptor và pipe theo vòng đời NestJS. Thứ tự bảo vệ: Throttler → JwtAuthGuard → RolesGuard → validation tham số → controller/service → serialize/response wrapper. Filter trả lỗi thống nhất. `@Public()` bỏ JWT/RBAC nhưng vẫn giữ throttling; route được bảo vệ mà thiếu `@Roles` bị từ chối. `ClassSerializerInterceptor`, `User.passwordHash select:false` và presenter whitelist bảo vệ dữ liệu trả ra.

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant API as Auth API
    participant DB as PostgreSQL
    FE->>API: POST /api/auth/login
    API->>DB: Đọc hash, kiểm tra mật khẩu, khóa user
    API->>DB: Tạo auth_sessions với SHA-256 refresh token
    API-->>FE: Access JWT + HttpOnly refresh cookie
    FE->>API: Bearer JWT /api/users/me
    API->>DB: Kiểm tra session và user/role mới nhất
    API-->>FE: Hồ sơ whitelist
    FE->>API: POST /api/auth/refresh (cookie)
    API->>DB: Khóa session, kiểm tra hash/hạn, xoay secret
    API-->>FE: Access JWT mới + cookie mới
    FE->>API: POST /api/auth/logout (Bearer)
    API->>DB: revoked_at = now()
    API-->>FE: Xóa cookie
```

## ERD

8 bảng nghiệp vụ hiện hữu và 4 bảng kỹ thuật: `revoked_tokens` (di sản logout cũ), `auth_sessions`, `user_audit_logs`, `uploaded_files`. Session mới được thu hồi qua `auth_sessions`, không cần lưu mọi JWT vào revoked_tokens.

```mermaid
erDiagram
    roles ||--o{ users : role_id
    users ||--o{ incidents : reporter_id
    users o|--o{ incidents : verified_by
    incident_types ||--o{ incidents : incident_type_id
    incidents ||--o{ incident_attachments : incident_id
    users ||--o{ incident_attachments : uploaded_by
    incidents ||--o{ assignments : incident_id
    users ||--o{ assignments : security_user_id
    users ||--o{ assignments : assigned_by
    incidents ||--o{ incident_logs : incident_id
    users o|--o{ incident_logs : actor_id
    users ||--o{ notifications : user_id
    incidents o|--o{ notifications : incident_id
    users ||--o{ auth_sessions : user_id
    users ||--o{ revoked_tokens : user_id
    users ||--o{ uploaded_files : owner_id
    users ||--o{ user_audit_logs : actor_id
    users ||--o{ user_audit_logs : target_user_id
    users {
        uuid id PK
        varchar email UK
        text password_hash "select false, bcrypt"
        int role_id FK
        boolean is_active
    }
    auth_sessions {
        uuid id PK
        uuid user_id FK
        varchar refresh_token_hash "SHA-256, select false"
        timestamptz expires_at
        timestamptz revoked_at
    }
    uploaded_files {
        uuid id PK
        uuid owner_id FK
        varchar filename UK
        varchar mime_type
        int size "1..5242880"
    }
    user_audit_logs {
        uuid id PK
        uuid actor_id FK
        uuid target_user_id FK
        varchar action
        jsonb changes
        timestamptz created_at
    }
```

Migration `1794300000000-Be1Foundation` đổi MANAGER → OPERATOR, giữ ID nếu chưa có OPERATOR, chuyển tham chiếu user trước khi xóa role cũ nếu có cả hai. Tạo 4 role nếu thiếu. Chuẩn hóa email, thêm unique index trên `lower(trim(email))`. Nếu dữ liệu cũ có email trùng sau chuẩn hóa, migration dừng và rollback thay vì tự gộp người dùng. Không bật synchronize ở production.

Tạo user nội bộ, thay role/trạng thái và audit chạy cùng transaction; khóa advisory tuần tự hóa thay đổi quản trị, đọc lại quyền của Admin trong transaction. Admin không được tự khóa hoặc tự thay role của mình. Password/email đổi sẽ thu hồi mọi phiên trong cùng transaction. Refresh dùng row lock nên hai request cùng cookie chỉ một request xoay thành công.

Mỗi request được bảo vệ đọc lại session và user/role từ DB; chưa có cache để tránh trì hoãn khóa tài khoản. Throttler hiện dùng bộ nhớ một instance. Khi chạy nhiều replica, thay storage bằng bộ đếm dùng chung và dùng object storage/chung volume cho upload; đây là bước mở rộng, cấu hình production hiện chạy một backend.
