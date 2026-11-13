# Vận hành SafeOps

> Tài liệu lịch sử/tham khảo trước bản ghép 11/11/2026. Hợp đồng và lệnh chạy hiện hành nằm trong [README](../README.md), [API-CONTRACT](API-CONTRACT.md) và [INTEGRATION](INTEGRATION.md).

## Development

Yêu cầu Node.js 24+, npm, Docker Engine/Desktop đang chạy với Compose v2 có `include`. Git repository hiện nằm trong `backend`; các file Compose ở thư mục cha chỉ là wrapper. Các lệnh bên dưới chạy từ `backend`.

```powershell
Copy-Item .env.example .env
# Chỉnh các giá trị mật khẩu và JWT_SECRET trong .env trước khi dùng.
docker compose up -d
npm.cmd ci --ignore-scripts
npm.cmd run migration:run
npm.cmd run seed:incident-types
# Tự cấu hình ADMIN_PASSWORD mạnh, >=12 ký tự và <=72 byte UTF-8 trong .env.
npm.cmd run seed:admin
npm.cmd run start:dev
```

Trên Linux/macOS thay `npm.cmd` bằng `npm`. Roles được tạo bởi migration; `seed:roles` có thể chạy lại. Seed Admin không ghi đè tài khoản đã tồn tại. Không có tài khoản/mật khẩu Admin được hard-code. `.env.example` chỉ là mẫu, `.env` thật bị gitignore.

- API: `http://localhost:3000/api`; Swagger `/api/docs`; health `/api/health`.
- pgAdmin: `http://localhost:5050`; DB host từ container pgAdmin là `postgres`, port `5432`.
- Mailhog UI: `http://localhost:8025`, SMTP `localhost:1025` khi API chạy trên host.
- FE dev dự kiến `http://localhost:3001`; giữ FRONTEND_URL đúng origin, không thêm path hoặc dấu `/` cuối.

Nếu đã có `.env`, bổ sung các biến từ `.env.example`, giữ lại thông tin kết nối hợp lệ. App sẽ dừng trước khi mở DB nếu thiếu/sai cấu hình. Không ghi đè `.env` cũ bằng mẫu khi có dữ liệu cần giữ.

Compose cũ dùng PostgreSQL 17; cấu hình mới dùng volume **postgres16_data riêng**. Không mount volume PostgreSQL 17 vào PostgreSQL 16. Giữ volume cũ, xuất/kiểm tra backup rồi import sang database mới khi cần giữ dữ liệu. Source thay đổi không tự chạy migration hoặc thay đổi database trên máy này.

## Kiểm tra trước khi bàn giao

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:cov
npm.cmd run test:e2e
npm.cmd run docs:export
npm.cmd audit --omit=dev
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet --no-env-resolution
```

Jest sử dụng TypeScript compiler để giữ metadata decorator, chạy ESM bằng `--experimental-vm-modules`; không cần Babel/ts-jest. `test:compile` xuất tạm `.test-dist`, không commit. Unit test có ngưỡng coverage 80% statements/branches/functions/lines cho service, guards và config. HTTP tests chạy pipeline NestJS/Passport/validation/Throttler thật với persistence/service mock; không thay thế integration test PostgreSQL của BE2. Export OpenAPI cũng dựng app với datasource mock, không kết nối DB và không đọc `.env` thật.

CI nằm trong `.github/workflows/ci.yml`, chạy backend typecheck/lint/build/unit coverage/HTTP/OpenAPI và audit runtime. Khi có `frontend/package.json` trong cùng repository, CI chạy cả typecheck/lint/test/build Next.js; FE cần scripts `lint`, `test`, `build` (test nhận `--runInBand`). Hiện workspace không có frontend nên job đó được skip có chủ ý. Nếu gộp thành monorepo, đưa `.github` lên root mới. Thiết lập branch protection cho `develop/main`: bắt buộc check **SafeOps CI / required**, ít nhất một reviewer và không cho bypass. File workflow không tự cấu hình quyền trên GitHub.

## Production / HTTPS

```powershell
Copy-Item .env.production.example .env.production
# Thay DB_PASSWORD, JWT_SECRET, SMTP và các URL thành giá trị thực.
# Trỏ SITE_ADDRESS về server; mở TCP 80/443 và UDP 443 nếu dùng HTTP/3.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend migrate caddy
```

Compose build image multi-stage, đợi PostgreSQL healthy, chạy migration một lần rồi khởi động API; Caddy chờ health API trước khi nhận traffic. Caddy tự lấy/gia hạn chứng chỉ khi DNS và cổng đã đúng. `.env.production` chỉ mount qua environment, không nằm trong image. Không bật Swagger public ở production mặc định; bật tạm trên staging nếu cần kiểm chứng rồi tắt. CORS allowlist phải khớp origin FE. Refresh cookie SameSite=Lax cần FE/API cùng site; mẫu Caddy phục vụ cùng origin.

Khởi tạo Admin bằng lệnh chủ động sau khi điền ADMIN_PASSWORD tạm thời:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend npm run seed:admin:prod
```

Sau seed, xóa ADMIN_PASSWORD khỏi cấu hình dài hạn, cập nhật/recreate container trong đợt vận hành phù hợp. Seed loại sự cố production nếu cần: `docker compose --env-file .env.production -f docker-compose.prod.yml exec backend node dist/database/seeds/seed-incident-types.js`.

Repo hiện chưa có Next.js. Khi FE1 bàn giao `../frontend`, bật `output: 'standalone'`, chuẩn bị `public`, copy `deploy/.dockerignore.nextjs` thành `../frontend/.dockerignore`, dùng Dockerfile và overlay đã chuẩn bị:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml -f deploy/docker-compose.frontend.yml up -d --build
```

Các `NEXT_PUBLIC_*` là biến công khai được nhúng ở build time, không chứa bí mật; đổi URL phải build lại frontend. Overlay thêm Next.js và đổi Caddy để proxy route FE và Socket.IO. Gateway BE3-A dùng `/socket.io/` trên cùng port API; cả Caddy mặc định và overlay đều proxy đường dẫn này. Chạy một backend instance và xem [hợp đồng/vận hành realtime](WEBSOCKET-CONTRACT.md) trước khi tăng replica.

## Backup, bảo trì và sự cố

Phối hợp BE2 lập lịch `pg_dump` và backup volume upload, mã hóa và giới hạn quyền đọc backup; lưu chứng chỉ Caddy ở volume `caddy_data`. Thử restore vào môi trường tách biệt trước UAT. Rollback ứng dụng dùng image đã gắn tag phiên bản; không tự `migration:revert` trên production khi chưa đánh giá dữ liệu. Migration mới có thể đổi role/email nên rollback schema không thể khôi phục nguyên văn mọi giá trị email trước chuẩn hóa.

Xóa session/blacklist đã hết hạn theo lịch bằng query tham số hóa/DB job đã duyệt retention, ví dụ điều kiện `expires_at < now() - interval '30 days'`. Không xóa audit theo session; retention audit/PII cần doanh nghiệp xác nhận. File mồ côi cần job so khớp `uploaded_files` với `incident_attachments` trước khi xóa; chưa bật job xóa tự động để tránh mất chứng cứ. Không dùng `docker compose down -v` trên môi trường có dữ liệu cần giữ.

Health 503: kiểm tra PostgreSQL và migration; 401 sau nâng cấp: login lại do JWT cũ thiếu session; refresh 403: kiểm tra Origin/CORS; cookie không gửi: kiểm tra HTTPS, Path `/api/auth`, SameSite và `credentials: include`; upload 413: kiểm tra giới hạn <=5 MiB cả API và proxy. Không gửi token/password/cookie vào issue/log hỗ trợ.
