# Kiểm thử, build và chạy SafeOps trên Windows

Đã chạy lại ngày 16/11/2026, Asia/Saigon. Thư mục làm việc: `C:\Users\admin\Downloads\SafeOps (1)\SafeOps\backend`. Dùng PowerShell và `npm.cmd` vì máy đang chặn script `npm.ps1`.

## Kết quả kiểm tra thực tế

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd test` | 135/135 unit test, 14 suite đạt |
| Jest đầy đủ với coverage | 225/225 test, 21 suite đạt; gồm 135 unit test ở trên |
| Backup/Restore | 6/6 test đạt trên database và file tạm |
| Build / typecheck / lint | Đạt |
| Coverage | Statements/lines 98,43%; branches 90,16%; functions 100% |
| `node dist/main.js` với `.env` hiện tại | Khởi động được; `/api/health`, `/api/docs`, `/api/docs-json` trả 200 |
| Xác thực phiên trên DB local cũ | Tái hiện 500 khi kiểm tra session vì thiếu bảng `auth_sessions` |
| Bản build với DB tạm đã đủ migration | 11 kiểm tra HTTP đạt: health, Swagger, register, login, profile, tìm kiếm, map, notification, chặn Dashboard của Reporter, logout, thu hồi phiên |

Các dòng ERROR/WARN về `WorkflowEventsService` và `MailService` trong lúc chạy unit/coverage thuộc ca kiểm thử mô phỏng lỗi publish/SMTP. Các test đó vẫn PASS; không phải ứng dụng đang gửi email thật bị lỗi trong lần kiểm tra này.

Tiến trình khởi động thử đã được dừng; database tạm được xóa sau kiểm tra. Không thay đổi code nghiệp vụ hay chạy migration/seed lên database local đang có dữ liệu trong lần kiểm tra này.

## Lỗi môi trường cần xử lý

`.env` hiện kết nối `safeops_db` tại `localhost:5432`, `DB_SYNCHRONIZE=false`. Database này chỉ có bốn migration cũ. Lệnh `npm.cmd run migration:show` xác nhận bốn migration còn thiếu:

```text
[ ] Be1Foundation1794300000000
[ ] Be3NotificationPagination1794510000000
[ ] Be3IncidentPagination1794510100000
[ ] VietnameseSearch1794820000000
```

`Be1Foundation` tạo bảng phiên đăng nhập, audit và metadata upload, đồng thời đổi MANAGER→OPERATOR và chuẩn hóa email. `VietnameseSearch` tạo hàm tìm kiếm tiếng Việt. Chỉ build hoặc khởi động backend không tự chạy các migration này. Health hiện chỉ kiểm tra kết nối DB bằng `SELECT 1`, nên health=200 không xác nhận schema đã đúng phiên bản.

Node của máy là **24.12.0**, thấp hơn yêu cầu `^24.15.0 || >=26.0.0` trong package.json. Các test/build hiện đạt, nhưng nên dùng Node **24.15+ trong nhánh 24** hoặc **26+** khi chạy dự án. Không đổi ExecutionPolicy chỉ để chạy npm; dùng `npm.cmd`.

Trong sandbox, lệnh dùng `tsx` có thể báo `uv_os_get_passwd returned ENOMEM`; kiểm tra lại ngoài sandbox đã chạy được và hiển thị migration đúng. Có thể dùng TypeORM CLI từ bản build ở bước bên dưới để tránh phụ thuộc tsx.

## Chạy backend

1. Mở Docker Desktop và terminal PowerShell:

```powershell
Set-Location 'C:\Users\admin\Downloads\SafeOps (1)\SafeOps\backend'
node --version
npm.cmd --version
```

2. Giữ `.env` hiện có. Máy mới chưa có file thì copy `.env.example` sang `.env` rồi điền các biến theo mẫu. Không ghi đè cấu hình thật. Chạy PostgreSQL/Mailhog bằng Compose và cài đúng dependencies:

```powershell
docker compose --env-file .env -f ../docker-compose.yml up -d postgres mailhog
npm.cmd ci --ignore-scripts
npm.cmd run build
```

3. Trước khi cập nhật database đang có dữ liệu: dừng mọi backend/worker ghi dữ liệu, tạo và verify backup DB + UPLOAD_DIR theo [BACKUP-RESTORE](BACKUP-RESTORE.md). Chỉ sau khi có backup hợp lệ mới chạy migration. Các lệnh dưới cập nhật database mà `.env` đang chỉ tới:

```powershell
npm.cmd run migration:show
npm.cmd run migration:run
npm.cmd run migration:show
npm.cmd run seed:incident-types
```

Sau khi thành công, cả 8 migration phải có dấu `[X]`. Roles được tạo bởi migration. Chỉ khi cần tài khoản Admin mới và đã cấu hình ADMIN_EMAIL/ADMIN_PASSWORD hợp lệ:

```powershell
npm.cmd run seed:admin
```

Nếu `tsx` không hoạt động, sau build dùng CLI và seed đã biên dịch; không cần chạy cả hai cách:

```powershell
node node_modules/typeorm/cli.js migration:show -d dist/database/data-source.js
npm.cmd run migration:run:prod
node dist/database/seeds/seed-incident-types.js
```

Tên script `migration:run:prod` chỉ có nghĩa dùng file trong `dist`; database đích vẫn lấy từ cấu hình môi trường/`.env`, không tự chuyển sang database production.

4. Chọn cách chạy phù hợp, mỗi lần chỉ chạy một tiến trình trên cổng 3000:

```powershell
# Lập trình: tự biên dịch lại khi sửa file
npm.cmd run start:dev
```

Hoặc chạy bản đã build:

```powershell
npm.cmd run build
npm.cmd run start:prod
```

`build` biên dịch TypeScript/Nest thành `dist/main.js`; `start:prod` thực thi `node dist/main.js`. Khi source thay đổi, cần build lại trước khi chạy bản trong dist. Giữ terminal mở, nhấn Ctrl+C để dừng.

Mở Swagger tại `http://localhost:3000/api/docs`. Kiểm tra kết nối từ terminal khác:

```powershell
Invoke-RestMethod 'http://localhost:3000/api/health'
```

Kết quả mong đợi: `success=true`, `data.status=ok`. API có prefix `/api`; `/` không phải trang giao diện. Repo hiện chưa có frontend. Đăng nhập trên Swagger/Postman và dùng accessToken trong Authorize để thử API có bảo vệ.

## Chạy kiểm thử

Unit test, kiểm tra kiểu và lint không cần DB thật:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
# Chỉ chạy unit test Dashboard:
npm.cmd test -- dashboard.service
```

Để kiểm tra toàn bộ workflow/SQL/migration/realtime, dùng PostgreSQL test riêng ở cổng 55432:

```powershell
docker compose -f docker-compose.test.yml up -d --wait
npm.cmd run test:cov
$env:TEST_POSTGRES_CONTAINER = 'safeops-be3-test-postgres-test-1'
npm.cmd run test:backup
```

`test:cov` tự build và compile test trước khi chạy toàn bộ 21 suite; đã bao gồm HTTP, workflow PostgreSQL, Socket.IO và features. Không cần chạy lại tất cả các lệnh bên dưới nếu bộ đầy đủ đã đạt. Để chạy riêng khi sửa một chức năng:

```powershell
npm.cmd run test:e2e
npm.cmd run test:workflow
npm.cmd run test:realtime
npm.cmd run test:features
```

Test DB mặc định `safeops_test` tại cổng **55432**, tách với DB local **5432**. Không trỏ TEST_DATABASE_URL tới DB nghiệp vụ. Backup test tự tạo hai DB riêng và dọn sau khi chạy. Báo cáo coverage được xuất ở `coverage/lcov.info`, `coverage/coverage-summary.json` và trên terminal.
