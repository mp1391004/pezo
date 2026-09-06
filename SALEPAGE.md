# Pezo salepage

Nhánh `salepage` giữ nguyên core Python ở thư mục gốc và lưu toàn bộ trang bán hàng trong
`salepage/`. Việc cập nhật nhánh này không làm thay đổi nhánh `main` đang chứa core sản phẩm.

## Các đường chính

- `/` — trang bán hàng
- `/admin` — CMS và quản lý khách hàng
- `/api/auth/google` — đăng nhập người mua bằng Google
- `/api/payos/webhook` — webhook xác nhận thanh toán PayOS
- `/workspace` — khu vực làm việc dành cho tài khoản đã thanh toán

Không đưa `.env`, khóa API hoặc dữ liệu thật vào Git. Các giá trị trong `.env.example` chỉ là
tên biến trống để tham khảo.
