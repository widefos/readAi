import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface UploadZoneProps {
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  theme: 'paper' | 'light' | 'dark' | 'eye';
}

export function UploadZone({ onClose, onUpload, isUploading, theme }: UploadZoneProps) {
  const panelClasses = {
    light: 'bg-[#FBFBFC] border border-black/8 text-[#222]',
    paper: 'bg-[#FDFCF8] border border-black/10 text-[#2C2C2C]',
    dark: 'bg-[#181818] border border-white/12 text-[#D4D4D4]',
    eye: 'bg-[#063941] border border-[#22b79f]/28 text-[#cbefe8]',
  } as const;
  const headerBorder = {
    light: 'border-black/8',
    paper: 'border-[#E5E2DD]',
    dark: 'border-white/10',
    eye: 'border-[#22b79f]/24',
  } as const;
  const closeBtn = {
    light: 'hover:bg-black/5',
    paper: 'hover:bg-gray-100',
    dark: 'hover:bg-white/10',
    eye: 'hover:bg-[#0d5560]',
  } as const;
  const closeIcon = {
    light: 'text-black/45',
    paper: 'text-[#8A8A8A]',
    dark: 'text-white/55',
    eye: 'text-[#91d4c8]/90',
  } as const;
  const dropBase = {
    light: 'border-black/15 hover:border-black/30 hover:bg-black/[0.02]',
    paper: 'border-[#E5E2DD] hover:border-[#9A8C73] hover:bg-[#F9F8F6]',
    dark: 'border-white/20 hover:border-sky-300/50 hover:bg-white/5',
    eye: 'border-[#21b39c]/40 hover:border-[#3bddc0]/60 hover:bg-[#0a4f58]',
  } as const;
  const dropActive = {
    light: 'border-black/35 bg-black/[0.03]',
    paper: 'border-[#9A8C73] bg-[#9A8C73]/5',
    dark: 'border-sky-300/70 bg-sky-300/10',
    eye: 'border-[#34d2b7]/70 bg-[#1ebea3]/15',
  } as const;
  const iconWrap = {
    light: 'bg-black/8 text-black/65',
    paper: 'bg-[#F3F0EC] text-[#9A8C73]',
    dark: 'bg-white/10 text-sky-300',
    eye: 'bg-[#1ebea3]/18 text-[#74e8d3]',
  } as const;
  const subText = {
    light: 'text-black/55',
    paper: 'text-[#8A8A8A]',
    dark: 'text-white/55',
    eye: 'text-[#9bded2]/85',
  } as const;
  const ctaBtn = {
    light: 'bg-[#1E1E1E] text-white hover:bg-black',
    paper: 'bg-[#2C2C2C] text-white hover:bg-black',
    dark: 'bg-[#E2E2E2] text-[#191919] hover:bg-white',
    eye: 'bg-[#1db69e] text-[#05323b] hover:bg-[#2bd9bb]',
  } as const;
  const notice = {
    light: 'bg-black/[0.02] border-black/10',
    paper: 'bg-[#F9F8F6] border-[#E5E2DD]',
    dark: 'bg-white/5 border-white/10',
    eye: 'bg-[#0a4a53]/45 border-[#20b39b]/25',
  } as const;
  const noticeIcon = {
    light: 'text-black/55',
    paper: 'text-[#9A8C73]',
    dark: 'text-sky-300',
    eye: 'text-[#66e2cb]',
  } as const;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const MAX_SIZE = 200 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        alert(`文件太大（${(file.size / 1024 / 1024).toFixed(2)}MB）。当前仅支持最大 200MB 的源文件。`);
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
      'application/epub+zip': ['.epub'],
    },
    multiple: false,
  } as any);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn('w-full max-w-md rounded-2xl shadow-2xl overflow-hidden overflow-y-auto max-h-screen', panelClasses[theme])}
      >
        <div className={cn('p-6 border-b flex items-center justify-between', headerBorder[theme])}>
          <h2 className="text-xl font-serif font-bold">导入新图书</h2>
          <button onClick={onClose} className={cn('p-2 rounded-full transition-colors', closeBtn[theme])}>
            <X className={cn('w-5 h-5', closeIcon[theme])} />
          </button>
        </div>

        <div className="p-8">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer
              ${isDragActive ? dropActive[theme] : dropBase[theme]}
              ${isUploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            <div className={cn('w-16 h-16 rounded-full flex items-center justify-center mb-6', iconWrap[theme])}>
              {isUploading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <Upload className="w-8 h-8" />
                </motion.div>
              ) : (
                <Upload className="w-8 h-8" />
              )}
            </div>

            <h3 className="text-lg font-medium mb-2">{isDragActive ? '松开即可导入' : '拖拽文件到此处'}</h3>
            <p className={cn('text-sm mb-8', subText[theme])}>支持 PDF / EPUB / TXT，单文件最大 200MB</p>

            <button className={cn('px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors', ctaBtn[theme])}>
              选择文件
            </button>
          </div>

          <div className={cn('mt-8 flex items-start gap-3 p-4 rounded-xl border', notice[theme])}>
            <FileText className={cn('w-5 h-5 mt-0.5', noticeIcon[theme])} />
            <div className="flex-1">
              <h4 className="text-sm font-bold mb-1">隐私说明</h4>
              <p className={cn('text-xs leading-relaxed', subText[theme])}>书籍文件保存在你的本地设备，不上传云端。</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
