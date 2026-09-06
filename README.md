# Pezo

Biến transcript thô thành file nội dung hoàn chỉnh: hiệu đính lại lời nói, chia mục, và vẽ ảnh minh hoạ theo từng mục — chạy nhiều transcript song song.

Mỗi transcript cho ra một folder:

```
1/
  noi-dung.docx          # nội dung đã chia mục, ảnh chèn sẵn đúng chỗ
  full-transcript.docx   # transcript đã sửa lỗi bóc băng, giữ nguyên lời nói
  ten-theo-tieu-de.png   # ảnh minh hoạ, đặt tên theo tiêu đề mục
```

## Cách chạy

```bash
git clone https://github.com/<user>/pezo.git
cd pezo
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./run.sh
```

Mở `http://localhost:5090`.

## Cài đặt API key

Pezo dùng API của [Kyma](https://kymaapi.com?aff=deal) — một cổng dùng chung cho nhiều model AI, trả tiền theo lượng dùng.

1. Đăng ký tài khoản tại [Kyma](https://kymaapi.com?aff=deal) và nạp một ít credit.
2. Vào [kymaapi.com/keys](https://kymaapi.com/keys) tạo key mới.
3. Copy key, dán vào ô Cài đặt ở màn hình đầu tiên của Pezo.

Key được lưu trong `localStorage` của trình duyệt bạn, gửi kèm từng request tới server chạy trên máy bạn. Key không ghi xuống đĩa và không nằm trong file kết quả.

Nếu tự host cho riêng mình, có thể đặt sẵn biến môi trường `KYMA_API_KEY` thay cho việc nhập trong trình duyệt.

## Quy trình

1. **Hiệu đính** — transcript cắt thành từng đoạn ~6.000 ký tự, chạy song song, sửa lỗi nhận dạng (build → "Bill", CRM → "cim", MVP → "MV MVP"), thêm dấu câu, giữ nguyên 100% ý người nói.
2. **Viết nội dung** — chia 4–8 mục, in đậm số liệu và thuật ngữ, câu chốt đưa vào blockquote, và đánh dấu chỗ nên có ảnh minh hoạ kèm mô tả cụ thể.
3. **Vẽ ảnh** — mỗi mô tả minh hoạ thành một ảnh `gpt-image-2` theo đúng một design system cố định (navy + xanh dương, nền trắng, icon nét mảnh).
4. **Rà soát rồi mới tải** — sửa nội dung trực tiếp trên trang, vẽ lại hoặc thay ảnh, xong mới xuất file.

## Sửa nội dung trước khi tải

- Khung soạn thảo hiển thị đúng định dạng, có thanh công cụ H1 / H2 / H3 / đậm / nghiêng / gạch đầu dòng / trích dẫn / chèn link.
- Mỗi khối ảnh có: ô đổi tên file, **Vẽ lại** (theo mô tả mới nhất), **Ảnh từ máy** (thay bằng ảnh của bạn), **Xoá**.
- **Chèn ảnh từ máy** trên thanh công cụ để thêm ảnh ngoài vào bất kỳ vị trí nào.
- Ảnh bạn tự chèn mang nhãn `[ẢNH TỰ CHÈN]` và không bao giờ bị AI vẽ đè.

## Chi phí

Phần chữ rất rẻ (vài xu mỗi transcript). Phần lớn chi phí nằm ở ảnh: **$0,072 mỗi ảnh** với `gpt-image-2`.

Muốn xem nội dung trước cho tiết kiệm thì bỏ tick *Tạo ảnh minh hoạ luôn*, ưng rồi mới bấm **Lưu + cập nhật ảnh** để vẽ.

## Model

| Bước | Model | Ghi chú |
|---|---|---|
| Hiệu đính | `gemini-3.5-flash-lite` | luôn dùng model nhanh nhất, việc cơ học |
| Viết nội dung | chọn trong UI | mặc định `gemini-3.7-flash` |
| Vẽ ảnh | `gpt-image-2` | |

Đổi bằng biến môi trường `SCRIPT_MODEL`, `TEXT_MODEL`, `IMAGE_MODEL`.

## Ghi chú

- Trạng thái ghi xuống `runs/`, nên tắt server giữa chừng không mất bài đã chạy xong.
- Transcript nên chia theo từng phần thay vì dán cả buổi vài trăm nghìn ký tự — vừa nhanh vừa ra bố cục mục hợp lý hơn.
