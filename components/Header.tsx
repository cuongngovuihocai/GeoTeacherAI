import React, { useEffect, useState } from 'react';
import { PenTool, Moon, Sun } from 'lucide-react';

export const Header: React.FC = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Sync state with HTML class on mount
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDark(true);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <PenTool size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight leading-tight">
              GeoTeacher <span className="text-indigo-600 dark:text-indigo-400">AI</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">VẼ HÌNH HỌC 2D VÀ 3D</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-sm font-bold text-indigo-600 dark:text-indigo-400 border-r border-slate-200 dark:border-slate-700 pr-6 h-8">
             <span className="uppercase tracking-wider">VUI CHƠI LÀ KHỞI NGUỒN CỦA TRI THỨC</span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Toggle Dark Mode"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <img 
              src="https://lh3.googleusercontent.com/d/1oTxhowzJvB_4EvS_mNOD-EWYtdYmptBw" 
              alt="GeoTeacher AI Logo" 
              className="h-20 w-auto object-contain dark:bg-white dark:p-1 dark:rounded-lg transition-all"
            />
          </div>
        </div>
      </div>
    </header>
  );
};