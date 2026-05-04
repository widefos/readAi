import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  setDoc, 
  serverTimestamp, 
  orderBy,
  limit
} from 'firebase/firestore';
import { auth, db, signIn } from './lib/firebase';
import { cn } from './lib/utils';
import { Book, ChatMessage, ReadingProgress } from './types';
import { Sidebar } from './components/Sidebar';
import { ReaderPanel } from './components/ReaderPanel';
import { ChatPanel } from './components/ChatPanel';
import { UploadZone } from './components/UploadZone';
import { Bookshelf } from './components/Bookshelf';
import { askAboutBook, summarizeBook } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, BookOpen, LogIn, Sparkles } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import ePub from 'epubjs';

// Use a stable CDN for the worker to avoid complex local setup issues
// For pdfjs-dist v4+, the worker is an ES module (.mjs)
const workerUrl = "https://unpkg.com/pdfjs-dist@" + pdfjsLib.version + "/build/pdf.worker.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [view, setView] = useState<'bookshelf' | 'reader'>('bookshelf');

  const [readerWidth, setReaderWidth] = useState(60);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = (e.clientX / window.innerWidth) * 100;
      if (newWidth > 20 && newWidth < 80) {
        setReaderWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    // Books Listener
    const qBooks = query(collection(db, 'books'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubBooks = onSnapshot(qBooks, (snap) => {
      const booksData = snap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
      setBooks(booksData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'books'));

    // Chat Listener
    const qChats = query(collection(db, 'chats'), where('userId', '==', user.uid));
    const unsubChats = onSnapshot(qChats, (snap) => {
      const chatMap: Record<string, ChatMessage[]> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        chatMap[data.bookId] = data.messages || [];
      });
      setChats(chatMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    // Progress Listener
    const qProg = query(collection(db, 'progress'), where('userId', '==', user.uid));
    const unsubProg = onSnapshot(qProg, (snap) => {
      const progMap: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        progMap[data.bookId] = data.currentPage || 0;
      });
      setProgress(progMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'progress'));

    return () => {
      unsubBooks();
      unsubChats();
      unsubProg();
    };
  }, [user]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    try {
      let text = "";
      let tocData: any[] = [];
      let coverDataUrl: string | undefined = undefined;
      
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let extractedText = "";
        const pageOffsets: number[] = [];
        let currentParaCount = 0;

        // Try to extract cover from first page
        try {
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 0.5 }); // Low res for cover
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await firstPage.render({ 
              canvasContext: context, 
              viewport: viewport,
              // Some versions require the canvas element itself
              canvas: canvas as any 
            }).promise;
            coverDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }
        } catch (coverErr) {
          console.warn("Failed to extract PDF cover:", coverErr);
        }

        for (let i = 1; i <= pdf.numPages; i++) {
          try {
            pageOffsets.push(currentParaCount);
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) => item.str);
            const pageText = strings.join(" ");
            const pageParas = pageText.split('\n').filter(p => p.trim().length > 0);
            
            extractedText += pageText + "\n";
            currentParaCount += pageParas.length;
          } catch (pageErr) {
            console.warn(`Failed to parse PDF page ${i}:`, pageErr);
          }
        }
        text = extractedText;

        // Extract PDF Outlines
        try {
          const outline = await pdf.getOutline();
          const mapOutline = (items: any[]): any[] => {
            return items.map(item => {
              const entry: any = { label: item.title };
              if (item.items && item.items.length > 0) {
                entry.children = mapOutline(item.items);
              }
              return entry;
            });
          };
          if (outline) tocData = mapOutline(outline);
        } catch (outlineErr) {
          console.warn("Failed to get PDF outline:", outlineErr);
        }

      } else if (file.type === "application/epub+zip" || file.name.endsWith('.epub')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const book = ePub(arrayBuffer);
          await book.ready;

          // Try to extract cover
          try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
              const response = await fetch(coverUrl);
              const blob = await response.blob();
              coverDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch (coverErr) {
            console.warn("Failed to extract EPUB cover:", coverErr);
          }
          
          let extractedText = "";
          const spineItems = (book.spine as any).items || [];
          const chapterParaMap = new Map<string, number>();
          let currentParaCount = 0;

          for (const item of spineItems) {
            try {
              const resource = await book.load(item.href);
              if (resource) {
                const parser = new DOMParser();
                const doc = (typeof resource === 'string' 
                  ? parser.parseFromString(resource, 'text/html')
                  : resource) as Document;
                
                const content = doc.body?.innerText || doc.body?.textContent || "";
                const cleanContent = content.trim();
                
                if (cleanContent) {
                  // Use relative href as key
                  const href = item.href;
                  chapterParaMap.set(href, currentParaCount);
                  
                  const paragraphs = cleanContent.split('\n').filter(p => p.trim().length > 0);
                  extractedText += cleanContent + "\n\n";
                  currentParaCount += paragraphs.length;
                }
              }
            } catch (chapterErr) {
              console.warn("Failed to load epub chapter:", item.href, chapterErr);
            }
          }
          text = extractedText;

          // Extract TOC
          try {
            const navigation = await (book as any).navigation;
            const mapToc = (items: any[]): any[] => {
              return items.map(item => {
                const hrefBase = item.href ? item.href.split('#')[0] : "";
                // Sometimes href is encoded or slightly different, try to match
                let pos = chapterParaMap.get(hrefBase);
                if (pos === undefined) {
                    for (const [key, value] of chapterParaMap.entries()) {
                        if (key.includes(hrefBase) || hrefBase.includes(key)) {
                            pos = value;
                            break;
                        }
                    }
                }

                const entry: any = { label: item.label };
                if (item.href) entry.href = item.href;
                if (pos !== undefined) entry.position = pos;
                if (item.subitems && item.subitems.length > 0) {
                  entry.children = mapToc(item.subitems);
                }
                return entry;
              });
            };
            if (navigation && navigation.toc) {
              tocData = mapToc(navigation.toc);
            }
          } catch (navErr) {
            console.warn("Failed to get EPUB navigation:", navErr);
          }
        } catch (epubErr: any) {
          throw new Error(`EPUB 瑙ｆ瀽澶辫触: ${epubErr.message || "鏂囦欢缁撴瀯寮傚父"}`);
        }
      } else {
        text = await file.text();
      }

      // Check extracted text size
      const textSize = new Blob([text]).size;
      if (textSize > 950 * 1024) {
        throw new Error(`提取出的文本内容过大 (${(textSize / 1024 / 1024).toFixed(2)}MB)。请将文本控制在 1MB 以内后重试。`);
      }

      if (!text || text.trim().length === 0) {
        throw new Error("无法从文件中提取有效文本内容，请确认文件未加密且包含可识别文字。");
      }

      const bookData = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        author: "未知作者",
        content: text,
        userId: user.uid,
        createdAt: serverTimestamp(),
        fileType: file.type,
        toc: tocData,
        cover: coverDataUrl
      };
      const docRef = await addDoc(collection(db, 'books'), bookData);
      setActiveBookId(docRef.id);
      setIsUploadOpen(false);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, 'books');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!user || !activeBookId) return;
    const book = books.find(b => b.id === activeBookId);
    if (!book) return;

    const currentHistory = chats[activeBookId] || [];
    const newUserMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const updatedMessages = [...currentHistory, newUserMsg];

    // Optimistic update
    setChats(prev => ({ ...prev, [activeBookId]: updatedMessages }));
    setIsAiLoading(true);

    let sessionMessages = updatedMessages;
    try {
      const aiResponse = await askAboutBook(book.title, book.content, currentHistory, text);
      const aiMsg: ChatMessage = {
        role: 'model',
        content: aiResponse || "抱歉，我暂时无法回答。",
        timestamp: new Date().toISOString()
      };
      sessionMessages = [...updatedMessages, aiMsg];
      setChats(prev => ({ ...prev, [activeBookId]: sessionMessages }));
    } catch (error: any) {
      console.warn("AI Q&A warning:", error?.message || error);
      const fallbackMsg: ChatMessage = {
        role: 'model',
        content: `当前模型请求失败：${error?.message || "未知错误"}。请稍后重试。`,
        timestamp: new Date().toISOString()
      };
      sessionMessages = [...updatedMessages, fallbackMsg];
      setChats(prev => ({ ...prev, [activeBookId]: sessionMessages }));
    }

    try {
      const chatRef = doc(db, 'chats', activeBookId);
      await setDoc(chatRef, {
        bookId: activeBookId,
        userId: user.uid,
        messages: sessionMessages,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${activeBookId}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!user || !activeBookId) return;
    const book = books.find(b => b.id === activeBookId);
    if (!book) return;

    setIsAiLoading(true);
    try {
      const summary = await summarizeBook(book.title, book.content);
      await handleSendMessage(`请为我总结这本书：${summary}`);
    } catch (error) {
      console.error("Summary error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const updateProgress = async (page: number) => {
    if (!user || !activeBookId) return;
    try {
      await setDoc(doc(db, 'progress', activeBookId), {
        bookId: activeBookId,
        userId: user.uid,
        currentPage: page,
        lastReadAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `progress/${activeBookId}`);
    }
  };

  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSignInError(null);
    try {
      await signIn();
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        setSignInError("登录窗口被拦截，请允许弹出窗口并重试。");
      } else if (error.code === 'auth/unauthorized-domain') {
        setSignInError(`当前域名未在 Firebase 授权列表中：${window.location.hostname}。请到 Firebase Console -> Authentication -> Settings -> Authorized domains 添加后重试。`);
      } else {
        setSignInError(error.message);
      }
    }
  };

  const handleDeleteBook = async (id: string) => {
    if (!user) {
      alert("璇峰厛鐧诲綍");
      return;
    }
    
    console.log("handleDeleteBook called for:", id);
    try {
      const bookRef = doc(db, 'books', id);
      
      // Perform deletion
      await deleteDoc(bookRef);
      console.log("Book deleted successfully:", id);
      alert("书籍已成功删除。");
      
      // Cleanup related data
      try {
        await deleteDoc(doc(db, 'progress', id));
        await deleteDoc(doc(db, 'chats', id));
      } catch (cleanError) {
        console.warn("[Delete] Cleanup warnings:", cleanError);
      }
      
      if (activeBookId === id) {
        setActiveBookId(null);
      }
    } catch (error: any) {
      console.error("Delete handler error:", error);
      alert(`鍒犻櫎涔︾睄鍑洪敊: ${error.message || error}`);
      handleFirestoreError(error, OperationType.DELETE, `books/${id}`);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#F9F8F6]">
        <Loader2 className="w-8 h-8 animate-spin text-[#9A8C73]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#F9F8F6] p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white p-12 rounded-3xl shadow-xl border border-[#E5E2DD]"
        >
          <div className="w-20 h-20 bg-[#F3F0EC] rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <BookOpen className="w-10 h-10 text-[#9A8C73]" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-[#2C2C2C] mb-4">AI 鏅洪槄</h1>
          <p className="text-sm text-[#8A8A8A] mb-12 font-medium tracking-wide">
            深度阅读的新维度。<br />通过 AI 的全局透视，让每一页逻辑跃然纸上。
          </p>
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 py-4 bg-[#2C2C2C] text-white rounded-xl font-bold uppercase tracking-widest hover:bg-black transition-all active:scale-95 shadow-lg shadow-black/10"
          >
            <LogIn className="w-5 h-5" />
            开启智能阅读
          </button>

          {signInError && (
            <p className="mt-4 text-xs text-red-500 font-medium bg-red-50 p-2 rounded border border-red-100">
              {signInError}
            </p>
          )}
          
          <div className="mt-12 pt-8 border-t border-gray-100 flex items-center justify-center gap-6 opacity-40">
            <div className="flex items-center gap-1.5 grayscale">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">AI Powered</span>
            </div>
            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">PDF / EPUB / TXT Support</span>
          </div>
        </motion.div>
      </div>
    );
  }

  const activeBook = books.find(b => b.id === activeBookId) || null;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F4F1EA] text-[#1A1A1A]">
      <Sidebar 
        view={view}
        setView={setView}
        activeBook={!!activeBook}
        activeBookTitle={activeBook?.title}
        onUpload={() => setIsUploadOpen(true)}
        onSignOut={() => signOut(auth)}
        user={user}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar - Minimalist with Search */}
        <header className="h-20 px-12 flex items-center justify-between border-b border-black/5 bg-[#FDFCF8] shrink-0">
          <div className="flex-1 max-w-xl">
             <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <span className="text-black/20 group-focus-within:text-black/50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </span>
                </div>
                <input 
                  type="text" 
                  placeholder="鎼滅储鎴戠殑涔﹀簱..." 
                  className="w-full bg-[#f9f9fb] border-none rounded-xl py-2.5 pl-12 pr-4 text-xs font-bold tracking-tight focus:ring-1 focus:ring-black/5 placeholder:text-black/10 transition-all outline-none"
                />
             </div>
          </div>
          
          <div className="flex items-center gap-6 ml-8">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-20 hidden lg:block">
              {activeBook ? `Current: ${activeBook.title}` : "No book selected"}
            </div>
            
            <button 
              disabled={!activeBook}
              onClick={() => activeBook && setIsOverviewOpen(true)}
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-xl hover:bg-black/5 transition-all",
                !activeBook && "opacity-20 cursor-not-allowed"
              )}
            >
              <Sparkles className="w-5 h-5 opacity-40" />
            </button>
          </div>
        </header>

        <main className={cn("flex-1 relative flex overflow-hidden bg-[#F4F1EA]", isResizing && "pointer-events-none")}>
          {view === 'bookshelf' || !activeBook ? (
            <Bookshelf 
              books={books} 
              progress={progress}
              onUploadClick={() => setIsUploadOpen(true)}
              onSelectBook={(book) => {
                setActiveBookId(book.id);
                setView('reader');
              }}
            />
          ) : (
            <div className="flex-1 flex w-full">
              <section style={{ width: `${readerWidth}%` }} className="h-full">
                <ReaderPanel 
                  book={activeBook} 
                  currentPage={progress[activeBook.id] || 0}
                  onPageChange={updateProgress}
                  onAnnotate={(text) => setPendingQuote(text)}
                  isOverviewOpen={isOverviewOpen}
                  onCloseOverview={() => setIsOverviewOpen(false)}
                />
              </section>

              <div 
                className={cn(
                  "w-1 h-full cursor-col-resize hover:bg-indigo-500/50 transition-colors z-[100] flex items-center justify-center group",
                  isResizing ? "bg-indigo-500" : "bg-transparent"
                )}
                onMouseDown={() => setIsResizing(true)}
              >
                <div className="w-px h-8 bg-gray-300 group-hover:bg-indigo-400" />
              </div>

              <section style={{ width: `${100 - readerWidth}%` }} className="h-full bg-white border-l border-black/5">
                <ChatPanel 
                  book={activeBook}
                  messages={chats[activeBookId!] || []}
                  onSendMessage={handleSendMessage}
                  onSummarize={handleSummarize}
                  isLoading={isAiLoading}
                  pendingQuote={pendingQuote}
                  onClearQuote={() => setPendingQuote(null)}
                  onClear={async () => {
                    if (activeBookId) {
                      // Optimistically clear current UI chat first.
                      setChats(prev => ({ ...prev, [activeBookId]: [] }));
                      try {
                        await deleteDoc(doc(db, 'chats', activeBookId));
                      } catch (error) {
                        handleFirestoreError(error, OperationType.DELETE, `chats/${activeBookId}`);
                      }
                    }
                  }}
                />
              </section>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {isUploadOpen && (
          <UploadZone 
            onClose={() => setIsUploadOpen(false)} 
            onUpload={handleUpload}
            isUploading={isUploading}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

