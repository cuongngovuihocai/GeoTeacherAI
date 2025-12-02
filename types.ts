export interface DrawingOptions {
  strokeColor: string;
  strokeWidth: string;
  annotations?: string; // Ghi chú về độ dài, góc, văn bản thêm
}

export interface HistoryItem {
  id: string;
  prompt: string;
  svgContent: string;
  timestamp: number;
  options?: DrawingOptions;
}

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  currentSvg: string | null;
}

export enum GeometryType {
  TWO_D = '2D',
  THREE_D = '3D',
}