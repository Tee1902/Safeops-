# SafeOps: hiện trạng, cách chạy và lộ trình phát triển

> Tài liệu mô tả phiên bản trước tích hợp. Xem [backend/README.md](backend/README.md) và [báo cáo tích hợp](backend/docs/INTEGRATION.md) cho code/API/schema hiện hành.

> Đây là bản rà soát trước khi triển khai 6 module. Mã nguồn đã được phát triển tiếp; xem [hướng dẫn backend hiện tại](backend/README.md) và [tài liệu API](backend/docs/API.md) để chạy và dùng các chức năng mới. Những nhận xét bên dưới về module chưa có/chưa bật là hiện trạng của lần rà soát ban đầu.

Ngày rà soát: 09/11/2026.

Tài liệu dựa trên mã nguồn ứng dụng, cấu hình, migrations, seeds, tests, tài liệu thiết kế và sơ đồ dữ liệu trong thư mục này. `node_modules` là thư viện cài sẵn; `dist` là đầu ra biên dịch; `.git` là dữ liệu quản lý phiên bản. Chúng không được coi là các module nghiệp vụ đã tự xây dựng.

## 1. Kết luận hiện trạng

SafeOps hiện là backend quản lý báo cáo và xử lý sự cố, dùng NestJS, TypeScript, TypeORM và PostgreSQL. Chưa có frontend trong thư mục bàn giao.

| Thành phần | Đã có | Phần còn thiếu |
| --- | --- | --- |
| Hạ tầng | Docker Compose cho PostgreSQL 17, volume và healthcheck | Chưa có Dockerfile/container cho backend |
| Cơ sở dữ liệu | 9 entities, 2 migrations, quan hệ và khóa ngoại | Một số CHECK, giới hạn độ dài, DEFAULT trong thiết kế chưa có trong migration |
| Dữ liệu khởi tạo | Seed 4 vai trò, 7 loại sự cố và tài khoản ADMIN | Chưa có seed riêng cho MANAGER/SECURITY |
| Auth | Đăng ký REPORTER, đăng nhập JWT 1 giờ, hồ sơ, đăng xuất thu hồi token | Chưa có refresh token, quên mật khẩu, gửi email xác minh |
| Phân quyền | JwtAuthGuard, RolesGuard, decorator Roles | Chưa có API quản trị thay đổi vai trò |
| Users | Xem/sửa hồ sơ, đổi mật khẩu; ADMIN xem danh sách/chi tiết, sửa, khóa/mở khóa | Chưa có luồng tạo nhân viên quản lý/an ninh qua API |
| Incidents | DTO, controller tạo sự cố, service tạo sự cố và log trong transaction | Chưa import IncidentsModule vào AppModule; chưa có danh sách/chi tiết/sửa/xác minh |
| Incident types | Entity và seed | Chưa có API danh mục |
| Assignments | Entity và migration | Chưa có module/service/controller xử lý phân công |
| Attachments | Entity và migration | Chưa có upload/download/xóa tệp |
| Incident logs | Entity; tạo log CREATED trong service tạo sự cố | Chưa có API lịch sử và log các bước tiếp theo |
| Notifications | Entity và migration | Chưa có tạo/gửi/xem/đánh dấu đã đọc |
| Kiểm tra | Build, Vitest, oxlint | Test hiện chỉ kiểm tra Hello World, chưa kiểm tra nghiệp vụ |

Các bảng: `roles`, `users`, `incident_types`, `incidents`, `incident_attachments`, `assignments`, `incident_logs`, `notifications`, `revoked_tokens`. Có entity/migration không đồng nghĩa bảng đã được tạo trong database đang chạy; phải kiểm tra migration thực tế.

Các vai trò seed: ADMIN, MANAGER, REPORTER, SECURITY.

Các loại sự cố seed: FIRE, ACCIDENT, MEDICAL, SECURITY, ENVIRONMENT, INFRASTRUCTURE, OTHER. Danh sách này khác ví dụ trong tài liệu thiết kế cũ; không giả định có THEFT.

## 2. Các API đã nối vào ứng dụng

Base URL mặc định: `http://localhost:3000`. Hiện không có prefix `/api` và chưa có Swagger.

| Phương thức | Đường dẫn | Quyền / công dụng |
| --- | --- | --- |
| GET | / | Công khai, trả Hello World! |
| POST | /auth/register | Công khai; luôn tạo REPORTER |
| POST | /auth/login | Công khai; trả accessToken |
| GET | /auth/profile | JWT; trả id, email, role |
| GET | /auth/admin-test | ADMIN; kiểm tra quyền |
| POST | /auth/logout | JWT; thu hồi token hiện tại |
| GET | /users/me | JWT; hồ sơ đầy đủ, không trả passwordHash |
| PATCH | /users/me | JWT; sửa fullName/email/phone/avatarUrl |
| PATCH | /users/me/password | JWT; currentPassword/newPassword/confirmPassword |
| GET | /users?page=1&limit=10 | ADMIN; danh sách phân trang, limit tối đa 100 |
| GET | /users/:id | ADMIN; chi tiết UUID |
| PATCH | /users/:id | ADMIN; sửa hồ sơ, chưa hỗ trợ sửa role |
| PATCH | /users/:id/status | ADMIN; body {"isActive": false} hoặc true |

ADMIN không thể tự khóa tài khoản của chính mình. JWT strategy kiểm tra lại tài khoản hoạt động và vai trò trong database ở mỗi request. Đổi mật khẩu hiện chưa tự thu hồi mọi token đang tồn tại. Đăng xuất chỉ thu hồi token gửi kèm request.

`POST /incidents` đã có source nhưng chưa được đăng ký ở cây module. `UpdateIncidentDto` đã tồn tại nhưng chưa được dùng bởi endpoint cập nhật.

## 3. Kết quả kiểm tra trong phiên rà soát

- `npm.cmd run build`: thành công.
- `npm.cmd test`: 1 test thành công, chỉ kiểm tra Hello World.
- `npm.cmd run lint`: 4 lỗi `no-floating-promises` tại `bootstrap()` và 3 lời gọi seed; 3 cảnh báo (import Matches không dùng và 2 chuyển đổi unknown sang string).
- `npm.cmd run test:e2e`: thất bại vì không kết nối được database trong phiên kiểm tra, hook timeout; cleanup còn gọi `app.close()` khi app chưa khởi tạo.
- Docker CLI/Compose đã cài, nhưng phiên kiểm tra không truy cập được Docker daemon; chưa xác nhận được container/database thực tế.
- Node đang có là v24.12.0, npm 11.6.2. Build được với bộ thư viện hiện có. Một số dependency trong lockfile yêu cầu `^24.15.0` ở nhánh Node 24; khi cài mới nên dùng Node 24 từ 24.15.0 trở lên trong nhánh 24 để khớp yêu cầu đó.
- PowerShell chặn `npm.ps1`. Dùng `npm.cmd` và `npx.cmd` để chạy các lệnh bên dưới.

Không có xác nhận rằng các luồng nghiệp vụ đã chạy xuyên suốt với database. Chưa thay đổi mã nguồn ứng dụng trong lần rà soát này.

## 4. Chạy dự án trên máy này

### Bước 1: mở Docker Desktop và khởi động database

Đợi Docker Desktop sẵn sàng, mở PowerShell:

```powershell
Set-Location 'C:\Users\admin\Downloads\SafeOps (1)\SafeOps'
docker compose up -d postgres
docker compose ps
docker compose logs --tail 50 postgres
```

Compose hiện chỉ khởi động PostgreSQL, không tự chạy backend. Database được ánh xạ ra localhost:5432. Chờ trạng thái healthy trước khi chạy migration.

Nếu Docker báo không tìm thấy engine/pipe, kiểm tra Docker Desktop đã chạy và CLI đang dùng đúng Docker context. Nếu 5432 đã được database khác sử dụng, chọn cổng host khác trong Compose và sửa DB_PORT tương ứng trong `.env`.

### Bước 2: vào backend, cài thư viện nếu cần

```powershell
Set-Location 'C:\Users\admin\Downloads\SafeOps (1)\SafeOps\backend'
node --version
npm.cmd --version
```

Máy này đã có `node_modules`; có thể thử dùng ngay. Khi cài mới hoặc cần cài lại đúng lockfile:

```powershell
npm.cmd ci
```

### Bước 3: kiểm tra backend/.env

File `.env` đã tồn tại. Giữ thông tin hiện có và đối chiếu với `docker-compose.yml`:

| Biến | Yêu cầu |
| --- | --- |
| DB_HOST | localhost khi backend chạy trực tiếp trên Windows |
| DB_PORT | 5432 hoặc cổng host đã chọn |
| DB_USERNAME | Trùng POSTGRES_USER trong Compose |
| DB_PASSWORD | Trùng POSTGRES_PASSWORD trong Compose |
| DB_DATABASE | Trùng POSTGRES_DB trong Compose |
| DB_SYNCHRONIZE | false; dùng migration quản lý cấu trúc |
| JWT_SECRET | Chuỗi riêng, tối thiểu 32 ký tự |
| ADMIN_EMAIL | Email cho seed ADMIN; hiện là admin@safeops.local |
| ADMIN_PASSWORD | Mật khẩu seed, tối thiểu 12 ký tự; xem trực tiếp file cục bộ |
| ADMIN_FULL_NAME | Tên ADMIN; có giá trị mặc định nếu bỏ trống |
| FRONTEND_URL | Hiện là http://localhost:5173; đây là cấu hình CORS, chưa có frontend đi kèm |
| PORT | Không bắt buộc; mặc định 3000 |

Ứng dụng cần các biến DB_* và JWT_SECRET để khởi động. Mật khẩu ADMIN được đọc lúc seed; thay `.env` rồi chạy lại seed không đổi mật khẩu tài khoản đã tồn tại.

### Bước 4: tạo bảng và dữ liệu khởi tạo

Chạy trong `backend`:

```powershell
npm.cmd run migration:show
npm.cmd run migration:run
npm.cmd run migration:show
npm.cmd run seed:roles
npm.cmd run seed:incident-types
npm.cmd run seed:admin
```

Có 2 migration: InitialSchema và CreateRevokedTokens. Seed roles phải có trước seed admin; seed roles cũng cần trước khi đăng ký REPORTER. Seed loại sự cố cần trước khi tạo sự cố.

Nếu database đã có bảng từ lần bật synchronize trước nhưng migration chưa được ghi nhận, lệnh có thể báo bảng đã tồn tại. Cần đối chiếu schema và lịch sử migration trước khi xử lý. Không xóa database/volume đang có dữ liệu để bỏ qua lỗi.

### Bước 5: chạy backend

```powershell
npm.cmd run start:dev
```

Giữ terminal này mở. Mở trình duyệt `http://localhost:3000/`; phản hồi dự kiến là `Hello World!`.

Ở terminal khác có thể kiểm tra:

```powershell
Invoke-RestMethod 'http://localhost:3000/'
```

Chạy bản biên dịch ở môi trường local:

```powershell
npm.cmd run build
node --env-file=.env dist/main.js
```

`npm.cmd run start:prod` hiện là `node dist/main`, nên cần build trước và cấu hình biến môi trường. Lệnh trên chỉ rõ file `.js` đầu ra.

### Bước 6: thử API bằng Postman

1. `POST http://localhost:3000/auth/register`, Body → raw → JSON:

```json
{
  "fullName": "Nguoi Bao Cao Demo",
  "email": "reporter@example.com",
  "password": "DemoReporter123!"
}
```

2. `POST http://localhost:3000/auth/login`:

```json
{
  "email": "reporter@example.com",
  "password": "DemoReporter123!"
}
```

3. Copy `accessToken`; ở Authorization chọn Bearer Token và dán token. Gọi `GET /users/me` để xem hồ sơ. Header thực tế là `Authorization: Bearer <accessToken>`.
4. Đăng nhập bằng ADMIN_EMAIL và ADMIN_PASSWORD trong `.env`, dùng token ADMIN gọi `GET /users?page=1&limit=10`.
5. Token REPORTER gọi `/users` phải bị từ chối quyền. Gọi `POST /auth/logout`, sau đó dùng token đó gọi `/users/me` phải bị từ chối xác thực.

Các body không được gửi trường ngoài DTO; ứng dụng bật `forbidNonWhitelisted`. Đăng ký không nhận `role`, `roleId`, `isActive`.

## 5. Bật phần tạo sự cố đã viết

Đây là thay đổi cần thực hiện tiếp; chưa áp dụng trong lần rà soát.

Trong `backend/src/app.module.ts`, thêm import:

```typescript
import { IncidentsModule } from './incidents/incidents.module.js';
```

Trong mảng `imports` đang có, thêm `IncidentsModule` sau `UsersModule`. Giữ nguyên các cấu hình hiện tại. Sau đó build lại hoặc chờ watch khởi động lại.

Để lấy đúng ID loại sự cố, từ thư mục SafeOps:

```powershell
docker compose exec postgres psql -U safeops_user -d safeops_db -c "SELECT id, code, name FROM incident_types ORDER BY id;"
```

Sau khi bật module và seed xong, dùng JWT gửi `POST /incidents`:

```json
{
  "title": "Phat hien khoi tai nha A",
  "description": "Co khoi o tang tret",
  "incidentTypeId": 1,
  "latitude": 10.7769,
  "longitude": 106.7009,
  "address": "Nha A",
  "severity": "HIGH"
}
```

Thay ID 1 bằng ID thực tế. Severity bắt buộc thuộc LOW/MEDIUM/HIGH/CRITICAL. Nếu loại OTHER thì description phải có nội dung. Latitude trong [-90, 90], longitude trong [-180, 180], tối đa 7 chữ số thập phân.

Kết quả dự kiến: trả incident có status PENDING; database đồng thời có một incident_logs với action CREATED. Hai thao tác nằm trong cùng transaction. Hiện controller chỉ kiểm tra JWT, chưa giới hạn vai trò tạo sự cố.

## 6. Lộ trình module tiếp theo

Các endpoint và quy tắc dưới đây là đề xuất triển khai, chưa tồn tại trong ứng dụng hiện tại.

### Ưu tiên 1: hoàn thiện Incidents và danh mục loại sự cố

- Bật IncidentsModule như phần 5.
- Thêm `GET /incident-types` để frontend lấy danh mục đang hoạt động; quản trị danh mục có thể làm sau.
- Thêm `GET /incidents` có phân trang và lọc status, severity, incidentTypeId, thời gian.
- Thêm `GET /incidents/:id`, `PATCH /incidents/:id` và `GET /incidents/:id/logs`.
- REPORTER chỉ xem/sửa dữ liệu thuộc phạm vi được phép; đề xuất chỉ sửa sự cố của mình khi PENDING. MANAGER/ADMIN xem danh sách phục vụ quản lý. SECURITY xem sự cố được giao theo quy tắc nhóm chốt.
- Khi join User, chọn rõ các trường an toàn và không trả passwordHash. Validate/trim dữ liệu trước khi lưu.

Hoàn thành khi: tạo được sự cố, đọc lại được, lọc/phân trang đúng, người ngoài phạm vi bị từ chối, log phản ánh cập nhật.

### Ưu tiên 2: xác minh / từ chối / đóng sự cố

- Thêm `PATCH /incidents/:id/verify` và `PATCH /incidents/:id/reject`, quyền MANAGER/ADMIN.
- Chỉ cho phép PENDING → VERIFIED hoặc PENDING → REJECTED. Reject phải có lý do. Ghi người xác minh, thời gian và log trong cùng transaction.
- Bổ sung đóng sự cố sau khi đã giải quyết theo quy tắc nhóm chốt; không cho client gửi status tùy ý qua DTO sửa thông tin.
- Kiểm soát cập nhật đồng thời bằng điều kiện status hoặc khóa bản ghi để hai người không cùng duyệt một sự cố theo hai hướng.

Hoàn thành khi: duyệt/từ chối đúng quyền, không duyệt lại trạng thái không hợp lệ, lưu được lịch sử và lý do.

### Ưu tiên 3: quản trị vai trò / tài khoản nhân viên

- Thêm luồng ADMIN tạo tài khoản MANAGER/SECURITY hoặc API đổi vai trò được giới hạn rõ.
- Vai trò phải tồn tại; giữ nguyên đăng ký công khai chỉ tạo REPORTER.
- Đảm bảo không làm mất khả năng quản trị hệ thống khi đổi vai trò/khóa tài khoản.

Hoàn thành khi: có ADMIN, MANAGER, REPORTER, SECURITY để kiểm tra đủ luồng mà không phải sửa tay database thường xuyên.

### Ưu tiên 4: Assignments — phân công và xử lý

- Tạo `assignments.module.ts`, `assignments.controller.ts`, `assignments.service.ts` và DTO.
- Đề xuất `POST /incidents/:id/assignments` cho MANAGER/ADMIN; chỉ giao sự cố VERIFIED cho người có role SECURITY đang hoạt động.
- Thêm `GET /assignments/me` cho nhân viên xem việc của mình.
- Thêm `PATCH /assignments/:id/accept`, `/start`, `/complete`; chỉ người được giao được thực hiện.
- Chuyển trạng thái phân công ASSIGNED → ACCEPTED → IN_PROGRESS → COMPLETED. Đồng bộ trạng thái sự cố và timestamp tương ứng trong transaction; ghi incident_logs.
- Chốt trước: một sự cố có một hay nhiều người nhận đồng thời. Nếu nhiều người, phải quy định khi nào toàn bộ sự cố được coi là RESOLVED; không mặc định một người hoàn tất là cả sự cố hoàn tất.
- Bổ sung hủy/đổi phân công với trạng thái CANCELLED khi đã chốt quy tắc.

Hoàn thành khi: MANAGER giao được việc, SECURITY đúng người tiếp nhận/bắt đầu/hoàn tất, trạng thái và lịch sử nhất quán.

### Ưu tiên 5: Attachments — bằng chứng sự cố

- Tạo module upload và lưu metadata vào incident_attachments.
- Đề xuất `POST /incidents/:id/attachments`, `GET /incidents/:id/attachments`, `DELETE /attachments/:id`.
- Chốt nơi lưu file: local hoặc dịch vụ lưu trữ nhóm chọn. Kiểm tra loại file, dung lượng và quyền truy cập sự cố; không tin tên file do client gửi.
- Dùng tên lưu trữ riêng; xử lý dọn file nếu lưu database thất bại và dọn metadata/file khi xóa.

Hoàn thành khi: tải lên, truy cập và xóa đúng quyền; file/metadata không bị lệch khi một bước thất bại.

### Ưu tiên 6: Notifications — thông báo

- Tạo NotificationsModule/Service/Controller.
- Đề xuất `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
- Chỉ cho người nhận xem/đánh dấu thông báo của mình. Khi tạo, gán rõ isRead=false vì schema hiện chưa có DEFAULT cho cột này.
- Tạo thông báo khi sự cố được duyệt/từ chối, phân công mới, hoàn tất xử lý. Trước mắt dùng REST; realtime bổ sung sau khi luồng lưu dữ liệu ổn định.
- Nếu gửi ra dịch vụ ngoài, xử lý sau commit và có cơ chế thử lại để tránh báo thành công khi transaction bị rollback.

Hoàn thành khi: người đúng nhận được đúng sự kiện và số chưa đọc/đánh dấu đã đọc chính xác.

### Ưu tiên 7: frontend, thống kê và hoàn thiện bàn giao

- Frontend: đăng ký/đăng nhập; tạo/xem sự cố cho REPORTER; duyệt/phân công cho MANAGER; danh sách việc cho SECURITY; quản trị tài khoản cho ADMIN.
- Thống kê: tổng theo trạng thái/loại/mức độ, thời gian xử lý; bản đồ dùng latitude/longitude đã có.
- Viết test nghiệp vụ và phân quyền trước khi nối toàn bộ giao diện. Hiện test mẫu không chứng minh auth/users/incidents hoạt động đúng.
- Thêm `.env.example` không chứa thông tin đăng nhập thực, tài liệu API, quy trình migration và cấu hình triển khai backend.

## 7. Mẫu quy trình triển khai một module

1. Chốt endpoint, DTO, vai trò và chuyển trạng thái hợp lệ.
2. Viết service với kiểm tra quyền sở hữu và transaction nếu cập nhật nhiều bảng.
3. Viết controller dùng JwtAuthGuard; thêm RolesGuard và Roles khi cần giới hạn vai trò.
4. Khai báo repositories bằng TypeOrmModule.forFeature và import module vào AppModule.
5. Nếu đổi entity/schema, tạo migration mới; không sửa migration cũ đã được áp dụng trên database chung.
6. Kiểm tra ca thành công, sai dữ liệu, sai quyền, sai chủ sở hữu, sai trạng thái và rollback.
7. Chạy build/lint/tests, cập nhật tài liệu API, rồi tích hợp frontend.

Ví dụ khi cần migration mới, chạy trong backend:

```powershell
npm.cmd run migration:generate -- src/database/migrations/TenThayDoi
```

Đọc SQL sinh ra trước khi áp dụng. Chỉ chạy migration khi đã kiểm tra đúng database đích.

## 8. Những điểm nên chỉnh trước khi phát triển xa hơn

- Sửa 4 lỗi lint bằng cách xử lý rõ Promise của bootstrap và các seed; dọn import không dùng và validation type.
- Tách database test; cấu hình timeout phù hợp và cleanup chỉ khi app đã khởi tạo. Test e2e hiện không đi qua main.ts nên muốn kiểm tra validation/CORS/Helmet cần setup tương ứng trong test.
- Tài liệu thiết kế nêu nhiều ràng buộc CHECK, DEFAULT và độ dài nhưng entity/migration chưa phản ánh đầy đủ. Chốt schema thực tế rồi bổ sung migration mới.
- README và AGENTS có mô tả Observe, nhưng AppModule hiện không có ObserveModule. Có dependency không chứng minh đã bật quan sát hệ thống.
- Không tái tạo IncidentsModule bằng scaffold vì phần này đã có logic; phát triển tiếp trên mã hiện hữu.

Luồng mục tiêu: REPORTER tạo PENDING → MANAGER xác minh VERIFIED (hoặc REJECTED) → phân công ASSIGNED → SECURITY xử lý IN_PROGRESS → RESOLVED → đóng CLOSED. ACCEPTED là trạng thái của phân công, không nằm trong danh sách trạng thái sự cố của tài liệu hiện tại.
