# Kiểm chứng bản tích hợp — 11/11/2026

> Kết quả lịch sử của lần ghép ban đầu. Đợt kiểm tra mới nhất có 183 test và kiểm tra stack HTTPS thực cục bộ: [POST_INTEGRATION_REVIEW.md](POST_INTEGRATION_REVIEW.md).

| Kiểm tra | Kết quả |
|---|---|
| `npm run build` | Qua |
| `npm run typecheck` | Qua |
| `npm run lint` | Qua, không cảnh báo ở lần kiểm tra cuối |
| `npm run test:cov` | 13 suite, 155/155 test qua: 117 unit, 16 HTTP contract, 22 PostgreSQL workflow |
| Coverage statements/lines | 97,58% (1821/1866) |
| Coverage branches | 86,81% (395/455) |
| Coverage functions | 98,83% (85/86) |
| `npm run docs:export` | Xuất OpenAPI + 46 request Postman |
| Lockfile | Root dependencies/devDependencies khớp package.json; Docker npm ci thành công |
| Docker Compose dev | Config validate bằng `.env.example` |
| Docker Compose production | Config validate trên bản sao chỉ thay env_file sang `.env.production.example`, không tạo `.env.production` thật |
| Docker build | `safeops-backend:integration-check` build multi-stage thành công, bao gồm npm ci và Nest build trên Linux |
| Migration từ image | Cả 5 migration chạy thành công trên DB mới `safeops_container_test` |
| Smoke runtime từ image | Health 200, bcrypt login 200, refresh 200, logout 200, JWT cùng phiên bị từ chối 401 |
| Dependency audit trong Docker build | Runtime 0 vulnerability; toàn bộ dependency gồm dev: 19 (3 low, 16 moderate) |

PostgreSQL thử riêng được tạo bằng `docker-compose.test.yml`, cổng 55432. Mỗi test workflow dùng schema ngẫu nhiên và dọn sau test. Smoke image dùng database riêng khác; container/database thử được dọn sau khi kiểm tra. Không chạy migration trên database ứng dụng hiện có.

Các ca kiểm tra gồm phân quyền/IDOR, input validation, concurrent xác minh/phân công/refresh, filter không vượt scope, hủy/giao lại, trạng thái/timestamp, đổi role và password thu hồi phiên, audit, owner/claim ảnh, file binary, rollback log/notification/DB/tệp và đóng sự cố.

Coverage đo các service, guards và config theo jest.config.cjs; không đại diện cho kiểm thử UI hoặc TLS thực tế. Chưa deploy domain/TLS thật, chạy GitHub Actions trên remote hoặc UAT frontend. Node host 24.12.0 thấp hơn engine khuyến nghị 24.15, nhưng các lệnh trên đã chạy được; Docker dùng Node 24 hiện hành và cài dependency sạch.
