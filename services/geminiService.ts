import { GoogleGenAI } from "@google/genai";
import { DrawingOptions } from "../types";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const SYSTEM_INSTRUCTION = `
Bạn là một trợ lý chuyên nghiệp hỗ trợ giáo viên toán học vẽ hình minh họa cho bài giảng (Geometry Visualizer).
Nhiệm vụ: Chuyển đổi mô tả văn bản thành mã SVG (Scalable Vector Graphics) chính xác về toán học và thẩm mỹ.

QUY TẮC CỐT LÕI:
1. ĐẦU RA: Chỉ trả về mã SVG. KHÔNG markdown, KHÔNG giải thích. Bắt đầu <svg... kết thúc </svg>.
2. VIEWBOX: Sử dụng viewBox="0 0 500 500". Padding an toàn 40px.

QUY TẮC NÉT VẼ 3D (QUAN TRỌNG NHẤT - PHẢI TUÂN THỦ):
Hãy tưởng tượng hình không gian trong hệ toạ độ hoặc hình chiếu trục đo thông dụng trong sách giáo khoa Toán:
1. ĐƯỜNG BAO (Silhouette): Tất cả các cạnh tạo nên viền ngoài cùng của hình chiếu 2D LUÔN LÀ NÉT LIỀN (Solid).
2. CẠNH KHUẤT (Hidden Lines):
   - Các cạnh đáy nằm phía "sau" hoặc bị mặt phẳng khác che khuất => NÉT ĐỨT (stroke-dasharray="4 4").
   - Các cạnh bên nối từ đỉnh xuống một đỉnh đáy bị khuất => NÉT ĐỨT.
   - Đường cao (kẻ từ đỉnh xuống tâm đáy) => NÉT ĐỨT (hoặc nét chấm gạch nếu là trục).
3. CẠNH THẤY (Visible Lines): Các cạnh còn lại nằm ở mặt trước => NÉT LIỀN.

VÍ DỤ CỤ THỂ:
- Hình chóp tứ giác đều S.ABCD (đáy ABCD là hình bình hành trên giấy):
  + Đáy: AB (liền), BC (liền), CD (đứt), DA (đứt).
  + Cạnh bên: SA (liền), SB (liền), SC (liền), SD (đứt - vì D là đỉnh khuất).
  + Đường cao SO: Đứt.
- Hình lập phương/Hộp chữ nhật:
  + Vẽ dạng hình chiếu trục đo. 3 cạnh xuất phát từ góc khuất bên trong => NÉT ĐỨT. 9 cạnh còn lại => NÉT LIỀN.

QUY TẮC KỸ THUẬT:
- Nét liền: stroke-dasharray="none" (hoặc không set).
- Nét đứt: stroke-dasharray="4 4".
- Màu sắc/Độ dày: Theo yêu cầu người dùng (default: black, width: 2).
- Văn bản (Labels): Đặt tên đỉnh (A, B, C...) dùng thẻ <text>, font sans-serif, size 16-20px. Đặt vị trí hợp lý để không bị nét vẽ cắt qua.

GHI CHÚ SỐ ĐO:
- Độ dài cạnh: Đặt text số đo (ví dụ "5cm") song song và gần trung điểm cạnh. KHÔNG vẽ đường gióng/mũi tên trừ khi được yêu cầu rõ.
- Góc: Vẽ cung tròn nhỏ (path arc) + text số đo.

Input: "Vẽ hình chóp tam giác đều S.ABC"
Logic: Đáy ABC thường vẽ là tam giác lệch. Cạnh đáy phía trên (AC) thường là nét đứt. Hai cạnh đáy dưới (AB, BC) nét liền. SA, SB, SC nét liền. (Tùy góc nhìn, nhưng phải đảm bảo logic hình học).
`;

export const generateGeometrySvg = async (prompt: string, options?: DrawingOptions): Promise<string> => {
  if (!apiKey) {
    throw new Error("Vui lòng cấu hình API Key để sử dụng tính năng này.");
  }

  let fullPrompt = prompt;

  if (options) {
    const colorMap: Record<string, string> = {
      'black': '#000000',
      'blue': '#2563EB',
      'red': '#DC2626',
      'green': '#16A34A',
      'orange': '#EA580C'
    };
    
    const widthMap: Record<string, string> = {
      'thin': '1',
      'medium': '2',
      'thick': '4'
    };

    const color = colorMap[options.strokeColor] || '#000000';
    const width = widthMap[options.strokeWidth] || '2';

    fullPrompt += `\n\n[CẤU HÌNH KỸ THUẬT]\n- Màu nét vẽ: ${color}\n- Độ dày nét: ${width}px`;
    
    if (options.annotations && options.annotations.trim() !== '') {
        fullPrompt += `\n- Ghi chú/Số đo cần thêm: ${options.annotations}`;
    }

    fullPrompt += `\n\nLƯU Ý ĐẶC BIỆT: Hãy phân tích kỹ hình học 3D để xác định đúng NÉT ĐỨT (cạnh khuất) và NÉT LIỀN (cạnh thấy). Đừng vẽ toàn bộ là nét liền.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2, // Giảm temperature để AI tuân thủ quy tắc tốt hơn
      }
    });

    let text = response.text;
    if (!text) throw new Error("Không nhận được phản hồi từ AI.");

    text = text.replace(/```xml/g, '').replace(/```svg/g, '').replace(/```/g, '').trim();
    
    if (!text.startsWith('<svg') || !text.endsWith('</svg>')) {
        const startIndex = text.indexOf('<svg');
        const endIndex = text.indexOf('</svg>');
        if (startIndex !== -1 && endIndex !== -1) {
            text = text.substring(startIndex, endIndex + 6);
        } else {
             throw new Error("AI không trả về mã SVG hợp lệ. Vui lòng thử lại.");
        }
    }

    return text;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Đã xảy ra lỗi khi tạo hình.");
  }
};