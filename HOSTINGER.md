# Bản Pezo tích hợp trên Hostinger

Nhánh `hostinger-integrated` giữ nguyên core Python ở thư mục gốc để tiếp tục phát triển và có
thêm `hostinger-app/`: bản Node.js dành cho Hostinger Business/Cloud.

Bản tích hợp gồm:

- salepage và CMS;
- đăng nhập người mua bằng Google;
- thanh toán và xác nhận tự động qua PayOS;
- tự cấp quyền trọn đời cho tài khoản đã thanh toán;
- dashboard Pezo và toàn bộ quy trình transcript → nội dung → ảnh → DOCX/ZIP;
- khóa Kyma do từng người dùng tự nhập, chỉ giữ trong trình duyệt của họ;
- dữ liệu, file kết quả và ảnh upload nằm ngoài thư mục build để không mất khi triển khai lại.

Các nhánh độc lập:

- `main`: core Python gốc;
- `salepage`: bản lưu riêng của salepage/CMS;
- `hostinger-integrated`: bản chạy thật trên Hostinger.

Không commit khóa hoặc dữ liệu thật. Các tệp `.env.example` chỉ chứa tên biến trống.
