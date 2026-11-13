# Hợp đồng API SafeOps sau tích hợp

Base URL `http://localhost:3000/api`. Swagger `/api/docs`, JSON `/api/docs-json`, file [openapi.json](openapi.json), [Postman](SafeOps.postman_collection.json). Vai trò: `ADMIN`, `OPERATOR`, `SECURITY`, `REPORTER`.

## Quy ước

- JSON thành công: `{ "success": true, "data": ... }`. JSON lỗi: `{ "success": false, "error": { "code": "...", "message": "..." }, "path": "...", "timestamp": "..." }`.
- Mọi route ngoài health/register/login/refresh cần `Authorization: Bearer <accessToken>`. Mọi JSON nhạy cảm dùng `Cache-Control: no-store`; nội dung tệp trả binary, không bọc JSON.
- Chỉ nhận các thuộc tính trong DTO. UUID không hợp lệ trả 400. Phân trang `page=1`, `limit=10`, `limit≤100`. Danh sách nghiệp vụ trả `items,total,page,limit,totalPages`; Users trả `users`, audit trả `logs` thay `items`.
- Mã lỗi: 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 413 `PAYLOAD_TOO_LARGE`, 422 `UNPROCESSABLE_ENTITY`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`, 503 `SERVICE_UNAVAILABLE`.
- Email trim/lowercase; mật khẩu mới 8–72 byte UTF-8. Không trả passwordHash, tokenVersion hay refreshTokenHash.
- Văn bản lưu plain text. Frontend render dưới dạng text và tránh chèn HTML trực tiếp.

## Auth, Users và Admin

| Method/path | Quyền | Request/chức năng |
|---|---|---|
| GET `/health` | Công khai | Kiểm tra DB |
| POST `/auth/register` | Công khai | `{fullName,email,password,phone?}`; luôn tạo Reporter; 201/409 |
| POST `/auth/login` | Công khai | `{email,password}`; trả 200/access token và refresh cookie |
| POST `/auth/refresh` | Refresh cookie | Body rỗng; xoay cookie và cấp access token mới |
| POST `/auth/logout` | Mọi role | Thu hồi cả phiên `sid`, xóa cookie; 200 |
| GET `/auth/profile` | Mọi role | Danh tính `{user:{id,email,role,sessionId}}` |
| GET `/users/me` | Mọi role | Hồ sơ chính mình |
| PATCH `/users/me` | Mọi role | Ít nhất một trong `{fullName?,email?,phone?,avatarUrl?}` |
| PATCH `/users/me/password` | Mọi role | `{currentPassword,newPassword,confirmPassword}` |
| GET `/users` | Admin, Operator | `page,limit,role,isActive`; `isActive` chỉ nhận `true`/`false` |
| POST `/users` | Admin | `{fullName,email,password,phone?,role:"OPERATOR" hoặc "SECURITY"}` |
| GET/PATCH `/users/:id` | Admin | Đọc/cập nhật hồ sơ; cập nhật có audit log |
| PATCH `/users/:id/role` | Admin | `{roleId:number}`; lấy ID thực từ `/roles` |
| PATCH `/users/:id/status` | Admin | `{isActive:boolean}` |
| GET `/users/:id/audit-logs` | Admin | Nhật ký quản trị có phân trang |
| GET `/roles` | Admin | Danh mục roleId/code/name |

Login/refresh có `data.accessToken,tokenType,expiresIn,user`; access mặc định 900 giây. Refresh là opaque token `sessionUuid.secret`, chỉ trong cookie `safeops_refresh` (`HttpOnly; SameSite=Lax; Path=/api/auth`, thêm Secure ở production). DB lưu SHA-256 hash, thời hạn tuyệt đối mặc định 7 ngày. Mỗi refresh xoay token dưới row lock: hai request đồng thời chỉ một request thành công; FE chỉ thực hiện một refresh tại một thời điểm và gửi `credentials: 'include'`. Cookie Origin guard chặn origin ngoài FRONTEND_URL.

Logout thu hồi mọi access token trong cùng phiên. Đổi email/mật khẩu/role/trạng thái thu hồi mọi phiên của tài khoản. Không tự khóa/tự đổi role Admin; không đổi role của tài khoản Admin qua API này. Không đổi role hoặc khóa Security đang có phân công ASSIGNED/ACCEPTED/IN_PROGRESS: hủy/giao lại trước. Operator xem danh sách người dùng rút gọn `id,fullName,role,isActive,avatarUrl`, không có email/điện thoại.

## Upload và ảnh đính kèm

| Method/path | Request/chức năng |
|---|---|
| POST `/uploads` | multipart `files`: 1–10 ảnh JPEG/PNG/WebP, ≤5 MiB/ảnh, magic bytes |
| GET `/uploads/:filename` | Tải ảnh có JWT và kiểm tra tài nguyên |
| POST `/incidents/:id/attachments` | multipart `file`: một bằng chứng JPEG/PNG/WebP/PDF ≤10 MiB |
| GET `/incidents/:id/attachments` | Danh sách bằng chứng có phân trang |
| GET `/attachments/:id/content` | Nội dung binary có JWT |
| DELETE `/attachments/:id` | Người upload hoặc Admin/Operator; kiểm tra scope sự cố |

Upload nhiều ảnh trả `data.urls` và `data.files=[{id,url,filename,mimeType,size}]`. URL tương đối bắt đầu `/api/uploads/`. Trước khi gắn sự cố chỉ chủ upload/Admin được đọc. Tạo sự cố bằng `attachmentIds` (ID từ upload, không phải URL), chỉ được dùng ảnh của chính người báo cáo và chưa gắn sự cố khác. Gắn ảnh, tạo sự cố, log và notification nằm trong cùng transaction; thất bại không tạo sự cố/đính kèm dở dang. File chưa được gắn vẫn thuộc chủ upload để có thể thử lại.

Sau khi gắn, người có quyền đọc sự cố được đọc ảnh. Metadata và file dùng chung kho UPLOAD_DIR; không public kho này bằng static server. Direct attachment chỉ upload/xóa khi PENDING/VERIFIED/ASSIGNED/IN_PROGRESS. Xóa dùng tombstone để khôi phục tệp khi DB rollback. FE tải bằng fetch Bearer rồi tạo object URL; `<img src>` trực tiếp không gửi Bearer header.

## Incidents và Incident types

| Method/path | Quyền/chức năng |
|---|---|
| GET `/incident-types` | Mọi role; `page,limit,includeInactive`; chỉ Admin dùng `includeInactive=true` |
| POST `/incident-types` | Admin; `{code,name,description?,icon?,isActive?}` |
| PATCH `/incident-types/:id` | Admin; cập nhật danh mục; không đổi mã OTHER |
| POST `/incidents` | Mọi role; `{title,description?,incidentTypeId,latitude,longitude,address?,severity,attachmentIds?}` |
| GET `/incidents` | Lọc `status,severity,incidentTypeId,reporterId,search,from,to,page,limit`, giữ scope |
| GET `/incidents/:id` | Chi tiết trong scope |
| PATCH `/incidents/:id` | Chủ báo cáo/Admin/Operator, chỉ PENDING; các trường tạo ngoại trừ attachmentIds |
| PATCH `/incidents/:id/verify` | Admin/Operator, PENDING → VERIFIED, body rỗng |
| PATCH `/incidents/:id/reject` | Admin/Operator, PENDING → REJECTED, `{reason}` không rỗng |
| PATCH `/incidents/:id/close` | Admin/Operator, RESOLVED → CLOSED, `{note?}` |
| GET `/incidents/:id/logs` | Lịch sử trong scope, phân trang |

POST tạo trả `data.incident`. Severity `LOW/MEDIUM/HIGH/CRITICAL`; loại OTHER cần mô tả. Latitude [-90,90], longitude [-180,180], tối đa 7 chữ số thập phân. `from≤to`. Đối với Reporter chỉ xem sự cố tự tạo. Security xem sự cố tự tạo hoặc có phân công chưa bị hủy. Admin/Operator xem toàn bộ. Bộ lọc không mở rộng scope. Chuyển trạng thái sai trả 409. Sự cố REJECTED/CLOSED là trạng thái cuối.

## Assignments, Notifications, Dashboard

| Method/path | Quyền/chức năng |
|---|---|
| GET `/assignments/security-users` | Admin/Operator; nhân viên Security active, phân trang, chỉ id/fullName |
| POST `/incidents/:id/assignments` | Admin/Operator; `{securityUserId,note?}`; chỉ VERIFIED, tối đa một phân công active |
| GET `/incidents/:id/assignments` | Mọi role trong scope sự cố, phân trang |
| GET `/assignments/me` | Security; lọc `status`, phân trang |
| PATCH `/assignments/:id/accept` | Security được giao; `{note?}`; ASSIGNED → ACCEPTED |
| PATCH `/assignments/:id/start` | Security được giao; ACCEPTED → IN_PROGRESS |
| PATCH `/assignments/:id/complete` | Security được giao; IN_PROGRESS → COMPLETED; sự cố → RESOLVED |
| PATCH `/assignments/:id/cancel` | Admin/Operator; phân công active → CANCELLED; sự cố → VERIFIED |
| GET `/notifications` | Chỉ thông báo chính mình; `isRead=true/false,page,limit`, thêm unreadCount |
| PATCH `/notifications/:id/read` | Chỉ chính người nhận, giữ thời điểm đọc đầu tiên |
| PATCH `/notifications/read-all` | Đánh dấu thông báo chính mình, trả `{updated}` |
| GET `/dashboard/summary` | Admin/Operator; `{total,byStatus}` đủ 7 trạng thái |

ACCEPTED là trạng thái phân công; sự cố vẫn ASSIGNED. Các thay đổi sự cố/phân công khóa sự cố trước, lưu trạng thái/log/notification trong cùng transaction. Security mất quyền thông qua phân công khi phân công bị hủy. Sau commit server phát event incident/assignment và notification tới room được phép. Đọc notification phát `notification:read` cho các phiên của chính người nhận. CRITICAL/phân công mới có email bất đồng bộ; push mobile chưa triển khai.

Danh sách `/assignments/me` giữ bản ghi lịch sử CANCELLED nhưng bỏ đối tượng `incident` khi Security không phải người báo cáo sự cố đó. Khi xóa attachment có nguồn gốc `/uploads`, metadata upload cũng được xóa trong transaction để không gắn lại ảnh đã mất. ID dạng số phải nằm trong 1…2147483647.

## Socket.IO và email

Socket.IO dùng host/port của API, path `/socket.io/`, namespace `/`, JWT trong `auth.token`. Room do server tự gán, kiểm tra lại session trước gửi/nhận; reconnect yêu cầu tải lại REST. Consent vị trí chỉ dành Security có nhiệm vụ còn hiệu lực, không lưu tọa độ. Xem đầy đủ [WebSocket contract](WEBSOCKET-CONTRACT.md) và [báo cáo BE3](BE3-VALIDATION.md), gồm các giới hạn kiểm chứng còn lại. FE Next.js, email xác minh, SSO, map/export và phân tích hiệu suất vẫn cần phần triển khai tương ứng.
