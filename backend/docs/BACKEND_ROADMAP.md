# Lộ trình hoàn thiện backend SafeOps

> Tài liệu lịch sử/tham khảo trước bản ghép 11/11/2026. Hợp đồng và lệnh chạy hiện hành nằm trong [README](../README.md), [API-CONTRACT](API-CONTRACT.md) và [INTEGRATION](INTEGRATION.md).

Đối chiếu mã nguồn ngày 10/11/2026 với 8 nhiệm vụ backend của nhóm. Đây là đánh giá hiện trạng và kế hoạch; các API/sự kiện ghi trong phần lộ trình là đề xuất, chưa được triển khai. Không chạy lại bộ test trong lần lập kế hoạch; kết quả gần nhất ở PROJECT_REVIEW.md ngày 09/11/2026 là 33 unit test và 18 E2E qua.

## Hiện trạng 8 nhiệm vụ

| Nhiệm vụ | Đã có | Thiếu / cần hoàn thiện |
| --- | --- | --- |
| API | Auth, users/staff, incident types, incidents, review, assignments, attachments, notifications; lọc và phân trang | API đóng sự cố, realtime, statistics/reports; Swagger/OpenAPI và thống nhất hợp đồng với FE |
| Database | PostgreSQL, 9 entities, 4 migration, FK, indexes, seed; transaction và khóa ghi | Các CHECK/DEFAULT/giới hạn độ dài còn thiếu so với thiết kế; backup/restore được diễn tập; kiểm tra index theo truy vấn thực tế |
| Nghiệp vụ | Tạo/sửa báo cáo PENDING, duyệt/từ chối, giao SECURITY, accept/start/complete, hủy/giao lại, log và thông báo | Bước RESOLVED → CLOSED; chốt người đóng, điều kiện đóng và các tình huống ngoại lệ với nhóm |
| Xác thực/phân quyền | Đăng ký REPORTER, login JWT, logout thu hồi token, RBAC, quyền theo chủ sở hữu/phân công, tokenVersion khi đổi mật khẩu, quản trị nhân viên | Yêu cầu gọi OPERATOR nhưng code dùng MANAGER; cần thống nhất; refresh/reset/email verification nếu nhóm yêu cầu |
| Bảo mật | bcrypt, DTO, validation whitelist, Helmet, CORS allowlist, rate limit, kiểm tra upload, private file API, tắt log SQL | Quy trình secrets/TLS khi deploy, ràng buộc DB, audit hành động quản trị, bảo vệ các API mới và dependency dev còn cảnh báo |
| Realtime | Có lưu notifications và API xem/đánh dấu đã đọc | Chưa có Socket.IO Gateway, xác thực socket, rooms, events, đồng bộ khi reconnect |
| Thống kê/báo cáo | Có dữ liệu nguồn và khả năng lọc danh sách | Chưa có truy vấn tổng hợp dashboard, thời gian xử lý, CSV/Excel |
| Kiểm thử | Unit validation/file, E2E PostgreSQL, ca phân quyền, đồng thời, rollback, Postman collection | Test cho module mới, CI, coverage có đánh giá, tải lớn, cấu hình HTTP thực tế, khôi phục dữ liệu và FE integration |

Lưu ý: Docker Compose hiện chạy PostgreSQL. Backend đang chạy Node/Nest trực tiếp, chưa có Dockerfile/container backend. Có package/script deploy không chứng minh đã có quy trình triển khai chạy được.

## Giai đoạn 1 — chốt vai trò và hoàn tất workflow

- [ ] Chốt OPERATOR có đúng là MANAGER hiện tại không. Nếu cùng chức năng, có thể thống nhất tên hiển thị trước; nếu bắt buộc đổi mã, cập nhật seed, DTO, guard, service, database hiện có, JWT, test và Postman bằng migration phù hợp. Không chỉ thêm role OPERATOR mà bỏ qua các kiểm tra role đang viết cố định.
- [ ] Viết ma trận quyền của REPORTER, OPERATOR/MANAGER, SECURITY, ADMIN cho từng hành động.
- [ ] Chốt quy tắc RESOLVED → CLOSED. Đề xuất MANAGER/ADMIN xác nhận đóng; lưu người/thời gian đóng và ghi log/thông báo. Có thể lưu trong log hoặc thêm cột bằng migration theo hợp đồng dữ liệu nhóm chọn.
- [ ] Triển khai đề xuất PATCH /incidents/:id/close, chỉ nhận RESOLVED, kiểm soát cập nhật đồng thời và không đóng lặp.
- [ ] Chốt có cần mở lại sự cố, SLA/quá hạn và nhiều người xử lý hay không. Không tự thêm vào phạm vi bắt buộc nếu nhóm chưa yêu cầu.
- [ ] Viết test vai trò và chuyển trạng thái mới, cập nhật tài liệu.

Đạt khi: không còn mâu thuẫn tên vai trò và thử đủ PENDING → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED, cùng nhánh REJECTED/hủy phân công.

## Giai đoạn 2 — hợp đồng API cho FE

- [ ] Thêm Swagger/OpenAPI: DTO, response, Bearer auth, query, multipart upload và mã lỗi.
- [ ] Chốt phân trang: danh sách mới dùng items, GET /users đang dùng users. Nếu đổi phải thống nhất FE/Postman và test tương ứng.
- [ ] Xác định các trường bắt buộc/tùy chọn, kiểu ID số/UUID, numeric tọa độ trả chuỗi và định dạng thời gian ISO 8601.
- [ ] Cập nhật Postman và tạo luồng demo độc lập cho reject/cancel để không ghi đè ID luồng chính.
- [ ] Bổ sung GET /health; readiness kiểm tra kết nối DB và các thành phần thực sự cần thiết.

Đạt khi: FE có thể tích hợp từ tài liệu và collection mà không cần đọc service; các response khớp OpenAPI.

## Giai đoạn 3 — thống kê và xuất báo cáo

Tạo StatisticsModule và ReportsModule hoặc một module gom hai phần tùy quy mô. Endpoint đề xuất:

| Endpoint | Dữ liệu |
| --- | --- |
| GET /statistics/overview | Tổng số, chờ duyệt, đang xử lý, đã giải quyết, đã đóng |
| GET /statistics/incidents | Nhóm theo status, severity, incident type và ngày/tháng |
| GET /statistics/response-times | Thời gian chờ duyệt/tiếp nhận/giải quyết, định nghĩa rõ mốc đo |
| GET /reports/incidents/export?format=csv | CSV theo các bộ lọc đã chốt |
| GET /reports/incidents/export?format=xlsx | Excel nếu yêu cầu bắt buộc có cả Excel và CSV |

- [ ] Thống nhất phạm vi quyền; đề xuất MANAGER/ADMIN xem báo cáo toàn hệ thống, REPORTER/SECURITY chỉ xem số liệu riêng nếu có yêu cầu.
- [ ] Dùng tổng hợp SQL thay vì tải toàn bộ bản ghi vào RAM rồi đếm.
- [ ] Quy định múi giờ thống kê; UI của nhóm dùng Asia/Saigon, DB lưu timestamptz. Chốt ý nghĩa ngày đầu/cuối khoảng lọc.
- [ ] Không tính bản ghi chưa hoàn tất thành thời gian xử lý bằng 0; xử lý trường hợp không có dữ liệu rõ ràng.
- [ ] Xuất cùng điều kiện lọc và quyền với màn hình; không bao gồm passwordHash/token.
- [ ] Bảo vệ giá trị ô khỏi bị hiểu thành công thức khi mở CSV/Excel; giới hạn dung lượng hoặc stream dữ liệu lớn.
- [ ] Test số liệu bằng dữ liệu fixture biết trước, khoảng ngày, ranh giới múi giờ và quyền export.

Đạt khi: số dashboard khớp dữ liệu kiểm tra, file tải về mở được, bộ lọc và quyền đều đúng.

## Giai đoạn 4 — Socket.IO realtime

- [ ] Thêm module realtime và Gateway. Xác thực JWT khi kết nối, kiểm tra tài khoản/tokenVersion/thu hồi và giới hạn origin.
- [ ] Server quyết định rooms user:<id> và nhóm quản lý từ quyền thực tế. Không cho client tự chọn room của người khác.
- [ ] Phát sự kiện sau khi transaction commit. Không gửi sự kiện thành công bên trong transaction còn có thể rollback.
- [ ] Chốt schema payload có incidentId, trạng thái, thời điểm/phiên bản và ID sự kiện khi cần tránh xử lý trùng.
- [ ] Chốt các event: notification.created, incident.created, incident.updated, incident.status_changed, assignment.created, assignment.updated.
- [ ] Với thay đổi phạm vi quyền như hủy/giao lại, đảm bảo nhân viên cũ không tiếp tục nhận dữ liệu chỉ dành cho người đang phụ trách.
- [ ] Xử lý token hết hạn/đổi mật khẩu/logout/khóa tài khoản trên kết nối dài; socket đã kết nối không được giữ quyền mãi chỉ vì handshake từng hợp lệ.
- [ ] Khi reconnect, FE lấy lại dữ liệu qua REST notifications/incidents; websocket không thay thế lịch sử đã lưu.
- [ ] Test bằng hai client/tài khoản khác nhau: đúng người nhận, sai người không nhận, rollback không phát sự kiện thành công.

Đạt khi: tạo/duyệt/phân công/hoàn tất ở client A được cập nhật đúng quyền ở client B và không rò dữ liệu sang tài khoản khác. Outbox có thể bổ sung khi cần đảm bảo gửi lại sau sự cố; Redis adapter chỉ cần khi triển khai nhiều instance.

## Giai đoạn 5 — database và bảo mật vận hành

- [ ] Thêm migration cho các ràng buộc đã thống nhất: status, severity, tọa độ, file_size>0, độ dài và default thích hợp. Đối chiếu dữ liệu cũ trước khi áp dụng; không sửa migration đã chạy trên DB chung.
- [ ] Có job dọn revoked_tokens đã hết hạn.
- [ ] Audit thay đổi vai trò, khóa/mở khóa và các thao tác quản trị cần truy vết; bảo vệ quyền xem log.
- [ ] Cấu hình secrets, mật khẩu PostgreSQL và CORS theo môi trường. HTTPS qua proxy khi deploy; không dùng giá trị demo trong môi trường công khai.
- [ ] Xử lý dependency dev còn cảnh báo theo PROJECT_REVIEW.md; audit lại vì kết quả ngày 09/11 chỉ là ảnh chụp thời điểm đó.
- [ ] Chốt dùng Mau hay công cụ triển khai khác; nếu không dùng Mau thì gỡ trong thay đổi được kiểm tra, tránh dùng audit fix --force không đánh giá.
- [ ] Refresh token, forgot/reset password và email verification chỉ triển khai khi cần tài khoản tự phục vụ/phiên đăng nhập dài. Nếu làm: token reset hết hạn, dùng một lần; refresh có rotation/revocation và tests.

Đạt khi: dữ liệu sai bị chặn ở API và DB, truy cập trái quyền bị chặn, có thể truy vết thao tác quản trị và không cần secrets demo để deploy.

## Giai đoạn 6 — triển khai, CI và nghiệm thu

- [ ] Dockerfile backend, .dockerignore, compose cho backend + DB + volume uploads; backend container kết nối DB bằng tên service postgres thay vì localhost.
- [ ] Migration chạy theo bước triển khai rõ ràng trước khi khởi động ứng dụng; có hướng xử lý khi migration thất bại.
- [ ] Logging có cấu trúc, request ID, error tracking và healthcheck; tích hợp Observe nếu nhóm chọn dùng, không coi dependency hiện có là đã bật.
- [ ] Backup database + files và thử restore vào môi trường sạch.
- [ ] CI chạy install theo lockfile, build, lint, unit và E2E với PostgreSQL test riêng; test nào dùng dist phải chờ build xong.
- [ ] Bổ sung E2E realtime/export/close, HTTP validation/CORS/Helmet theo setup thực tế; kiểm tra rate limit riêng vì workflow E2E hiện tắt throttler.
- [ ] Test tải các endpoint danh sách, upload, statistics và export theo quy mô nhóm chốt; chỉ tối ưu khi có số đo.
- [ ] Tích hợp FE từ đăng nhập đến đóng sự cố, thông báo trực tiếp và tải báo cáo; chạy thử sai quyền và session hết hạn.
- [ ] Bàn giao README chạy từ máy sạch, .env.example, OpenAPI, collection, tài liệu socket, backup/restore và danh sách giới hạn còn lại.

Đạt khi: checkout mới chạy được theo tài liệu, CI qua, FE thử đủ các vai trò, dashboard/export/realtime đúng và restore dữ liệu thành công.

## Thứ tự thực hiện đề xuất

1. Vai trò + CLOSED.
2. Swagger/hợp đồng API + healthcheck.
3. Statistics + CSV/Excel.
4. Realtime Socket.IO.
5. Ràng buộc DB + dọn token + bảo mật vận hành.
6. Docker backend + CI + backup/restore + nghiệm thu FE.

Test và cập nhật tài liệu đi kèm từng giai đoạn. Sau mỗi module chạy build, lint, unit và E2E phù hợp; không đợi đến cuối mới kiểm tra phân quyền. Hai phần Statistics và Realtime có thể đổi thứ tự nếu FE cần một phần trước.
