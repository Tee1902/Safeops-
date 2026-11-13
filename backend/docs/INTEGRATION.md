# Kết quả ghép ZIP và dự án hiện tại — 11/11/2026

> Báo cáo này ghi lần ghép ban đầu. Xem [rà soát sau tích hợp](POST_INTEGRATION_REVIEW.md) cho các lỗi phát hiện thêm, bản sửa và kết quả 183 kiểm thử mới nhất.

Nguồn tham khảo: `D:\SafeOps (1).zip`, giải nén mã nguồn/tài liệu vào `.reference` tại workspace. Bản trước tích hợp được lưu tại `.integration-backup/backend` (không sao chép `.env` hay uploads). Tài liệu trong ZIP được dùng làm đặc tả tham khảo; không thực hiện quy trình gửi thông báo, merge hay deploy được mô tả trong đó.

## Nội dung tích hợp

| Phần | Kết quả |
|---|---|
| Auth nền tảng từ ZIP | Access JWT 15 phút; refresh cookie HttpOnly, hash/rotation/row lock, logout theo session, global authentication/RBAC, rate limit và kiểm tra Origin |
| Users/Admin từ ZIP | Hồ sơ, đổi mật khẩu, danh sách lọc role/active, dữ liệu Operator rút gọn, tạo nội bộ, đổi role/khóa, audit transaction, API danh mục role |
| Nghiệp vụ dự án hiện tại | Giữ API loại sự cố, báo cáo/lọc/sửa/xác minh/từ chối, logs, phân công/tiếp nhận/bắt đầu/hoàn tất/hủy, bằng chứng, notifications |
| Phần nối mới | Ảnh upload gắn vào sự cố qua attachmentIds, kiểm tra owner và claim dưới lock; đóng RESOLVED → CLOSED kèm log/notification; chặn đổi role/khóa nhân viên còn phân công active |
| Response/API | `/api/*`, success/data và success/error, file binary không bị bọc JSON; URL attachment đồng bộ prefix; Swagger đủ 46 thao tác và DTO, Postman sinh từ OpenAPI |
| DB | Giữ nguyên 4 migration cũ, thêm Be1Foundation; giữ token_version, 12 entity gồm 8 bảng nghiệp vụ và 4 bảng hỗ trợ; kiểm thử PostgreSQL chạy cả 5 migration |
| Hạ tầng | Giữ PostgreSQL 17 dev/volume cũ, thêm pgAdmin/Mailhog; Docker multi-stage, Compose production/Caddy/TLS, template Next.js; CI có PostgreSQL riêng |
| Kiểm thử | Dùng Jest + TypeScript compiler cho decorator metadata, thay các config Vitest cũ; schema test ngẫu nhiên và cleanup; compile test luôn dọn artifact cũ |

Không ghi đè giá trị `.env` hiện có. Chỉ bổ sung các khóa cấu hình không chứa secret mới còn thiếu; không chạy migration trên DB ứng dụng hiện có. Chưa tạo tài khoản ứng dụng thực hoặc deploy lên server.

## Thay đổi client cần thực hiện

1. Base URL thêm `/api`, đọc kết quả từ `response.data` trong JSON backend, login/logout thành công HTTP 200.
2. MANAGER chuyển thành OPERATOR qua migration; JWT cũ cần đăng nhập lại. Cookie refresh cần credentials include.
3. Đổi role dùng `{roleId}` lấy từ `/api/roles`. Vai trò Security/Operator mới vẫn tạo bằng `{role:"SECURITY"}` / `{role:"OPERATOR"}`.
4. POST `/uploads` trả ID ảnh. Gửi `attachmentIds` khi tạo incident, không gửi URL tùy ý. API upload bằng chứng trực tiếp vẫn có.
5. Postman hiện có 46 request, tự lưu accessToken/incidentId/assignmentId và lấy roleId/typeId thực tế. Không nhúng mật khẩu thật.

## Kiểm chứng

Build, typecheck và lint đã chạy thành công. Bộ tổng hợp có 155 kiểm thử unit/HTTP/PostgreSQL; coverage cuối được ghi trong [VALIDATION-INTEGRATED.md](VALIDATION-INTEGRATED.md). Các ca quan trọng gồm concurrent review/assignment/refresh, IDOR, role/session revocation, file signature/ownership, claim ảnh, đóng sự cố, logs/notifications và rollback DB/tệp.

Dev/test PostgreSQL chạy bằng Docker. Bộ test dùng cổng 55432, database `_test`, schema riêng, không dùng dữ liệu ứng dụng. Tài liệu hướng dẫn cũ trong `API.md`, `BACKEND_ROADMAP.md`, `PROJECT_REVIEW.md` và hướng dẫn cấp dự án giữ làm lịch sử; README và API-CONTRACT là hợp đồng hiện tại.

## Phạm vi chưa có đủ đầu vào

- Hai nguồn đều không có frontend Next.js; chỉ có Dockerfile/overlay để tích hợp khi có frontend.
- BE3-A đã bổ sung Socket.IO transport/JWT/rooms, publish sau commit, notifications/email cảnh báo và consent vị trí. Xem [WebSocket contract](WEBSOCKET-CONTRACT.md) và [kết quả BE3](BE3-VALIDATION.md). Email xác minh/push, map UI/export và phân tích hiệu suất chưa có; SSO được đặc tả BE1 hoãn sang giai đoạn 2.
- Không có domain/DNS/chứng chỉ/secrets server hay GitHub remote phục vụ rollout; chưa xác minh TLS thực tế, cấu hình branch protection hoặc UAT với nhóm.
- Node trên máy là 24.12.0, thấp hơn engine khuyến nghị 24.15; các bước cục bộ đã chạy nhưng nên nâng Node theo README khi cài mới. CI/Docker dùng Node 24 hiện hành.

Các mục này được ghi riêng để không nhầm nền tảng tích hợp với tính năng hoặc triển khai đã hoàn thành.
