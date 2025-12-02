import { GoogleGenAI } from "@google/genai";
import { DrawingOptions } from "../types";

const SYSTEM_INSTRUCTION = `
Bạn là một trợ lý chuyên nghiệp hỗ trợ giáo viên toán học vẽ hình minh họa cho bài giảng (Geometry Visualizer).
Nhiệm vụ: Chuyển đổi mô tả văn bản thành mã SVG (Scalable Vector Graphics) chính xác về toán học và thẩm mỹ.

QUY TẮC CỐT LÕI:
1. ĐẦU RA: Chỉ trả về mã SVG. KHÔNG markdown, KHÔNG giải thích. Bắt đầu <svg... kết thúc </svg>.
2. VIEWBOX: Sử dụng viewBox="0 0 500 500". Padding an toàn 40px.

QUY TẮC PHÂN BIỆT 2D VÀ 3D (QUAN TRỌNG):
1. HÌNH HỌC PHẲNG (2D):
   - Hầu hết là NÉT LIỀN (Solid).
   - Chỉ dùng NÉT ĐỨT (Dashed) cho: Đường gióng (projection lines), đường phân giác trong tưởng tượng, hoặc đường bị hình khác đè lên hoàn toàn.
   - Ví dụ: Tam giác, Hình tròn, Hình thang => Toàn bộ nét liền.

2. HÌNH HỌC KHÔNG GIAN (3D):
   - Phải tư duy theo LỚP (LAYERS) từ trên xuống dưới, từ ngoài vào trong.
   - ĐƯỜNG BAO NGOÀI (Silhouette): Luôn là NÉT LIỀN.
   - CÁC MẶT THẤY (Visible Faces): Các đường nằm trên mặt phẳng hướng về phía người nhìn => NÉT LIỀN.
   - CÁC MẶT KHUẤT (Hidden Faces): Các đường nằm ở mặt sau, bị các mặt trước che lấp => NÉT ĐỨT (stroke-dasharray="4 4").
   - ĐƯỜNG TRỤC/CAO: Đường cao kẻ từ đỉnh xuống tâm đáy thường là NÉT ĐỨT (hoặc chấm gạch).

VÍ CỤ THỂ CHO 3D:
- Hình chóp S.ABCD:
  + Đường bao (SA, SB, BC, CD, SD - tuỳ góc nhìn): Nét liền.
  + Nếu góc nhìn từ trên xuống lệch trái: Cạnh đáy AD và DC (phía sau) là Nét đứt. Cạnh bên SD (nối với đỉnh khuất D) là Nét đứt.
- Hình trụ:
  + Hai cạnh bên dọc: Nét liền.
  + Đáy trên: Ellipse liền.
  + Đáy dưới: Nửa cung trước liền, nửa cung sau ĐỨT.

QUY TẮC KỸ THUẬT:
- Nét liền: stroke-dasharray="none" (hoặc không set).
- Nét đứt: stroke-dasharray="4 4".
- Màu sắc/Độ dày: Theo yêu cầu người dùng (default: black, width: 2).
- Văn bản (Labels): Đặt tên đỉnh (A, B, C...) dùng thẻ <text>, font sans-serif, size 16-20px, text-anchor="middle". Tránh đặt đè lên nét vẽ.

GHI CHÚ SỐ ĐO:
- Độ dài cạnh: Đặt text số đo (ví dụ "5cm") song song và gần trung điểm cạnh. 
- Góc: Vẽ cung tròn nhỏ (path arc) + text số đo.
`;

export const generateGeometrySvg = async (prompt: string, options?: DrawingOptions, userApiKey?: string): Promise<string> => {
  // Ưu tiên key người dùng nhập, sau đó mới đến biến môi trường
  const effectiveApiKey = userApiKey || process.env.API_KEY;

  if (!effectiveApiKey) {
    throw new Error("Vui lòng nhập Gemini API Key để sử dụng tính năng này.");
  }

  // Khởi tạo client mới với key cụ thể
  const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

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

    fullPrompt += `\n\nLƯU Ý CUỐI: Hãy cố gắng phân biệt nét đứt/liền tốt nhất có thể. Người dùng có công cụ để sửa lại thủ công nếu sai, nhưng hãy làm tốt nhất từ đầu.`;
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