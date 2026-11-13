# BE3-A — triển khai và xác minh

Phạm vi dựa trên `BE3A_SafeOps_Nen_tang_Realtime_Thong_bao.md` được cung cấp. Ngày báo cáo: 13/11/2026, múi giờ Asia/Bangkok. Tài liệu nguồn được dùng để xác định yêu cầu; chưa có hành động gửi thông báo cho thành viên, mở PR hay merge từ phiên làm việc này.

| Task | Phần đã triển khai | Xác minh |
|---|---|---|
| M0-16 | Giữ envelope hiện có, thêm `PageDto`, ánh xạ 422 | Build, unit, HTTP contract |
| M0-17 | Swagger Bearer, Helmet, CORS đã có; thêm 422/event contract | HTTP contract, xuất lại OpenAPI/Postman |
| M4-01 | Socket.IO + JWT/session, room role/user, origin restriction, cleanup/revocation | 6 kịch bản transport thật với persistence giả lập |
| M4-02 | Publish sau commit cho incident/assignment, payload gọn | Đạt với PostgreSQL thật: luồng bốn socket và rollback không phát event/mail |
| M4-04 | Consent theo socket/assignment, quyền Security đang nhận việc, giới hạn 5 giây/user, clear khi dừng | Transport test DTO/quyền/consent/rate/clear |
| M4-11 | Bộ test nhiều phiên, reconnect và REST resync | Socket transport đã chạy; kiểm thử giao diện bốn trình duyệt còn chờ FE |
| M5-01/02 | REST phân trang/unreadCount/IDOR; socket created/read và index | Workflow PostgreSQL đạt, kiểm tra ownership và giữ timestamp đọc đầu tiên |
| M5-03 | Nodemailer, gửi ngoài transaction, lỗi SMTP không phá nghiệp vụ, liên kết incident | SMTP cục bộ thực: gửi thành công và reject mail |
| M7-04 | 5.000 incident + 5.000 notifications, 20 danh tính/kết nối Socket.IO, 100 phép đo/API ở concurrency 20 | Đạt localhost với PostgreSQL 17: max dashboard 75ms, incidents 150ms, notifications 77ms |

## Kết quả trong workspace

- `npm run build`: đạt.
- `npm run typecheck`: đạt.
- `npm run lint`: đạt, không còn cảnh báo.
- `npm test`: 126/126 test đạt (13 suites).
- `npm run test:e2e`: 16/16 test đạt, HTTP pipeline với persistence giả lập.
- `npm run test:realtime`: 6/6 test đạt, JWT thật và Socket.IO transport thật; kiểm tra thời gian nhận sự kiện <2 giây trên localhost, polling/WebSocket và xóa consent khi disconnect.
- `npm run test:be3:db`: 3/3 test đạt sau khi Docker hoạt động và PostgreSQL test cổng 55432 healthy. Xác minh luồng bốn socket, rollback DB không gửi event/email và hiệu năng dưới 500ms.
- `npm run test:cov`: 200/200 test đạt, 19 suites; bao gồm các workflow PostgreSQL, migration, HTTP, Socket.IO và SMTP. Coverage statements/lines 98,15%, branches 89,45%, functions 100%.
- CI chưa chạy trên remote; không coi local checks là CI xanh hoặc reviewer đã duyệt.

## Đo lại và sửa lỗi khi Docker sẵn sàng

Lần kiểm tra đầu sau khi Docker chạy phát hiện incidents max 541ms, vượt ngưỡng 500ms. Truy vấn danh sách dùng JOIN với phân trang DISTINCT; serialize entity lặp lại cũng tạo chi phí lớn. Bản sửa phân trang trực tiếp, tải danh mục type theo trang, thêm index `(created_at,id)` và chỉ trả các trường công khai qua presenter. Route danh sách bỏ bước class serialization dư thừa; các route tài khoản vẫn dùng ClassSerializer để ẩn dữ liệu nhạy cảm. Test kiểm tra phân trang không trùng ID, incidentType, total và không lộ trường bí mật.

Bộ workflow đầy đủ còn phát hiện Operator đọc ảnh đã gắn vào incident bị 404: truy vấn dùng URL đầy đủ trong khi DB lưu filename. Đã sửa để nhận cả khóa filename hiện tại và URL cũ; các test quyền truy cập, người ngoài, xóa ảnh và khôi phục sau rollback đều đạt.

Đã giới hạn `.gitignore` vào các thư mục uploads runtime ở root/backend: quy tắc cũ `uploads/` vô tình bỏ qua cả `backend/src/uploads`, khiến source module upload không hiện trong Git. Source module hiện có thể được review và đưa vào commit cùng bản sửa.

Số đo cuối với PostgreSQL 17 trong Docker, API chạy trên host Windows, **không bật coverage**; 20 danh tính, 20 socket, 100 request/API, concurrency 20, sau warmup:

| API | p95 (ms) | Max (ms) | Mục tiêu |
|---|---:|---:|---|
| `/api/dashboard/summary` | 74 | 75 | <500ms — đạt |
| `/api/incidents?limit=100` | 149 | 150 | <500ms — đạt |
| `/api/notifications?limit=100` | 73 | 77 | <500ms — đạt |

Các assertion hiệu năng cũng đạt trong lần chạy coverage đầy đủ; ngưỡng 500ms được giữ nguyên. Đây là phép đo local, chưa phải kết quả production. DB dev đang ở cổng 5433 không bị dùng để seed/test hoặc chạy migration; test dùng schema ngẫu nhiên trong DB riêng cổng 55432.

## Chạy lại với PostgreSQL

```sh
docker compose -f docker-compose.test.yml up -d --wait
npm run test:be3:db
npm run test:workflow
npm run test:cov
docker compose -f docker-compose.test.yml down
```

Có thể đặt `TEST_DATABASE_URL` tới PostgreSQL riêng. Tên DB bắt buộc kết thúc `_test`; mỗi suite tạo schema UUID riêng rồi xóa schema đó. Không dùng DB nghiệp vụ. Compose test không mount volume dữ liệu dev và chỉ publish localhost:55432. Bộ test không bỏ qua khi DB chưa sẵn sàng.

Trên PowerShell, nếu ExecutionPolicy chặn `npm.ps1`, dùng `npm.cmd` thay `npm` cho các lệnh trên.

Suite BE3 PostgreSQL kiểm tra: (1) create/verify/assign/accept/start/resolve với bốn socket, DB commit, notification/email trigger và location clear; (2) trigger DB làm rollback toàn bộ và không phát event/mail; (3) seed dữ liệu tổng hợp và đo dashboard/incidents/notifications với 20 danh tính/phiên riêng. In kết quả `samples,p95Ms,maxMs`; yêu cầu mỗi API max <500ms. Đo trên môi trường cụ thể, lưu log CI làm bằng chứng; không dùng số đo localhost thay SLO production. Throttler HTTP được bỏ qua trong test tải để đo ứng dụng/DB, không thay đổi cấu hình runtime.

## M4-11 — kịch bản bốn trình duyệt khi có FE

Mỗi lần chạy ghi mục tiêu, dữ liệu/tài khoản tổng hợp, bước, kỳ vọng, kết quả thực tế, thời gian/ảnh log và trạng thái. Hiện chưa chạy trên UI vì repository không có frontend.

| Kịch bản | Bước | Kỳ vọng | Thực tế |
|---|---|---|---|
| RT-01 | Mở Reporter, Operator, Security, Admin ở bốn profile; đăng nhập | Mỗi socket ready, chỉ có room đúng danh tính | Chờ FE |
| RT-02 | Reporter tạo incident; Operator xác minh/giao Security; Security nhận/bắt đầu/hoàn thành | Người liên quan cập nhật <2 giây, badge đúng, người ngoài không nhận | Transport test đạt; UI chờ FE |
| RT-03 | Tắt mạng Reporter, thay đổi incident từ Operator, bật mạng | Tự reconnect; `realtime:ready`; REST đồng bộ trạng thái và unreadCount | Transport test đạt; UI chờ FE |
| RT-04 | Security thử gửi vị trí trước consent, bật consent, gửi quá nhanh, tắt consent | Chặn trước consent, rate limit, Admin/Operator xóa marker | Transport test đạt; UI chờ FE |
| RT-05 | Complete/cancel nhiệm vụ, logout/thu hồi JWT khi socket còn mở | Dừng vị trí, ngắt session hết quyền, không rò dữ liệu | Transport và PostgreSQL đạt; UI chờ FE |
| RT-06 | Đánh dấu đọc ở một tab, quan sát tab khác của cùng tài khoản | Badge đồng bộ; tài khoản khác không đọc được notification | PostgreSQL/Socket event đạt; UI chờ FE |

Phần backend và phép đo M7-04 local đã xác minh với PostgreSQL. Để hoàn tất nghiệm thu UI M4-11 cần FE chạy được, ảnh minh chứng từ bốn trình duyệt, review BE1/FE1 và quy trình PR của nhóm. Phần nghiệm thu UI và remote CI chưa hoàn tất.
