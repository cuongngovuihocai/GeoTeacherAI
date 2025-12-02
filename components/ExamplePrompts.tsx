import React from 'react';
import { Sparkles } from 'lucide-react';

interface ExamplePromptsProps {
  onSelect: (text: string) => void;
}

const EXAMPLES = [
  "Tam giác đều ABC cạnh 5cm",
  "Tam giác vuông cân tại A, đường cao AH",
  "Hình tròn tâm O bán kính R, dây cung AB",
  "Hình thang cân ABCD đáy lớn CD",
  "Hình lập phương ABCD.A'B'C'D'",
  "Hình chóp tứ giác đều S.ABCD",
  "Hình trụ tròn xoay",
  "Hình lăng trụ tam giác đều"
];

export const ExamplePrompts: React.FC<ExamplePromptsProps> = ({ onSelect }) => {
  return (
    <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-amber-500" />
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gợi ý nhanh</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(ex)}
            className="text-xs bg-slate-50 hover:bg-white hover:border-indigo-300 text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg transition-all border border-slate-200 shadow-sm
            dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white dark:hover:border-indigo-500"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
};