# BE2 / BE3 — chức năng và kiểm thử bổ sung

Ngày xác minh: 16/11/2026, Asia/Saigon. Áp dụng trên commit nền `1420f79`, các thay đổi hiện nằm trong working tree để review.

| Mục | Kết quả |
|---|---|
| BE2 — Map và lọc tọa độ | `GET /api/incidents/map`; cùng scope và bộ lọc với danh sách. Bounds bốn cạnh, biên inclusive, qua kinh tuyến 180°, phân trang ổn định. Danh sách và Export cũng dùng bounds. |
| BE2 — Tìm kiếm tiếng Việt | SQL `safeops_fold`, chuẩn hóa NFC, đủ dấu tiếng Việt/đ/Đ, không phân biệt hoa/thường; parameter binding và escape wildcard. |
| BE2 — Workflow/phân công | Chạy lại PostgreSQL workflow: quyền sở hữu, chuyển trạng thái, cạnh tranh verify/reject và assign, hủy/giao lại, thu hồi quyền nhân viên cũ, close, rollback và bằng chứng. |
| BE2 — Backup/Restore | CLI đa nền tảng, custom dump + uploads + manifest SHA-256; backup hoàn chỉnh chỉ xuất hiện sau verify. Restore vào DB/thư mục riêng, kiểm tra đích rỗng, không ghi đè. Diễn tập trên schema ứng dụng thật và file nhị phân. |
| BE3 — Dashboard Statistics | `GET /api/dashboard/statistics`; status/severity/type, trend ngày/tháng Asia/Saigon, mẫu và trung bình thời gian xác minh/giải quyết. Các series dùng cùng transaction REPEATABLE READ. |
| BE3 — Socket.IO | Xác minh transport thật, bốn vai trò, đúng room, JWT/origin, reconnect/REST resync, revoke và consent/rate limit vị trí; workflow thật phát event sau commit, rollback không phát. |
| BE3 — Notifications | Kiểm tra ownership và readAt không đổi khi đọc lại. Bổ sung notificationId/readAt/allRead cho `notification:read`; test hai tab nhận đồng bộ, tài khoản ngoài không nhận. |
| BE3 — CSV/Excel | `GET /api/incidents/export?format=csv|xlsx`; Admin/Operator, dùng chung filters, tối đa 10.000 kết quả, không xuất trường tài khoản. CSV có BOM/escape/chống công thức; test mở XLSX bằng ExcelJS và kiểm tra số liệu thực. |

## Xác minh

- Build, typecheck và lint đạt. `git diff --check` đạt.
- Bộ Jest đầy đủ có coverage: **225/225 test, 21 suite đạt**, gồm PostgreSQL, migration, HTTP, SMTP test, Socket.IO, workflow và các tính năng mới. Lần chạy coverage ghi nhận statements/lines **98,43%**, branches **90,16%**, functions **100%**. Sau khi chuyển các truy vấn thống kê sang await tuần tự trên cùng transaction PostgreSQL, chạy lại suite chức năng liên quan cùng build/lint.
- Backup/Restore: **6/6 test đạt**, gồm diễn tập roundtrip schema/migration, dữ liệu tiếng Việt, metadata upload, nội dung tệp và các ca từ chối nguy hiểm. Test tạo/xóa database ngẫu nhiên riêng, không dùng DB nghiệp vụ.
- Audit dependencies runtime: **0 lỗ hổng**. ExcelJS dùng override uuid `^11.1.1` vì bản phụ thuộc cũ bị npm audit báo lỗi; API sử dụng v4 vẫn tương thích và XLSX roundtrip đạt.
- OpenAPI/Postman đã xuất lại: **49 thao tác**. Kiểm tra xuất lần nữa cho cùng hash; không xóa thao tác API cũ. CI bổ sung bước backup/restore với PostgreSQL service riêng; chưa chạy GitHub Actions từ phiên này.

Lệnh chạy lại từ `backend`:

```powershell
npm.cmd ci --ignore-scripts
docker compose -f docker-compose.test.yml up -d --wait
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:cov
npm.cmd run test:features
$env:TEST_POSTGRES_CONTAINER = 'safeops-be3-test-postgres-test-1'
npm.cmd run test:backup
npm.cmd run docs:export
```

## Cập nhật môi trường phát triển

Cần Node 24 từ 24.15.0 trở lên trong nhánh 24 hoặc Node 26+. Máy xác minh đang dùng Node 24.12.0 nên npm có cảnh báo engine, dù các kiểm thử trên đạt. Dùng bản Node được khai báo trong engines khi cài mới/CI.

Sau khi review, cài thư viện theo lockfile, build và chạy `npm.cmd run migration:run` trên môi trường đích phù hợp trước khi khởi động bản backend mới. Migration mới tạo hàm tìm kiếm và index tọa độ. Phiên này chỉ chạy migration trên các database/schema test riêng; không thay đổi schema/data của DB nghiệp vụ hiện có, không commit/push/deploy.

Chi tiết response/query nằm trong [API-CONTRACT](API-CONTRACT.md), [OpenAPI](openapi.json), [Postman](SafeOps.postman_collection.json), [WebSocket contract](WEBSOCKET-CONTRACT.md) và [Backup/Restore](BACKUP-RESTORE.md).

## Giới hạn kiểm chứng

Repository chưa có frontend, vì vậy chưa nghiệm thu bản đồ/UI bốn trình duyệt hoặc tải tệp từ giao diện. Chưa đo ngưỡng tải production cho API mới; substring search có scan và export giới hạn dung lượng chủ động. Không thêm SLA, push mobile, durable outbox, Socket.IO đa replica, job backup lịch hay chính sách retention tự động. Backup cần dừng mọi writer để DB và file cùng một trạng thái; hash không thay thế mã hóa/chữ ký. Phải kiểm tra bản khôi phục riêng trước khi chuyển ứng dụng production.
