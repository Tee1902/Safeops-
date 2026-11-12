# Kết quả kiểm tra SafeOps — 09/11/2026

> Tài liệu lịch sử/tham khảo trước bản ghép 11/11/2026. Hợp đồng và lệnh chạy hiện hành nằm trong [README](../README.md), [API-CONTRACT](API-CONTRACT.md) và [INTEGRATION](INTEGRATION.md).

Đã rà soát mã nguồn backend, DTO, guard, workflow, entities, migrations, seeds, cấu hình chạy, Docker và tests. Không có frontend trong thư mục hiện tại. Kết quả bên dưới là kiểm tra cục bộ; không phải xác nhận về một hệ thống production đã triển khai.

## Kết quả đã xác nhận

| Kiểm tra                            | Kết quả                                                |
| ----------------------------------- | ------------------------------------------------------ |
| Build NestJS                        | Thành công                                             |
| oxlint                              | Không lỗi/cảnh báo                                     |
| TypeScript toàn bộ                  | Thành công; chạy sau khi build xong                    |
| Prettier src/test                   | Thành công                                             |
| Unit test                           | 33/33 qua                                              |
| E2E PostgreSQL thật                 | 18/18 qua                                              |
| Migration database ứng dụng         | Đã áp dụng đủ 4 migration                              |
| So sánh entity và schema PostgreSQL | Không có thay đổi schema cần sinh thêm                 |
| Backend thực tế                     | GET http://localhost:3000/ trả HTTP 200, Hello World!  |
| Đăng nhập ADMIN thực tế             | Thành công; đọc được 7 loại sự cố đã seed              |
| PostgreSQL ứng dụng                 | safeops-postgres, healthy, localhost:5432              |
| PostgreSQL test                     | safeops-test-postgres-test-1, healthy, localhost:55432 |

E2E chạy trong schema ngẫu nhiên của database test, tự dọn dữ liệu/tệp thử. Dữ liệu E2E không được tạo trong database ứng dụng. Database ứng dụng hiện đã có ADMIN từ .env, 4 roles và 7 incident types để bạn thử API.

## Lỗi đã tìm thấy và sửa

| Vị trí                                  | Lỗi trước khi sửa                                                                                                                                 | Cách sửa / xác nhận                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| users/dto/update-user.dto.ts            | fullName=null đi qua IsOptional rồi lỗi .trim(), trả HTTP 500; tên toàn khoảng trắng được nhận                                                    | Reject null cho tên/email, trim trước kiểm tra; E2E và unit test                                                                |
| users/users.service.ts                  | Hai request sửa các trường hồ sơ khác nhau có thể ghi lại dữ liệu cũ của nhau                                                                     | Chỉ update các trường thật sự được gửi; E2E cập nhật đồng thời                                                                  |
| auth/auth.service.ts                    | Hai đăng ký cùng email đồng thời có một request trả 500 do unique constraint                                                                      | Chuyển lỗi PostgreSQL 23505 thành 409; E2E đồng thời                                                                            |
| auth/auth.controller.ts                 | JWT có thể giống nhau khi cùng tài khoản đăng nhập trong cùng giây, khiến logout ảnh hưởng phiên khác                                             | Thêm jti ngẫu nhiên cho mỗi lần đăng nhập; E2E                                                                                  |
| auth/strategies/jwt.strategy.ts         | Header bearer viết thường bị từ chối dù thư viện nhận diện được                                                                                   | Dùng cùng bộ trích xuất Bearer của passport-jwt; E2E                                                                            |
| users/users.service.ts + JWT strategy   | Đổi mật khẩu không vô hiệu hóa các token đang lưu hành                                                                                            | Thêm token_version, tăng trong transaction đổi mật khẩu và so sánh ở mỗi request; E2E                                           |
| common/validation.ts + các password DTO | Giới hạn 72 ký tự chưa đúng giới hạn 72 byte UTF-8 của bcrypt                                                                                     | Kiểm tra số byte cho mật khẩu mới/tạo tài khoản/seed ADMIN; unit test với tiếng Việt                                            |
| incidents/dto/create-incident.dto.ts    | Ép Number có thể biến false hoặc chuỗi rỗng thành tọa độ 0                                                                                        | NumericInput chỉ nhận số hoặc chuỗi số có nội dung; unit test                                                                   |
| database/seeds                          | Upsert khi seed lại sẽ ghi đè danh mục, bật lại loại đã vô hiệu hóa                                                                               | Chỉ insert mục còn thiếu, giữ nguyên dữ liệu quản trị; E2E chạy seed thật                                                       |
| database/entities/user.entity.ts        | Code đã biên dịch có thể lỗi import vòng Role/User khi seed chạy trực tiếp bằng node                                                              | Dùng Relation<Role> cho relation; kiểm tra compiled seed                                                                        |
| database/data-source.ts                 | Đường dẫn migration gắn cứng với src/cwd; bản biên dịch có thể tìm sai loại file; glob trên đường dẫn Windows có dấu ngoặc có thể không nhận file | Đọc thư mục migration tương đối với import.meta.url và import URL chính xác; source CLI và compiled CLI đều nhận đủ 4 migration |
| app.module.ts, database/data-source.ts  | Log toàn bộ SQL có thể bao gồm tham số như password hash                                                                                          | Tắt query logging trong ứng dụng/seeds                                                                                          |
| attachments/attachments.service.ts      | Nếu ghi file lỗi giữa chừng, biến theo dõi chưa được đặt nên tệp dở có thể còn lại                                                                | Đánh dấu file đã được tạo trước khi ghi và luôn đóng handle; rollback upload/xóa tiếp tục có E2E                                |
| database/seeds/seed-admin.ts            | Email seed tồn tại nhưng thuộc role khác vẫn báo ADMIN đã có                                                                                      | Báo lỗi rõ, không tự nâng quyền tài khoản                                                                                       |
| src/test                                | Một số file chưa đúng format                                                                                                                      | Format lại, kiểm tra Prettier qua                                                                                               |

Migration mới: `UserTokenVersion1794220000000`. Sau khi đổi mật khẩu thành công, người dùng cần đăng nhập lại vì token cũ, kể cả token dùng đổi mật khẩu, đã hết hiệu lực. Token cũ chưa có tokenVersion được coi là phiên bản 0 để tương thích tài khoản chưa đổi mật khẩu.

## Dependency và các điểm còn lại

Đã chạy npm audit và áp dụng bản vá tương thích bằng `npm audit fix --ignore-scripts`, cập nhật lockfile. Nest CLI đã lên 12.0.12.

- **Runtime:** npm audit --omit=dev báo 0 cảnh báo. Xem dependency-audit-runtime.json.
- **Toàn bộ dependency:** còn 5 cảnh báo, gồm 2 high, 1 moderate, 2 low; tập trung ở chuỗi công cụ dev @nestjs/mau → inquirer/external-editor/tmp và undici. Xem dependency-audit.json.
- Npm đề xuất --force để đổi @nestjs/mau về 0.0.6, là thay đổi phá vỡ tương thích. Chưa áp dụng phương án đó. Nếu dùng Mau để deploy, cần xử lý riêng và kiểm tra quy trình triển khai; nếu nhóm không dùng công cụ này có thể loại bỏ dependency/script deploy trong một thay đổi riêng.
- Node hiện tại v24.12.0 thấp hơn yêu cầu engine của một số công cụ build/schematics. Các kiểm tra hiện vẫn qua; nên dùng Node 24 từ 24.15.0 trở lên trong nhánh 24 trước khi cài lại dependency.
- Chưa có endpoint CLOSED, refresh token, quên mật khẩu, xác minh email hay realtime notifications. Đây là phần chưa triển khai, không phải lỗi làm hỏng luồng hiện tại đến RESOLVED.
- Chưa có tác vụ dọn revoked_tokens đã hết hạn. Bảng có expires_at và chỉ mục, nhưng dữ liệu thu hồi sẽ tăng dần theo lượt logout.
- Upload đang lưu ổ đĩa cục bộ, kiểm tra MIME/chữ ký ban đầu; chưa có quét nội dung đầy đủ. Cần sao lưu kho tệp cùng database. Database và filesystem không có chung transaction: ứng dụng có phục hồi khi thao tác lỗi, nhưng nếu tiến trình/máy bị dừng đột ngột giữa hai bước vẫn cần đối soát tệp.
- Nhiều CHECK/DEFAULT/giới hạn độ dài trong tài liệu thiết kế đề xuất chưa được tạo tại tầng database. API hiện kiểm tra bằng DTO/service; nếu có tác nhân ghi trực tiếp database thì vẫn cần bổ sung ràng buộc bằng migration được kiểm tra riêng.
- File AGENTS.md mô tả ObserveModule, nhưng ứng dụng thực tế chưa import ObserveModule. Chưa xác nhận gửi telemetry.

## Cách chạy lại

Hiện hai container và backend đã được bật để thử ngay. Backend chạy bản biên dịch bằng node, không tự reload khi sửa source. PID của tiến trình được ghi tại `.tmp/backend.pid`; stdout/stderr ở `.tmp/backend.stdout.log` và `.tmp/backend.stderr.log`.

Mở Docker Desktop. Nếu Docker chưa chạy, mở từ Start Menu hoặc PowerShell:

```powershell
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
```

Đợi engine sẵn sàng rồi chạy:

```powershell
Set-Location 'C:\Users\admin\Downloads\SafeOps (1)\SafeOps'
docker compose up -d --wait postgres
docker compose -f docker-compose.test.yml -p safeops-test up -d --wait
docker compose ps
docker compose -f docker-compose.test.yml -p safeops-test ps
```

Lần thiết lập mới hoặc sau khi cập nhật source:

```powershell
Set-Location 'C:\Users\admin\Downloads\SafeOps (1)\SafeOps\backend'
npm.cmd run migration:run
npm.cmd run seed:roles
npm.cmd run seed:incident-types
npm.cmd run seed:admin
```

Để chuyển từ server đang chạy nền sang chế độ phát triển, kiểm tra PID tại .tmp/backend.pid vẫn là tiến trình SafeOps do phiên này khởi động, dừng nó rồi chạy:

```powershell
npm.cmd run start:dev
```

Giữ terminal mở. Khi cần dừng, Ctrl+C. Cổng mặc định 3000 chỉ nên có một tiến trình backend. Nếu báo EADDRINUSE, kiểm tra tiến trình đang nghe cổng thay vì mở thêm backend.

Kiểm tra tự động, chạy lần lượt trong backend:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

E2E tự build trước và tắt rate limit riêng trong ứng dụng test. Các bài E2E sử dụng declaration trong dist; không chạy lệnh typecheck đồng thời với build vì Nest xóa/tạo lại dist.

Trong phiên công cụ có sandbox, tsx từng gặp uv_os_get_passwd/ENOMEM; chạy cùng lệnh ngoài sandbox thành công. Đây là giới hạn phiên thực thi đã được kiểm chứng. Nếu máy thực tế gặp lỗi tương tự, có thể dùng bản biên dịch đã kiểm tra:

```powershell
npm.cmd run build
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
node dist/database/seeds/seed-roles.js
node dist/database/seeds/seed-incident-types.js
node dist/database/seeds/seed-admin.js
npm.cmd run start:prod
```

## Thử API bằng Postman

1. Import docs/SafeOps.postman_collection.json.
2. Collection variables: giữ base_url=http://localhost:3000, điền admin_password đúng giá trị ADMIN_PASSWORD trong .env. Không cần đổi mật khẩu hiện có để chạy thử.
3. Chạy Login ADMIN; token tự được lưu vào admin_token.
4. Tạo MANAGER/SECURITY, đăng nhập; đăng ký và đăng nhập REPORTER.
5. Lấy loại sự cố, tạo báo cáo, sửa/upload bằng chứng; MANAGER duyệt và phân công; SECURITY accept → start → complete.
6. Xem nhật ký và notifications. Bỏ qua request optional; reject dùng một sự cố PENDING khác.
7. Các tài khoản test E2E tự được dọn; khi thử Postman bạn tự tạo tài khoản riêng. Nếu chạy lại request tạo cùng email thì 409 là đúng; đăng nhập tài khoản đã có hoặc đổi email.

Danh sách body/query/endpoint đầy đủ nằm trong API.md.

## Dừng dịch vụ khi dùng xong

Dừng backend ở terminal đang chạy bằng Ctrl+C. Với server chạy nền do phiên này khởi động, dùng PID đã kiểm tra ở .tmp/backend.pid. Từ thư mục SafeOps:

```powershell
docker compose -f docker-compose.test.yml -p safeops-test down
docker compose stop postgres
```

Không dùng down -v cho database ứng dụng nếu cần giữ dữ liệu. Các container của dự án khác trên máy không bị thay đổi trong lần kiểm tra này.
