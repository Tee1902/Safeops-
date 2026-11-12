# Rà soát bảo mật BE1 — 09/11/2026

> Tài liệu lịch sử/tham khảo trước bản ghép 11/11/2026. Hợp đồng và lệnh chạy hiện hành nằm trong [README](../README.md), [API-CONTRACT](API-CONTRACT.md) và [INTEGRATION](INTEGRATION.md).

Phạm vi: source endpoint hiện hữu, Auth/RBAC, Users/Admin, upload, nền tảng service Incidents/Assignments/Dashboard và cấu hình triển khai. Đây là kiểm tra code và kiểm thử cục bộ; chưa phải pentest deployment hay integration test PostgreSQL thật.

## Phát hiện và xử lý

| ID | Phát hiện | Xử lý / kiểm chứng |
|---|---|---|
| AUTH-01 | Chỉ có access token, chưa có refresh cookie/session | Thêm auth_sessions, hash refresh, xoay token dưới row lock; unit test token cũ/hết hạn/thu hồi và HTTP cookie flags |
| AUTH-02 | JWT cũ tiếp tục có thể dùng sau thay đổi tài khoản | Mỗi request kiểm tra phiên + user/role hiện tại; đổi mật khẩu/email/role/trạng thái thu hồi phiên trong transaction |
| AUTH-03 | Không ép loại token, issuer/audience/algorithm | Access bắt buộc HS256, issuer/audience, type=access, UUID sub/sid và exp; HTTP test chữ ký giả/hết hạn |
| AUTH-04 | Refresh cookie cần bảo vệ CSRF/login CSRF | SameSite=Lax, HttpOnly, production Secure; Origin guard trên login/refresh/logout; từ chối origin ngoài allowlist và fetch cross-site không Origin |
| AUTH-05 | Bcrypt cắt đầu vào sau 72 byte | DTO IsByteLength, seed Admin kiểm tra byte UTF-8; không trim mật khẩu |
| RBAC-01 | MANAGER lệch yêu cầu OPERATOR; thiếu quyền Operator danh sách | Migration thống nhất OPERATOR và giữ tham chiếu; bảng role được whitelist; Operator xem danh sách rút gọn |
| RBAC-02 | Module/endpoint mới dễ thiếu guard | JWT và RolesGuard global, default deny khi thiếu @Roles; chỉ @Public được bỏ qua; HTTP test 4 role |
| IDOR-01 | Tự cập nhật hồ sơ có nguy cơ nhận ID/role từ client | Lấy ID từ @CurrentUser; DTO chặn roleId/isActive/id; admin route riêng; HTTP test sửa user khác bị 403 |
| IDOR-02 | Ảnh sự cố có thể bị lộ nếu phục vụ static public | Không có static upload route; kiểm tra owner hoặc quyền sự cố/assignment; không có quyền trả 404; CSP sandbox/nosniff và private no-store |
| ADMIN-01 | Thay quyền/trạng thái không có nhật ký | UserAuditLog với actor/target/from/to, cùng transaction; API xem log chỉ Admin |
| ADMIN-02 | Hai Admin thay quyền nhau hoặc tự khóa có thể mất Admin | Advisory transaction lock; đọc lại actor có role ADMIN đang active; cấm tự khóa/tự đổi role; unit test |
| DATA-01 | passwordHash mặc định có thể được query/trả từ entity | select:false + @Exclude + response presenter whitelist; unit test response không có hash/password |
| DATA-02 | Operator không cần email/phone/lastLogin của user khác | Trả id/fullName/role/isActive/avatarUrl; unit test không có email/phone |
| INPUT-01 | Khoảng trắng họ tên, email chưa chuẩn hóa, bool query dễ sai | Transform trước validation; strict whitelist; isActive nhận true/false chính xác; bounded pagination; HTTP test |
| INPUT-02 | Email trùng do race hoặc khác hoa/thường | Unique expression index lower(trim(email)); xử lý PostgreSQL 23505 thành 409; migration dừng nếu dữ liệu cũ trùng |
| UPLOAD-01 | Có thể giả Content-Type/đuôi file/path | file-type magic bytes chỉ JPG/PNG/WEBP; UUID tên do server tạo, không dùng originalname; kiểm tra regex trước download |
| UPLOAD-02 | File quá lớn hoặc batch ghi dở | Multer memory limits và kiểm tra buffer thật <=5 MiB; max 10; validate cả batch; cleanup file khi DB thất bại |
| RATE-01 | Chưa có giới hạn riêng cho thao tác nhạy cảm | Throttler 60 request/phút global, login/register/password 5/phút, refresh/upload 10/phút; HTTP test lần thứ 6 login trả 429 |
| ERROR-01 | Lỗi database/stack có thể lộ bí mật | Filter chỉ trả lỗi nội bộ tổng quát; không log body/header/SQL error; logs DB tắt mặc định |
| DEPLOY-01 | DB dev dùng PostgreSQL 17 và password hard-code | Compose PostgreSQL 16 với volume mới và env bắt buộc; không động vào volume 17 cũ |
| DEPLOY-02 | Thiếu TLS và kiểm tra cấu hình production | Caddy HTTPS, backend non-root/read-only, mạng DB nội bộ, secure cookies bắt buộc, không synchronize production |
| DEP-01 | Mau dev tool kéo theo tmp/undici có cảnh báo high | Bỏ Mau/deploy cloud chưa dùng, cập nhật Nest CLI cùng major; audit lại không còn high/critical |

SQL dùng TypeORM tham số hóa; không đưa query/body vào raw SQL. Raw SQL của migration/advisory lock là hằng số. XSS được giảm thiểu bằng plain-text contract, validation độ dài, CSP và không phục vụ HTML/SVG upload; frontend vẫn phải encode text, không dùng dangerouslySetInnerHTML với dữ liệu người dùng.

## Kết quả thực thi

- TypeScript build/typecheck, lint, Jest unit và HTTP contract tests chạy cục bộ.
- Unit: 96 test; HTTP: 16 test. Coverage service/guard/config: 95.01% statements/lines, 90.18% branches, 91.07% functions; chi tiết trong `coverage/coverage-summary.json` sau `npm run test:cov`.
- `npm audit --omit=dev`: **0** lỗ hổng tại thời điểm kiểm tra.
- Sau cập nhật toolchain, audit toàn bộ: **19** cảnh báo dev/transitive (**3 low, 16 moderate; 0 high/critical**). Chủ yếu Jest → glob/minimatch/deepmerge; npm đề xuất downgrade major Jest, chưa áp dụng vì không tương thích nền tảng ESM hiện tại. Các gói dev này không nằm trong runtime image (`npm ci --omit=dev`). Theo dõi upstream và chạy lại audit trong các PR tiếp theo; không dùng `audit fix --force`.
- Docker Compose dev/prod/overlay frontend: config validation thành công. Chưa build image hoặc kiểm thử HTTPS thực vì Docker daemon không chạy; FE source và domain/TLS thực chưa được bàn giao.

## Công việc bàn giao tiếp

BE2 cần integration test PostgreSQL cho migrations, constraint email, transaction rollback, refresh đồng thời, đổi mật khẩu/role đồng thời, và assignment hoàn tất đồng thời. HTTP tests dùng service/persistence mock nên không chứng minh được hành vi khóa/rollback ở DB thật.

BE2/BE3 phải lặp lại kiểm tra ownership trên API mới của Incidents/Assignments/IncidentLogs/Notifications, đặc biệt `GET/:id`, gắn attachment, đọc/đánh dấu thông báo, subscribe Socket.IO, export và truy vấn dashboard. Hiện các route đó chưa được thêm ngoài phạm vi API hiện có; không thể xác nhận bảo mật cho code chưa có.

Production một instance dùng Throttler memory và local volume. Khi scale, cần shared rate-limit storage, shared storage upload, rate limit handshake/event Socket.IO và xác thực lại từng event. Cần chính sách retention file/chứng cứ/audit và vận hành backup từ doanh nghiệp/BE2 trước UAT.
