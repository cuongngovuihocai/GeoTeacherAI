import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { DrawingCanvas } from './components/DrawingCanvas';
import { ExamplePrompts } from './components/ExamplePrompts';
import { generateGeometrySvg } from './services/geminiService';
import { HistoryItem, DrawingOptions } from './types';
import { Sparkles, Clock, Trash2, ChevronRight, Palette, Ruler, PenLine, Info } from 'lucide-react';

// Helper function to get hex color
const getColorCode = (color: string) => {
  switch(color) {
    case 'blue': return '#2563EB';
    case 'red': return '#DC2626';
    case 'green': return '#16A34A';
    case 'orange': return '#EA580C';
    case 'black': 
    default: return '#000000'; // Pure black for drawing
  }
};

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [annotations, setAnnotations] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSvg, setCurrentSvg] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Style options
  const [strokeColor, setStrokeColor] = useState('black');
  const [strokeWidth, setStrokeWidth] = useState('medium');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);

    const options: DrawingOptions = {
      strokeColor,
      strokeWidth,
      annotations
    };

    try {
      const svg = await generateGeometrySvg(prompt, options);
      setCurrentSvg(svg);
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        prompt: prompt,
        svgContent: svg,
        timestamp: Date.now(),
        options: options
      };
      
      setHistory(prev => [newItem, ...prev].slice(0, 10)); // Keep last 10
    } catch (err: any) {
      setError(err.message || "Không thể tạo hình. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setPrompt(item.prompt);
    setCurrentSvg(item.svgContent);
    if (item.options) {
      setStrokeColor(item.options.strokeColor);
      setStrokeWidth(item.options.strokeWidth);
      setAnnotations(item.options.annotations || '');
    } else {
      setStrokeColor('black');
      setStrokeWidth('medium');
      setAnnotations('');
    }
    setError(null);
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <Header />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-7rem)]">
          
          {/* Left Panel: Input & Controls */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 pb-4 scrollbar-hide">
            
            {/* Input Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-800 transition-colors">
              <div className="flex items-center gap-2 mb-3">
                 <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                    <PenLine size={18} />
                 </div>
                 <h2 className="font-bold text-slate-800 dark:text-white">Mô tả hình học</h2>
              </div>
              
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ví dụ: Hình chóp tam giác đều S.ABC, đáy ABC..."
                className="w-full h-28 p-4 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-all text-sm leading-relaxed mb-5 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                disabled={isLoading}
              />

              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2 text-slate-700 dark:text-slate-300">
                   <Ruler size={14} className="text-slate-400" />
                   <label className="text-xs font-bold uppercase tracking-wide">Ghi chú & Số đo</label>
                </div>
                <textarea
                  value={annotations}
                  onChange={(e) => setAnnotations(e.target.value)}
                  placeholder="Ví dụ: AB = 5cm, Góc A = 60 độ..."
                  className="w-full h-16 p-3 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-all text-xs leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  disabled={isLoading}
                />
              </div>
              
              {/* Style Controls */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-slate-600 dark:text-slate-400">
                    <Palette size={14} />
                    <label className="text-[10px] font-bold uppercase tracking-wider">Màu nét</label>
                  </div>
                  <div className="flex gap-2">
                    {['black', 'blue', 'red', 'green', 'orange'].map(c => (
                      <button 
                        key={c}
                        onClick={() => setStrokeColor(c)}
                        className={`w-7 h-7 rounded-full border-[3px] ${strokeColor === c ? 'border-white dark:border-slate-700 ring-2 ring-indigo-500 scale-110 shadow-md' : 'border-transparent hover:scale-110'} transition-all`}
                        style={{ backgroundColor: c === 'black' ? '#1e293b' : getColorCode(c) }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-slate-600 dark:text-slate-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-2"/></svg>
                    <label className="text-[10px] font-bold uppercase tracking-wider">Độ dày</label>
                  </div>
                  <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5 rounded-lg shadow-sm">
                    {['thin', 'medium', 'thick'].map(w => (
                      <button
                        key={w}
                        onClick={() => setStrokeWidth(w)}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${strokeWidth === w ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                      >
                        {w === 'thin' ? 'Mỏng' : w === 'medium' ? 'Vừa' : 'Dày'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isLoading || !prompt.trim()}
                className="group relative w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-300 disabled:to-slate-400 text-white px-5 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/30 active:scale-[0.98] disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                ) : (
                  <Sparkles size={18} className="group-hover:animate-pulse" />
                )}
                <span>{isLoading ? 'Đang phân tích...' : 'Vẽ hình ngay'}</span>
              </button>

              <ExamplePrompts onSelect={setPrompt} />
            </div>

            {/* History Section */}
            {history.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-800 flex-1 flex flex-col min-h-[250px] transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold text-sm">
                    <Clock size={16} className="text-indigo-500" />
                    <span>Lịch sử</span>
                  </div>
                  <button onClick={clearHistory} className="text-slate-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Xóa tất cả">
                    <Trash2 size={14} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {history.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="group p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 hover:border-indigo-500 dark:hover:border-indigo-500 cursor-pointer transition-all flex items-start gap-3 hover:shadow-md"
                    >
                      <div 
                        className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-800" 
                        style={{ backgroundColor: item.options ? (item.options.strokeColor === 'black' ? '#475569' : getColorCode(item.options.strokeColor)) : '#475569' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{item.prompt}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300">
               <div className="flex items-center gap-2 font-bold mb-2 text-blue-900 dark:text-blue-200">
                  <Info size={14} />
                  <span>Mẹo hay</span>
               </div>
               <ul className="list-disc pl-4 space-y-1.5 opacity-90">
                  <li>Thêm <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">chiều cao</span> cho hình 3D.</li>
                  <li>Dùng chế độ <span className="font-bold">Chọn</span> để chỉnh sửa các điểm.</li>
                  <li>Nhấp đúp vào văn bản để chỉnh sửa nội dung.</li>
               </ul>
            </div>
          </div>

          {/* Right Panel: Canvas */}
          <div className="lg:col-span-8 xl:col-span-9 h-full min-h-[600px] flex flex-col">
            <DrawingCanvas 
              svgContent={currentSvg}
              isLoading={isLoading}
              error={error}
              currentHexColor={getColorCode(strokeColor)}
            />
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;