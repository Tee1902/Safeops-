# Rà soát toàn bộ sau tích hợp — 11/11/2026

## Kết luận

Backend cốt lõi đã chạy qua các luồng kiểm chứng sau khi sửa các lỗi bên dưới. Có thể tiếp tục tích hợp frontend và thử nghiệm nội bộ trên một backend instance. Toàn bộ sản phẩm chưa hoàn thiện: chưa có frontend, gateway realtime, gửi email/push, map/export/phân tích hiệu suất, lịch backup/retention và nghiệm thu trên môi trường thực. Không quy đổi kết quả này thành một phần trăm hoàn thành vì hai nguồn không có đầy đủ đặc tả/nghiệm thu cho mọi thành phần.

Bộ 155 test trước rà soát vẫn qua nhưng chưa phát hiện các lỗi mới. Vì vậy số test hoặc coverage cao không tự chứng minh sản phẩm đã hoàn thiện. Đợt này bổ sung các ca lỗi thực tế, nâng cấp DB cũ và hợp đồng Postman; kết quả cuối là **183/183 test, 15 suite**, build/typecheck/lint đều qua.

## Lỗi và điểm thiếu đã xử lý

| Mức | Vấn đề trước sửa và tác động | Cách sửa / bằng chứng |
|---|---|---|
| Cao | Security bị hủy phân công không đọc được GET incident nhưng vẫn nhận toàn bộ mô tả, tọa độ, địa chỉ và trạng thái incident qua GET `/assignments/me?status=CANCELLED` | Giữ lịch sử phân công, bỏ đối tượng incident khi không còn quyền qua phân công đó. Nếu chính Security là người báo cáo, vẫn được giữ chi tiết của báo cáo mình. Ca tái hiện trước sửa thất bại, sau sửa qua. |
| Vừa | Xóa ảnh tạo qua `/uploads` rồi gắn vào incident chỉ xóa attachment/tệp, còn `uploaded_files`; ảnh có thể được gắn lại dù tệp đã mất | Xóa cả metadata upload trong cùng transaction và khóa cùng bản ghi upload với thao tác gắn ảnh. Kiểm tra không gắn lại, không claim đồng thời hai lần, và rollback khôi phục metadata/tệp khi ghi log lỗi. |
| Vừa | incidentTypeId/roleId/ID danh mục quá giới hạn int4 được chuyển xuống PostgreSQL, gây HTTP 500 | DTO và pipe giới hạn ID trong 1…2147483647; input sai trả 400 trước khi query. Kiểm thử cả body, query và path. |
| Vừa | Seed Admin thấy email đã tồn tại là báo thành công, kể cả tài khoản đó là Reporter | Kiểm tra role và trạng thái; email bị chiếm hoặc tài khoản bị khóa làm seed thất bại rõ ràng, không tự nâng quyền hoặc đổi mật khẩu tài khoản. Đã tái hiện trường hợp Reporter và kiểm tra giữ nguyên role. |
| Vừa | Production chấp nhận JWT_SECRET nguyên văn từ file mẫu vì chỉ kiểm tra độ dài | Chặn các giá trị mẫu bắt đầu `replace-with-`/`change-me` trong production. Không suy diễn rằng kiểm tra này đo được độ ngẫu nhiên của mọi secret. |
| Vừa | Một số mẫu Postman không gửi được: mã loại sự cố chứa ký tự không hợp lệ; phone/avatarUrl là object; email cố định trong Swagger đè biến `{{email}}` | Sửa generator, ghi rõ kiểu String cho phone/avatarUrl trong OpenAPI; kiểm tra 19 body Postman qua DTO/ValidationPipe thật sau khi thay biến. Xuất lại 46 request. |
| Cấu hình | `.env` hiện có thiếu PGADMIN_DEFAULT_PASSWORD khiến lệnh Compose dev dừng ngay từ bước nội suy | Bổ sung credential pgAdmin ngẫu nhiên chỉ trong `.env` cục bộ, không đổi secret ứng dụng sẵn có. `docker compose --env-file backend/.env config --quiet` đã qua. Secret không nằm trong ZIP. |
| Kiểm thử | Coverage còn tham chiếu file incident-workflow.js đã bị thay thế, bỏ qua các helper workflow và response/error dùng chung | Đo thêm common/workflow, pipe, filter và interceptor. Coverage cuối được tính trên phạm vi mới; không so sánh hai tỷ lệ như cùng một mẫu đo. |

Code liên quan: `assignments/assignments.service.ts`, `attachments/attachments.service.ts`, DTO ID, `common/positive-int.pipe.ts`, `database/seeds/seed-admin.ts`, `config/env.validation.ts`, `users/dto/update-user.dto.ts`, `scripts/export-postman.mjs`, `jest.config.cjs`.

## Kiểm chứng cuối

| Hạng mục | Kết quả |
|---|---|
| Build / TypeScript / lint | Qua; lint không cảnh báo |
| Unit | 118 test qua |
| HTTP contract với pipeline Nest/Passport thật, persistence mock | 16 test qua |
| PostgreSQL workflow | 26 test qua |
| Nâng cấp DB cũ | 4 test qua |
| Body Postman so với DTO thật | 19 test qua |
| Statements / lines | 97,86% (2065/2110) |
| Branches | 87,84% (448/510) |
| Functions | 98,98% (98/99) |
| OpenAPI / Postman | 38 path, 46 thao tác; schema và mẫu request được xuất lại |
| npm audit runtime | 0 cảnh báo tại thời điểm rà soát |
| npm audit cả dev | 19 cảnh báo: 3 low, 16 moderate; 0 high/critical |
| Cài/build Docker | Qua bằng lockfile hiện tại, image `safeops-backend:review` |
| Stack theo cấu hình production | PostgreSQL 16 healthy → 5 migration thành công → backend healthy → Caddy chạy |
| Bảo vệ container | UID 1000/user node, root filesystem read-only, drop ALL capabilities; không có `/app/.env` trong image |
| HTTPS qua Caddy | Qua với CA thử cục bộ được xác minh, không tắt kiểm tra chứng chỉ |
| Cookie và proxy | Secure/HttpOnly/SameSite=Lax; Origin không hợp lệ bị 403; login/rotation/logout và thu hồi JWT cùng phiên qua HTTPS đều qua |
| Tệp qua HTTPS | Upload nhiều ảnh → gắn incident → tải ảnh có JWT qua proxy và volume đều qua |
| Swagger production | Tắt theo cấu hình, `/api/docs` trả 404 |

Test database dùng cổng 55432 và schema ngẫu nhiên. Nâng cấp DB được kiểm tra với: chỉ có MANAGER thì giữ ID; đã có cả MANAGER/OPERATOR thì gộp tham chiếu đúng; email trùng sau chuẩn hóa làm rollback toàn bộ; revert/reapply không xóa user. Email sau chuẩn hóa và việc gộp hai role không thể khôi phục đầy đủ dữ liệu nguyên bản chỉ bằng migration down: vẫn cần backup trước nâng cấp DB thực.

Stack production thử dùng project Docker `safeops-review-production`, database/volume/secret riêng và chỉ mở `127.0.0.1:18443`. Chứng chỉ là CA cục bộ, chưa phải chứng chỉ public cho domain doanh nghiệp. Không chạy migration trên DB ứng dụng hiện có. Các container/volume thử được dọn sau kiểm tra; giữ lại image cục bộ để đối chiếu.

## Mức hoàn thiện theo thành phần

| Thành phần | Đánh giá hiện tại |
|---|---|
| Auth/JWT/refresh/RBAC/Origin/rate limit | Đã có và đã kiểm chứng các luồng chính, phiên hết hạn/thu hồi và request sai quyền |
| Users/Admin/profile/audit | Đã có; đã sửa seed và kiểm tra quyền, thay role, khóa, đổi mật khẩu/email, không lộ password hash |
| Loại sự cố / sự cố / phân công / logs / attachments | Luồng tạo → duyệt → giao → tiếp nhận → xử lý → hoàn tất → đóng, từ chối/hủy/giao lại và rollback đã kiểm chứng |
| Notifications | Có REST và scope theo người nhận; chưa gửi email/push/realtime |
| Dashboard | Có tổng số/theo trạng thái; chưa có analytics hiệu suất, export hay bản đồ |
| Frontend | Chưa có source trong cả hai nguồn; chưa có UI/UAT trên trình duyệt thực |
| Gateway | Chỉ có helper xác thực, chưa có Socket.IO transport/handler/room/event sau commit |
| SSO | Chưa triển khai, được BE1 yêu cầu hoãn sang giai đoạn 2 |
| Docker/TLS | Đã kiểm chứng stack thử cục bộ; chưa triển khai domain/DNS/secrets thực |
| CI/Git | Có workflow và DB test; chưa chạy trên GitHub remote. Repository hiện không có commit và source đang untracked; chưa xác minh branch protection/reviewer |
| Theo dõi vận hành | Chưa có ObserveModule đăng ký trong AppModule dù dependency và AGENTS.md có nhắc Observe; chưa có telemetry/alerting được cấu hình |

## Việc còn cần làm và rủi ro vận hành

1. **Hoàn thiện sản phẩm:** cần source frontend và đặc tả/triển khai các phần realtime/email/map/export/analytics muốn đưa vào nghiệm thu. Không thể kiểm chứng giao diện chỉ bằng backend test.
2. **Kho tệp:** hiện lưu local; nhiều instance cần shared storage. Chưa có quota/retention/dọn ảnh upload chưa gắn vào sự cố. Nếu từng xóa ảnh bằng bản tích hợp trước sửa, có thể đã có metadata cũ trỏ tới tệp mất: cần đối chiếu kho tệp/DB thực trước khi dọn, không tự xóa chứng cứ.
3. **Backup và khôi phục:** tài liệu có hướng dẫn, chưa có job tự động và bài kiểm tra khôi phục backup của dữ liệu doanh nghiệp. Cần backup đồng bộ DB và uploads, xác nhận retention audit/PII.
4. **Dependency dev:** 19 cảnh báo thuộc chuỗi Jest/glob/minimatch/deepmerge, lưu bằng chứng trong [review-audit.json](review-audit.json). Không áp dụng `audit fix --force` vì npm đề xuất thay Jest xuống major cũ, cần đánh giá migration công cụ riêng. Runtime audit riêng ở [review-audit-runtime.json](review-audit-runtime.json).
5. **Môi trường:** Node host 24.12.0 thấp hơn engines khuyến nghị 24.15 trong nhánh 24; các lệnh host đã qua, Docker build đã qua. Nên dùng phiên bản Node phù hợp khi cài mới/CI.
6. **Giới hạn kiểm chứng:** chưa có tải đồng thời ở quy mô sản xuất, thử độ bền dài hạn, phân tích ảnh/virus đầy đủ hoặc kiểm toán độc lập. Magic bytes chỉ là kiểm tra định dạng. Test đang chạy một backend instance và DB thử; tỷ lệ coverage chỉ bao phủ nhóm service/guard/config/helper đã cấu hình, không phải mọi dòng trong repository.

## Chạy lại kiểm tra

Tại `SafeOps`: `docker compose -f docker-compose.test.yml -p safeops-test up -d --wait`.

Tại `SafeOps/backend`:

```powershell
npm.cmd run test:cov
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run docs:export
```

`test:cov` tự build và compile test trước. Sau khi dùng, từ `SafeOps`: `docker compose -f docker-compose.test.yml -p safeops-test down`.

Bản source sau sửa được đóng gói riêng thành `SafeOps-reviewed.zip` ở workspace; bản ZIP tích hợp trước rà soát được giữ nguyên để đối chiếu. ZIP không chứa `.env`, secret, database, uploads hoặc node_modules.
