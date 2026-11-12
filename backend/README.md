# SafeOps backend — bản tích hợp

Kết quả rà soát mới nhất: [POST_INTEGRATION_REVIEW.md](docs/POST_INTEGRATION_REVIEW.md), 183/183 kiểm thử qua; có mô tả lỗi đã sửa, mức hoàn thiện và phần còn thiếu.

NestJS + TypeORM + PostgreSQL. Đã ghép nền tảng trong `D:\SafeOps (1).zip` với luồng nghiệp vụ của dự án hiện tại. Chi tiết thay đổi và kiểm thử: [INTEGRATION.md](docs/INTEGRATION.md).

API: `http://localhost:3000/api`. Swagger: `/api/docs`. [Hợp đồng API](docs/API-CONTRACT.md), [OpenAPI](docs/openapi.json), [Postman](docs/SafeOps.postman_collection.json).

## Khởi động trên Windows

Dùng Node 24.15 trở lên trong nhánh 24 và Docker Desktop. Tại thư mục `SafeOps`, tạo cấu hình nếu chưa có:

```powershell
Copy-Item backend/.env.example backend/.env
```

Nếu `.env` đã có, giữ cấu hình hiện tại. Điền `JWT_SECRET` riêng ít nhất 32 ký tự, mật khẩu DB, `ADMIN_PASSWORD`, `PGADMIN_DEFAULT_PASSWORD`. `FRONTEND_URL` là origin frontend được phép gọi API; frontend gửi `credentials: 'include'` cho login/refresh/logout.

```powershell
docker compose --env-file backend/.env up -d
Set-Location backend
npm.cmd ci
npm.cmd run migration:run
npm.cmd run seed:roles
npm.cmd run seed:incident-types
npm.cmd run seed:admin
npm.cmd run start:dev
```

PostgreSQL dev giữ phiên bản 17 và volume `postgres_data` của dự án hiện tại. pgAdmin: `http://localhost:5050`; Mailhog: `http://localhost:8025`. Mailhog chỉ là hạ tầng SMTP, chưa có luồng gửi email xác minh.

Lần nâng cấp này thêm migration `Be1Foundation1794300000000` sau 4 migration cũ: đổi `MANAGER` thành `OPERATOR`, chuẩn hóa email và thêm phiên đăng nhập, nhật ký quản trị, metadata ảnh. ID tài khoản/vai trò được giữ khi có thể. Nếu dữ liệu cũ có email trùng sau trim/lowercase hoặc nhiều phân công đang hoạt động cho cùng sự cố, migration dừng và rollback để xử lý dữ liệu trước. JWT cũ cần đăng nhập lại. Sao lưu DB và uploads trước khi nâng cấp dữ liệu thực.

## Các module đã hoạt động

- Auth: đăng ký Reporter, đăng nhập, refresh cookie HttpOnly có rotation, logout cả phiên; JWT access mặc định 15 phút.
- Users/Admin: hồ sơ, đổi mật khẩu, lọc/phân trang người dùng, tạo Security/Operator, đổi role, khóa/mở khóa, audit log và danh mục role.
- Incident types và Incidents: tạo/sửa/lọc/theo dõi/xác minh/từ chối/đóng; scope theo người báo cáo và phân công.
- Assignments: giao việc, tiếp nhận, bắt đầu, hoàn tất, hủy/giao lại; khóa bản ghi và ràng buộc một phân công đang hoạt động/sự cố.
- Uploads: nhiều ảnh JPEG/PNG/WebP, ≤5 MiB/ảnh; gắn `attachmentIds` vào báo cáo trong cùng transaction, kiểm tra chủ sở hữu và chống gắn lại ảnh.
- Attachments: upload bằng chứng trực tiếp ≤10 MiB (thêm PDF), download có xác thực, xóa có rollback tệp.
- Notifications: danh sách/thông báo chưa đọc/đánh dấu đã đọc; Dashboard: đếm theo trạng thái.

```text
PENDING → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED
   └──→ REJECTED        └── hủy phân công → VERIFIED
```

Vai trò chuẩn: `ADMIN`, `OPERATOR`, `SECURITY`, `REPORTER`. Đổi email/mật khẩu/role/trạng thái thu hồi phiên; nhân viên còn phân công đang hoạt động không được hạ quyền/khóa cho tới khi hủy hoặc giao lại. Operator xem danh sách người dùng rút gọn, không có email/điện thoại.

JSON thành công: `{ "success": true, "data": ... }`; lỗi: `{ "success": false, "error": { "code": "...", "message": "..." } }`. Tệp nhị phân không bọc JSON. Các URL bằng chứng mới dùng `/api/attachments/:id/content`.

## Kiểm tra

Tại `SafeOps/backend`:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
```

Test unit và HTTP contract ở trên không dùng DB thật. Kiểm tra nghiệp vụ/concurrency/rollback và coverage dùng PostgreSQL thử riêng. Từ `SafeOps`:

```powershell
docker compose -f docker-compose.test.yml -p safeops-test up -d --wait
Set-Location backend
npm.cmd run test:workflow
npm.cmd run test:cov
npm.cmd run docs:export
Set-Location ..
docker compose -f docker-compose.test.yml -p safeops-test down
```

`TEST_DATABASE_URL` mặc định trỏ tới cổng 55432/database `safeops_test`; nếu đổi URL, tên database phải kết thúc bằng `_test`. Mỗi lần test dùng schema riêng và dọn schema/tệp sau khi chạy. Coverage tổng hợp unit, HTTP và PostgreSQL; CI chạy DB riêng và yêu cầu ≥80% statements/branches/functions/lines.

## Triển khai

Tại backend, sao chép `.env.production.example` sang `.env.production`, điền domain/DNS/secrets và origin HTTPS. Sau khi chuẩn bị dữ liệu/backup:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Compose production dùng DB/volume riêng, chạy migration trước backend, Caddy cấp TLS, backend chạy non-root. Không dùng volume PostgreSQL 17 dev cho image PostgreSQL 16 production. Xem [vận hành](docs/OPERATIONS.md). Có template Dockerfile Next.js trong `deploy`, cần source frontend để sử dụng.

Repository và ZIP đều không có frontend Next.js. Gateway hiện cung cấp helper xác thực để tích hợp; chưa mở Socket.IO, chưa có email/push, map/export/performance analytics hoặc SSO. Đây là các tính năng chưa có đặc tả/source hoàn chỉnh trong hai bản, không được coi là đã hoàn tất bằng việc ghép backend.
