import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UploadZoneProps {
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export function UploadZone({ onClose, onUpload, isUploading }: UploadZoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // Increase limit to 20MB for the source file
      const MAX_SIZE = 20 * 1024 * 1024; 
      if (file.size > MAX_SIZE) {
        alert(`文件太大了 (${(file.size / 1024 / 1024).toFixed(2)}MB)。为了确保解析质量，目前支持最大 20MB 的原始文件（提取文本需在 1MB 以内）。`);
        return;
      }
      onUpload(file);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub']
    },
    multiple: false
  } as any);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden overflow-y-auto max-h-screen"
      >
        <div className="p-6 border-b border-[#E5E2DD] flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold text-[#2C2C2C]">导入新图书</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-[#8A8A8A]" />
          </button>
        </div>

        <div className="p-8">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer
              ${isDragActive ? 'border-[#9A8C73] bg-[#9A8C73]/5' : 'border-[#E5E2DD] hover:border-[#9A8C73] hover:bg-[#F9F8F6]'}
              ${isUploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 bg-[#F3F0EC] rounded-full flex items-center justify-center mb-6 text-[#9A8C73]">
              {isUploading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <Upload className="w-8 h-8" />
                </motion.div>
              ) : (
                <Upload className="w-8 h-8" />
              )}
            </div>
            
            <h3 className="text-lg font-medium text-[#2C2C2C] mb-2">
              {isDragActive ? '放开以导入' : '拖拽文件至此'}
            </h3>
            <p className="text-sm text-[#8A8A8A] mb-8">
              支持 PDF、EPUB 或 TXT 格式文本<br />支持最大 20MB 文件（文本请保持在 100 万字内）
            </p>
            
            <button className="px-6 py-2 bg-[#2C2C2C] text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-black transition-colors">
              选择文件
            </button>
          </div>

          <div className="mt-8 flex items-start gap-3 p-4 bg-[#F9F8F6] rounded-xl border border-[#E5E2DD]">
            <FileText className="w-5 h-5 text-[#9A8C73] mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-[#2C2C2C] mb-1">隐私说明</h4>
              <p className="text-xs text-[#8A8A8A] leading-relaxed">
                您的书籍内容仅储存在当前 Firebase 数据集中，并加密传输给 Gemini AI 用于分析。我们不会将您的私有著作用于基础模型练。
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
