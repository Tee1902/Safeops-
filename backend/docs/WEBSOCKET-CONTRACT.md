# SafeOps Socket.IO — BE3-A

Server dùng cùng host/port với REST, namespace `/`, transport path `/socket.io/`. Ví dụ dev: `http://localhost:3000`, frontend origin `http://localhost:3001`. Đây là Socket.IO, không phải raw WebSocket. Backend/proxy đã hỗ trợ polling và WebSocket upgrade.

## Kết nối và phân quyền

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: accessToken },
  reconnection: true,
});

socket.on('realtime:ready', async () => {
  // Chạy sau cả kết nối đầu tiên và reconnect.
  // Xóa marker vị trí cũ; tải lại incidents, notifications và assignments/me
  // bằng REST với Bearer token và bộ lọc/phân trang hiện tại.
  await refreshAuthorizedViews();
});

socket.on('incident:created', () => refreshIncidents());
socket.on('incident:updated', () => refreshIncidents());
socket.on('assignment:created', () => refreshAssignments());
socket.on('assignment:updated', () => refreshAssignments());
socket.on('notification:created', () => refreshNotifications());
socket.on('notification:read', () => refreshNotifications());
```

Handshake nhận JWT access token qua `auth.token` hoặc header `Authorization: Bearer ...`; không nhận token qua query URL. Token phải còn hạn, đúng issuer/audience/chữ ký, session chưa bị thu hồi, user active và role hợp lệ. Sai token trả `connect_error` với `UNAUTHORIZED`. Origin trình duyệt phải nằm trong `FRONTEND_URL`; client native không có Origin vẫn cần JWT.

Server tự join `user:{uuid}` và `role:{role viết thường}`. Client không có API tự join/subscribe room. Dữ liệu nghiệp vụ chỉ đi tới `role:operator`, `role:admin` và user room có quyền với tài nguyên. Server kiểm tra lại session trước mỗi lần gửi/nhận dữ liệu và định kỳ 15 giây; hết hạn/thu hồi/đổi role sẽ ngắt kết nối. Khi token hết hạn, FE refresh bằng cookie, cập nhật `socket.auth = { token: newAccessToken }`, rồi `socket.connect()`; không reconnect vô hạn với token cũ.

## Sự kiện server → client

| Event | Payload | Người nhận |
|---|---|---|
| `realtime:ready` | `{resyncRequired:true}` | Socket vừa kết nối |
| `incident:created` | `{incidentId,status,severity,updatedAt}` | Admin/Operator, người báo cáo |
| `incident:updated` | `{incidentId,status,severity,updatedAt}` | Admin/Operator, người báo cáo, Security có phân công chưa hủy (kể cả COMPLETED) |
| `assignment:created` | `{assignmentId,incidentId,status}` | Các người có quyền nêu trên và nhân viên được giao |
| `assignment:updated` | `{assignmentId,incidentId,status}` | Các người có quyền nêu trên và nhân viên của phân công vừa thay đổi |
| `notification:created` | `{notification,unreadCount}` | Chỉ `user:{notification.userId}` |
| `notification:read` | `{unreadCount}` | Các phiên của chính người nhận |
| `security:location` | `{userId,assignmentId,incidentId,latitude,longitude,updatedAt}` | Chỉ Admin/Operator |
| `security:location-cleared` | `{userId,assignmentId}` | Chỉ Admin/Operator |

`notification` có cùng các trường như REST `/notifications`. Các event incident/assignment chỉ báo thay đổi; FE tải dữ liệu chi tiết bằng REST theo quyền hiện tại. Khi CANCELLED, Security nhận event phân công và thông báo cá nhân để xóa màn hình cũ; không còn nhận event incident qua phân công đó. Payload không chứa email, token, mô tả hay thông tin người dùng.

Các mutation create/update/verify/reject/assign/accept/start/complete/cancel/close chỉ gọi publisher **sau khi `await DataSource.transaction(...)` thành công**. Notifications được lưu cùng transaction. Rollback không phát sự kiện hoặc gửi email. Email lỗi không làm thất bại nghiệp vụ đã commit.

Socket.IO không lưu lịch sử phát lại; REST là nguồn trạng thái chính xác. Mất kết nối/restart có thể làm lỡ event. Mỗi `realtime:ready` phải tải lại REST và xóa vị trí cũ; nhiều event sát nhau nên gộp/debounce refetch. Không cộng badge mù từ event vì một notification có thể đã được đọc trong tab khác; dùng `unreadCount` rồi tải lại danh sách khi cần.

## Chia sẻ vị trí có đồng ý

Chỉ user SECURITY có phân công ASSIGNED/ACCEPTED/IN_PROGRESS và incident ASSIGNED/IN_PROGRESS mới được bật. Không tự bật khi nhận nhiệm vụ hoặc reconnect.

```ts
// Chỉ gọi sau khi người dùng chủ động đồng ý.
const consent = await socket.timeout(3000).emitWithAck(
  'security:location-sharing', { assignmentId, enabled: true },
);
if (consent.success) {
  await socket.timeout(3000).emitWithAck('security:location', {
    assignmentId, latitude: 10.7, longitude: 106.6,
  });
}

// Gọi khi người dùng tắt chia sẻ; dừng cả geolocation watcher ở FE.
await socket.timeout(3000).emitWithAck('security:location-sharing', {
  assignmentId, enabled: false,
});
```

Ack: `{success:true,data:{enabled:boolean}}` hoặc `{success:true,data:{accepted:true}}`. Lỗi: `{success:false,error:{code:"VALIDATION_ERROR"|"FORBIDDEN"|"RATE_LIMITED"|"INTERNAL_ERROR"}}`.

- Tọa độ phải là số hữu hạn, latitude [-90,90], longitude [-180,180]; UUID v4; từ chối thuộc tính ngoài DTO. Thời gian cập nhật do server đặt.
- Tối đa một cập nhật/5 giây/user, kể cả đổi tab hoặc tắt/bật lại. FE có thể lấy vị trí thường xuyên hơn nhưng chỉ gửi theo giới hạn.
- Đồng ý gắn với socket và assignment; một assignment chỉ có một socket đang chia sẻ. Bật từ tab mới thay thế tab cũ. Tắt, disconnect, hoàn thành/hủy nhiệm vụ hoặc hết quyền làm mất đồng ý và phát `security:location-cleared`.
- Server không lưu tọa độ vào DB hoặc cache; không có lịch sử vị trí. Admin/Operator hiển thị từ stream và xóa khi nhận cleared, mất kết nối, reconnect hoặc không có cập nhật mới trong 15 giây.

## Vận hành

Chạy một backend instance. Room/consent/rate limit hiện nằm trong bộ nhớ instance; chưa cấu hình Redis adapter cho nhiều replica. SMTP dùng hàng đợi bộ nhớ giới hạn 1.000 mục, tối đa 4 email đang gửi, timeout kết nối 5 giây/socket 10 giây. Mất process/queue đầy/SMTP lỗi có thể mất email; notifications trong PostgreSQL vẫn còn. Cần outbox/job queue bền vững nếu đưa yêu cầu retry/delivery guarantee vào phạm vi tiếp theo.

Email tự động tới Admin/Operator active khi tạo CRITICAL hoặc nâng severity từ mức khác lên CRITICAL; email phân công chỉ tới Security active được giao nhiệm vụ. Nội dung gồm liên kết `${FRONTEND_URL đầu tiên}/incidents/{id}`, không đính kèm chi tiết nhạy cảm. SMTP mặc định từ `.env.example`: localhost:1025, Mailhog UI localhost:8025. `MAIL_PORT=465` dùng TLS ngay khi kết nối; cổng khác dùng STARTTLS nếu SMTP hỗ trợ.

Chạy migration trước khi triển khai: `npm run migration:run`. Migration `Be3NotificationPagination1794510000000` bổ sung index cho phân trang notifications; `Be3IncidentPagination1794510100000` thêm index `(created_at,id)` để phân trang incidents. Không thêm bảng hay lưu vị trí. Xem số đo thực tế và kiểm tra hồi quy tại [BE3-VALIDATION.md](BE3-VALIDATION.md).
