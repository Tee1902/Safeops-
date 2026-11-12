# SafeOps API

> Tài liệu lịch sử/tham khảo trước bản ghép 11/11/2026. Hợp đồng và lệnh chạy hiện hành nằm trong [README](../README.md), [API-CONTRACT](API-CONTRACT.md) và [INTEGRATION](INTEGRATION.md).

Có thể import [Postman collection](SafeOps.postman_collection.json). Điền collection variable `admin_password`, chọn tệp ở request Upload, và chạy luồng chính. Bỏ qua các request ghi optional; request reject dùng một báo cáo PENDING khác. Token và ID được lưu tự động sau các request tạo/đăng nhập.

Base URL: `http://localhost:3000`. JSON body cho các API thông thường; upload dùng multipart/form-data. Ngoại trừ đăng ký/đăng nhập và GET /, cần header `Authorization: Bearer <accessToken>`.

Các danh sách mới trả `{ items, total, page, limit, totalPages }`, mặc định page=1, limit=10, tối đa limit=100. Riêng danh sách người dùng cũ giữ trường `users` để tương thích. Không truyền trường ngoài DTO. UUID dùng cho sự cố/người dùng/phân công/tệp/thông báo; loại sự cố dùng ID số nguyên.

## Tài khoản và vai trò

| Phương thức | Endpoint          | Quyền        | Body / ghi chú                                       |
| ----------- | ----------------- | ------------ | ---------------------------------------------------- |
| POST        | /auth/register    | Công khai    | fullName, email, password, phone?; luôn tạo REPORTER |
| POST        | /auth/login       | Công khai    | email, password; lấy accessToken                     |
| POST        | /auth/logout      | Đã đăng nhập | Thu hồi token hiện tại                               |
| GET         | /users/me         | Đã đăng nhập | Hồ sơ cá nhân                                        |
| GET         | /users            | ADMIN        | page, limit                                          |
| POST        | /users            | ADMIN        | Tạo MANAGER/SECURITY                                 |
| PATCH       | /users/:id/role   | ADMIN        | `{ "role": "SECURITY" }` hoặc MANAGER                |
| PATCH       | /users/:id/status | ADMIN        | `{ "isActive": false }` hoặc true                    |

Tạo nhân viên:

```json
{
  "fullName": "Nhan vien an ninh",
  "email": "security@example.com",
  "password": "SecurityDemo123!",
  "phone": "0901234567",
  "role": "SECURITY"
}
```

Tương tự để tạo MANAGER. Mật khẩu tối thiểu 8 ký tự và tối đa 72 byte UTF-8 (ký tự tiếng Việt/emoji có thể chiếm nhiều byte). Không nhận ADMIN ở API tạo/gán vai trò; không đổi vai trò ADMIN hoặc nhân viên còn phân công hoạt động. JWT strategy đọc lại vai trò hiện tại trong database, nên token cũ dùng quyền mới ngay request sau.

`PATCH /users/me/password` nhận `currentPassword`, `newPassword`, `confirmPassword`. Đổi mật khẩu thành công sẽ vô hiệu hóa mọi JWT cũ của tài khoản, kể cả token vừa dùng để đổi mật khẩu; hãy đăng nhập lại. Mỗi lần đăng nhập tạo một mã phiên `jti` riêng. Hồ sơ không nhận fullName/email=null hoặc tên chỉ có khoảng trắng; phone/avatarUrl vẫn nhận null để xóa thông tin.

## Danh mục loại sự cố

| Phương thức | Endpoint                             | Quyền        | Nội dung                                             |
| ----------- | ------------------------------------ | ------------ | ---------------------------------------------------- |
| GET         | /incident-types                      | Đã đăng nhập | page, limit; mặc định chỉ loại hoạt động             |
| GET         | /incident-types?includeInactive=true | ADMIN        | Gồm loại vô hiệu hóa                                 |
| POST        | /incident-types                      | ADMIN        | code, name, description?, icon?, isActive?           |
| PATCH       | /incident-types/:id                  | ADMIN        | Sửa các trường trên, vô hiệu hóa bằng isActive=false |

Ví dụ tạo: `{ "code": "FIRE", "name": "Cháy, nổ", "icon": "flame" }`. Code chuẩn hóa chữ hoa, duy nhất, tối đa 50 ký tự. Loại OTHER cần giữ nguyên mã do có quy tắc bắt buộc mô tả. Không xóa cứng loại đã dùng trong lịch sử.

## Sự cố và xác minh

| Phương thức | Endpoint              | Quyền / hành vi                                                         |
| ----------- | --------------------- | ----------------------------------------------------------------------- |
| POST        | /incidents            | Tạo báo cáo cho tài khoản đang đăng nhập; trả `{ message, incident }`   |
| GET         | /incidents            | Danh sách trong phạm vi quyền, lọc và phân trang                        |
| GET         | /incidents/:id        | Chi tiết kèm incidentType                                               |
| PATCH       | /incidents/:id        | Người tạo hoặc MANAGER/ADMIN, chỉ khi PENDING                           |
| GET         | /incidents/:id/logs   | Lịch sử trong phạm vi quyền; page, limit                                |
| PATCH       | /incidents/:id/verify | MANAGER/ADMIN; body `{}`; PENDING → VERIFIED                            |
| PATCH       | /incidents/:id/reject | MANAGER/ADMIN; body `{ "reason": "Báo cáo trùng" }`; PENDING → REJECTED |

Body tạo sự cố:

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

Lấy ID loại thật từ GET /incident-types. Severity là LOW/MEDIUM/HIGH/CRITICAL và bắt buộc. Title tối đa 200 ký tự, description 5000, address 500. Latitude [-90,90], longitude [-180,180], tối đa 7 chữ số thập phân. Description không bắt buộc trừ loại OTHER.

PATCH nhận một hoặc nhiều trường của body tạo; không nhận reporterId/status/verifiedBy. Không nhận null; dùng chuỗi rỗng để bỏ address hoặc description nếu quy tắc loại cho phép. Dữ liệu sau khi lưu có thể trả description/address=null, latitude/longitude là chuỗi do PostgreSQL numeric.

Các query lọc có thể kết hợp:

| Query          | Ví dụ                                                                |
| -------------- | -------------------------------------------------------------------- |
| page, limit    | page=2&limit=10                                                      |
| status         | PENDING, VERIFIED, REJECTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED |
| severity       | HIGH                                                                 |
| incidentTypeId | 1                                                                    |
| reporterId     | UUID; luôn kết hợp với phạm vi quyền, không mở rộng quyền xem        |
| search         | Tìm không phân biệt hoa thường trong title/description/address       |
| from, to       | Thời điểm createdAt theo ISO 8601, gồm hai mốc; from <= to           |

Ví dụ: `/incidents?status=PENDING&severity=HIGH&page=1&limit=10&from=2026-11-01T00:00:00Z&to=2026-11-30T23:59:59.999Z`.

Duyệt/từ chối lưu verifiedBy và verifiedAt, ghi log và gửi thông báo cho người tạo. Hai request cùng duyệt/từ chối một báo cáo: một request thành công, request sau nhận 409.

## Phân công

| Phương thức | Endpoint                    | Quyền / body                                             |
| ----------- | --------------------------- | -------------------------------------------------------- |
| GET         | /assignments/security-users | MANAGER/ADMIN; danh sách SECURITY hoạt động; page, limit |
| POST        | /incidents/:id/assignments  | MANAGER/ADMIN; securityUserId, note?                     |
| GET         | /incidents/:id/assignments  | Người có quyền xem sự cố; lịch sử phân công, page, limit |
| GET         | /assignments/me             | SECURITY; page, limit, status?                           |
| PATCH       | /assignments/:id/accept     | SECURITY được giao; note?                                |
| PATCH       | /assignments/:id/start      | SECURITY được giao; note?                                |
| PATCH       | /assignments/:id/complete   | SECURITY được giao; note?                                |
| PATCH       | /assignments/:id/cancel     | MANAGER/ADMIN; note?                                     |

Tạo phân công:

```json
{
  "securityUserId": "UUID-cua-security",
  "note": "Kiem tra hien truong ngay"
}
```

Sự cố phải VERIFIED. Mỗi sự cố tối đa một phân công có trạng thái ASSIGNED/ACCEPTED/IN_PROGRESS. API tạo trả bản ghi phân công, trong đó id dùng cho các bước tiếp theo. API chuyển bước trả `{ assignment, incident }`.

| Thao tác           | Trạng thái phân công | Trạng thái sự cố | Timestamp                |
| ------------------ | -------------------- | ---------------- | ------------------------ |
| Giao               | ASSIGNED             | ASSIGNED         | assignedAt               |
| Tiếp nhận          | ACCEPTED             | ASSIGNED         | acceptedAt               |
| Bắt đầu            | IN_PROGRESS          | IN_PROGRESS      | startedAt                |
| Hoàn tất           | COMPLETED            | RESOLVED         | completedAt, resolvedAt  |
| Hủy đang hoạt động | CANCELLED            | VERIFIED         | Ghi lịch sử và thông báo |

Không bỏ qua bước, không hoàn tất/hủy lặp lại. Hủy cho phép quản lý giao lại cho người khác. Note tùy chọn, tối đa 2000 ký tự. COMPLETED vẫn giữ quyền đọc lịch sử sự cố cho nhân viên đã xử lý; CANCELLED không cấp quyền đọc qua phân công đó.

## Bằng chứng

| Phương thức | Endpoint                   | Quyền / nội dung                                          |
| ----------- | -------------------------- | --------------------------------------------------------- |
| POST        | /incidents/:id/attachments | Người có quyền xem sự cố; multipart một trường file       |
| GET         | /incidents/:id/attachments | Người có quyền xem sự cố; danh sách metadata, page, limit |
| GET         | /attachments/:id/content   | Người có quyền xem sự cố; tải nhị phân                    |
| DELETE      | /attachments/:id           | Người upload hoặc MANAGER/ADMIN, vẫn cần quyền xem sự cố  |

Postman: chọn Body → form-data → key `file`, đổi kiểu sang File và chọn tệp. Để Postman tự điền Content-Type multipart và boundary. Giới hạn 10 MiB, một tệp mỗi request, JPEG/PNG/WebP/PDF có MIME và chữ ký phù hợp. Upload/xóa bị khóa khi sự cố REJECTED/RESOLVED/CLOSED.

Metadata trả `fileUrl` là đường dẫn API có bảo vệ. Không có public URL hay đường dẫn ổ đĩa. Khi tải bằng trình duyệt/frontend, gửi JWT (ví dụ fetch blob), vì truy cập URL trực tiếp qua thanh địa chỉ không tự gửi Bearer token.

## Thông báo

| Phương thức | Endpoint                | Hành vi                                               |
| ----------- | ----------------------- | ----------------------------------------------------- |
| GET         | /notifications          | Chỉ thông báo của bạn; page, limit, isRead=true/false |
| PATCH       | /notifications/:id/read | Đánh dấu đã đọc; gọi lại giữ nguyên readAt            |
| PATCH       | /notifications/read-all | Đánh dấu tất cả thông báo của bạn đã đọc; trả updated |

GET trả thêm unreadCount của toàn bộ tài khoản, không phụ thuộc bộ lọc/phân trang. Thông báo được sinh cho quản lý khi có báo cáo mới, cho người tạo khi duyệt/từ chối, cho nhân viên/người tạo khi phân công, và cho người tạo/quản lý khi tiếp nhận/bắt đầu/hoàn tất. Khi hủy có thông báo thêm cho nhân viên bị hủy.

## Thử đủ luồng bằng Postman

1. Chạy migration, seed và backend theo README.
2. POST /auth/login bằng ADMIN trong .env, giữ token ADMIN.
3. ADMIN gọi POST /users hai lần để tạo MANAGER và SECURITY; đăng nhập hai tài khoản đó, giữ token và UUID.
4. POST /auth/register tạo REPORTER; đăng nhập và giữ token.
5. REPORTER gọi GET /incident-types, chọn ID; POST /incidents, giữ incident.id.
6. REPORTER thử PATCH /incidents/:id và upload ảnh qua POST /incidents/:id/attachments.
7. MANAGER gọi PATCH /incidents/:id/verify với body `{}`. Có thể dùng một báo cáo khác để thử reject với reason.
8. MANAGER gọi GET /assignments/security-users, rồi POST /incidents/:id/assignments; giữ assignment.id.
9. SECURITY gọi GET /assignments/me; lần lượt PATCH accept, start, complete, body `{}` hoặc `{ "note": "Da xu ly" }`.
10. REPORTER xem GET /incidents/:id và GET /incidents/:id/logs; trạng thái cuối RESOLVED. GET /notifications rồi PATCH /notifications/read-all.

## Mã lỗi

- 400: sai DTO, lý do rỗng, dữ liệu không hợp lệ, định dạng tệp không hợp lệ.
- 401: thiếu JWT, JWT hết hạn/bị thu hồi hoặc tài khoản bị khóa.
- 403: sai vai trò hoặc ngoài phạm vi sự cố/phân công/tệp.
- 404: không tìm thấy bản ghi, loại sự cố không hoạt động, thông báo không thuộc tài khoản.
- 409: chuyển trạng thái sai, đã có phân công, trùng email/code hoặc đổi vai trò khi còn việc.
- 413: upload vượt giới hạn dung lượng.
