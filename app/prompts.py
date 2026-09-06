from pathlib import Path

CONTENT_SYSTEM = (Path(__file__).parent / "prompt_content.md").read_text(encoding="utf-8")

SCRIPT_SYSTEM = """Bạn là biên tập viên hiệu đính transcript tiếng Việt.

INPUT: transcript bóc tự động từ CapCut — sai chính tả, thiếu dấu câu, lẫn tiếng Anh bị phiên âm sai
(build -> "Bill/Xuân", CRM -> "cim/serum B", MVP -> "MV MVP", product -> "podac", architecture -> "key texture").

NHIỆM VỤ: trả lại ĐÚNG kịch bản đó, đầy đủ, không rút gọn, không tóm tắt, không bỏ câu nào — chỉ sửa:
1. Lỗi nhận dạng giọng nói, sai chính tả, sai tên riêng / thuật ngữ.
2. Thuật ngữ tiếng Anh viết lại đúng dạng gốc (build, CRM, MVP, product, architecture, funnel, workflow...),
   giữ nguyên tiếng Anh, KHÔNG dịch sang tiếng Việt.
3. Thêm dấu câu, viết hoa, tách câu, tách đoạn cho dễ đọc.
4. Bỏ từ đệm và lặp vô nghĩa ("à", "ừm", "cái cái cái") khi chúng không mang ý.

CẤM:
- Cấm thêm ý mới, ví dụ mới, số liệu mới.
- Cấm đổi cách nói, cấm "văn vẻ hoá", cấm rút gọn.
- Chỗ nghe không rõ thì giữ nguyên như transcript, không đoán.

OUTPUT: chỉ văn bản kịch bản đã hiệu đính. Không mở đầu, không giải thích, không markdown fence."""

IMAGE_STYLE = """STYLE — bắt buộc tuân thủ tuyệt đối (Build to Own design system):
- Clean business infographic, khong phai anh minh hoa nghe thuat, khong photo, khong 3D, khong cartoon.
- Nen trang tinh #FFFFFF, rat nhieu khoang trang, canh le goc 80-100px.
- Bang mau: navy #0B1F4D, blue #1261F5, blue dam #0649D8, blue nhat #EAF2FF, blue rat nhat #F5F8FF,
  chu chinh #10214A, chu phu #5F6F91, vien #CEDAF2. 80-90% hinh chi dung navy + blue + trang + xam.
  Chi dung xanh la #16A05D / cam #F4A000 / do #E8313D khi co y nghia Dung-Sai, Pass-Fail, Truoc-Sau.
- Card bo goc 20px, vien mong 1.5px mau #CEDAF2. Card nhan manh: vien 2px #1261F5. Card nhan manh manh: nen #1261F5 chu trang.
- Pill / step badge: nen #1261F5, chu trang, bo goc tron hoan toan.
- Icon dang line don gian kieu Lucide, net mong, mau blue. Khong emoji, khong icon 3D, khong clipart.
- Mui ten: main flow #1261F5 day 3px; phu #7180A2 day 2px; vong lap la duong cong; phu thuoc la net dut.
- Font sans-serif hien dai kieu Inter. Tieu de dam mau navy. Chu it, khong doan van dai.
- Bong do rat nhe hoac khong co. Khong gradient nang. Khong khung vien trang tri. Khong watermark.
- Ti le 16:9, trong nhu slide thuyet trinh SaaS / AI cao cap.

QUY TAC CHU TRONG ANH:
- KHONG ve tieu de / heading / title o dau anh. Khong ve dong chu chu de. Khong ve subtitle, caption, so trang.
  Chi ve so do va cac nhan chu ben trong tung o / tung khoi.
- Chi ghi dung nhung nhan chu duoc liet ke ben duoi, khong tu them chu nao khac.
- Moi nhan toi da 5 tu. Chu phai viet dung chinh ta TIENG VIET CO DAU, ro net, khong bi cat, khong tran ra ngoai o.

NOI DUNG CAN VE:
"""

def image_prompt(desc: str, section_title: str) -> str:
    return (f"{IMAGE_STYLE}Boi canh (CHI de hieu ngu canh, TUYET DOI khong viet cau nay len anh): {section_title}\n\n"
            f"Mo ta minh hoa: {desc}\n")
