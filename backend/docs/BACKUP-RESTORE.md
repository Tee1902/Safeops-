# Backup và khôi phục database + tệp

Chạy lệnh từ `backend`, dùng Node 24.15+ trong nhánh 24. Script `scripts/backup-restore.mjs` chạy trên Windows/Linux; dùng bộ client PostgreSQL cùng major với server, hoặc `--container` để dùng pg_dump/pg_restore/psql bên trong container PostgreSQL. Không cần cài PostgreSQL client trên Windows nếu dùng container. Các tham số kết nối đọc từ DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE; mật khẩu không truyền trên command line hoặc ghi vào manifest.

Một backup là thư mục chứa `database.dump` dạng custom, cây `uploads/` và `manifest.json` với SHA-256 + kích thước từng tệp. Dump giữ schema, dữ liệu, sequence, migration và ràng buộc. Không bao gồm mật khẩu role PostgreSQL, cấu hình `.env`, khóa JWT, chứng chỉ Caddy hoặc tệp ngoài UPLOAD_DIR. Lưu cấu hình/secrets trong kho riêng theo quy trình của đơn vị vận hành.

## Tạo backup nhất quán

1. Chọn cửa sổ bảo trì, dừng **tất cả** backend instance, worker, seed/migration và mọi tác nhân ghi DB/file. Chặn thao tác quản trị DB trong cửa sổ này. `--writers-stopped` là xác nhận của người vận hành; script không tự kiểm chứng hoặc dừng dịch vụ. Chỉ pg_dump riêng lẻ không đảm bảo nhất quán với ảnh đang thay đổi.
2. Giữ PostgreSQL hoạt động. Đảm bảo UPLOAD_DIR tồn tại. Chọn đường dẫn backup mới, tách khỏi UPLOAD_DIR và ngoài thư mục public/web. Ví dụ backend chạy trên host Windows, DB trong container `safeops-postgres`:

```powershell
node --env-file=.env scripts/backup-restore.mjs backup --output backups/2026-11-16-001 --uploads uploads --writers-stopped --container safeops-postgres
node scripts/backup-restore.mjs verify --input backups/2026-11-16-001
```

3. Chỉ coi thành công khi script kết thúc với exit code 0 và thư mục đích hoàn chỉnh xuất hiện. Lỗi để lại `.incomplete` để điều tra; không sử dụng làm bản khôi phục. Script từ chối ghi đè backup sẵn có hoặc đi qua symbolic link trong cây file. Đối chiếu manifest, số lượng tệp và thời gian tạo với ca bảo trì.
4. Copy bản đã kiểm tra sang nơi lưu trữ tách biệt, mã hóa khi lưu/truyền và phân quyền đọc. POSIX dùng quyền 0700 cho thư mục mới, 0600 cho tệp; trên Windows cần cấu hình ACL của thư mục lưu trữ. Hash phát hiện tệp bị hỏng, không thay thế chữ ký/chống giả mạo từ người sửa được cả manifest.
5. Bật lại writer sau khi backup hoàn tất; ghi nhận thời gian, mã phiên bản ứng dụng/migration, vị trí bản lưu và kết quả verify. Tần suất và thời hạn lưu theo RPO/RTO của nhóm; chưa cài job lịch hoặc tự xóa backup trong thay đổi này.

## Production dùng named volume

Compose production dùng volume `uploads:/app/uploads`, không phải thư mục `backend/uploads` trên host. Dừng toàn bộ writer, lấy ID container backend và PostgreSQL của đúng Compose project bằng `docker compose --env-file .env.production -f docker-compose.prod.yml ps -a -q backend` và `... ps -q postgres`. `docker cp <backend-id>:/app/uploads ./snapshot-uploads` đọc được từ container đã dừng. Sau đó backup với `--uploads snapshot-uploads --container <postgres-id>` và cấu hình `.env.production`. Giữ writer dừng suốt lúc copy file và dump DB. Xóa bản staging theo quy trình bảo mật sau khi kiểm tra bản lưu ngoài máy. Không dùng tệp staging đang được ứng dụng ghi.

## Khôi phục thử vào môi trường tách biệt

1. Giữ nguyên môi trường nguồn. Dùng PostgreSQL cùng major, một database mới **đã tạo và rỗng**, tên kết thúc `_restore` hoặc `_test`, và thư mục upload mới/rỗng. Script từ chối database có bảng/view người dùng, tên đích không đúng hoặc thư mục đã có tệp; không chạy DROP/clean lên dữ liệu cũ. Tài khoản DB cần quyền tạo extension/ràng buộc có trong dump.
2. Dừng writer của môi trường đích; giữ thư mục backup chỉ đọc. Ví dụ đã tạo `safeops_restore` trong cùng PostgreSQL container:

```powershell
node --env-file=.env scripts/backup-restore.mjs restore --input backups/2026-11-16-001 --uploads uploads-restored --database safeops_restore --writers-stopped --container safeops-postgres
```

3. Script kiểm tra toàn bộ inventory/checksum trước khi restore; pg_restore chạy trong một transaction, dừng khi có lỗi. Sau đó copy file và đối chiếu checksum. DB và filesystem không nằm trong cùng transaction: nếu giai đoạn file lỗi, giữ writer dừng, giữ bản backup và dùng môi trường đích mới/rỗng để thử lại; không chuyển ứng dụng sang bản phục hồi dở dang.
4. Trỏ backend thử nghiệm tới DB/thư mục mới. Đối chiếu số bản ghi, migration, FK/sequence, sự cố/phân công/notifications và hash tệp; đăng nhập bằng tài khoản kiểm thử, tải ảnh với đúng quyền và kiểm tra workflow. Không gửi email thật từ môi trường diễn tập. Ghi lại thời gian restore và kết quả để đánh giá RTO.
5. Với named volume, copy **nội dung** `uploads-restored` vào volume của backend đích đã dừng (`docker cp uploads-restored/. <backend-id>:/app/uploads`). Dùng helper container gắn đúng volume để đặt quyền sở hữu `node:node` (UID/GID 1000 trong image hiện tại) và quyền đọc/ghi phù hợp trước khi chạy ứng dụng. Không ghi đè volume nguồn. Chuyển đổi production là bước vận hành riêng sau nghiệm thu bản khôi phục.

## Diễn tập tự động

```powershell
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_POSTGRES_CONTAINER = 'safeops-be3-test-postgres-test-1'
npm.cmd run test:backup
```

Test tự tạo hai database có tên ngẫu nhiên trên PostgreSQL **test cổng 55432**, chạy toàn bộ migration, tạo sự cố và metadata upload, backup, restore và so sánh dữ liệu/file nhị phân/tên tiếng Việt. Kiểm tra từ chối writer chưa dừng, ghi đè, đích có dữ liệu, tên DB không phù hợp và file bị sửa. Cleanup chỉ xóa hai database và thư mục tạm do chính test tạo. CI dùng ID PostgreSQL service qua TEST_POSTGRES_CONTAINER. Có thể dùng TEST_DATABASE_URL riêng nhưng tên database kết nối ban đầu phải kết thúc `_test`; tài khoản test cần CREATEDB.
