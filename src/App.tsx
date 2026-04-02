import React, { useState, useEffect, useRef } from 'react';
import { 
  Search as SearchIcon, 
  Library as LibraryIcon, 
  BookOpen, 
  Volume2, 
  Pause, 
  Play, 
  Plus, 
  Check, 
  Trash2, 
  LogOut, 
  LogIn, 
  ChevronLeft, 
  ChevronRight,
  Loader2,
  Bookmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, signIn, logOut, db, OperationType, handleFirestoreError } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { searchBooks, generateSpeech } from './services/geminiService';

// --- Types ---
interface Book {
  id: string;
  title: string;
  authors: string[];
  thumbnail: string;
  description: string;
  content: string;
  publicationDate?: string;
  genre?: string;
}

interface UserBook extends Book {
  docId: string;
  uid: string;
  status: 'want-to-read' | 'currently-reading' | 'read';
  progress: number;
  currentPage: number;
  lastReadAt: any;
}

interface ReadingList {
  docId: string;
  uid: string;
  name: string;
  bookIds: string[];
  createdAt: any;
}

// --- Components ---

const Navbar = ({ user }: { user: any }) => (
  <nav className="flex items-center justify-between p-4 bg-slate-surface border-b border-white/5 sticky top-0 z-50">
    <div className="flex items-center gap-2">
      <BookOpen className="text-gold-accent w-6 h-6" />
      <span className="text-xl font-serif font-bold tracking-tight text-gold-accent">Codex Alexandria</span>
    </div>
    <div className="flex items-center gap-4">
      {user ? (
        <div className="flex items-center gap-3">
          <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full border border-white/10" />
          <button onClick={logOut} className="text-sm text-gray-400 hover:text-off-white flex items-center gap-1 font-sans">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      ) : (
        <button onClick={signIn} className="btn-gold flex items-center gap-2 text-sm">
          <LogIn className="w-4 h-4" /> Sign In
        </button>
      )}
    </div>
  </nav>
);

const SearchSection = ({ onSelectBook }: { onSelectBook: (book: Book) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const books = await searchBooks(query);
    setResults(books);
    setLoading(false);
  };

  return (
    <section className="max-w-4xl mx-auto p-6">
      <form onSubmit={handleSearch} className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all books, authors, ISBN..."
          className="input-codex w-full text-lg"
        />
        <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
        <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 btn-gold px-6 py-2 text-sm">
          Search
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gold-accent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {results.map((book) => (
            <motion.div
              key={book.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-codex p-4 flex gap-4 hover:bg-white/5 transition-colors cursor-pointer group"
              onClick={() => onSelectBook(book)}
            >
              <img src={book.thumbnail || 'https://picsum.photos/seed/book/120/180'} alt={book.title} className="w-24 h-36 object-cover rounded-xl shadow-lg group-hover:scale-105 transition-transform" referrerPolicy="no-referrer" />
              <div className="flex-1">
                <h3 className="font-serif font-bold text-lg leading-tight mb-1 group-hover:text-gold-accent transition-colors">{book.title}</h3>
                <p className="text-sm text-gray-400 mb-2 font-sans">{book.authors?.join(', ')}</p>
                <p className="text-xs text-gray-500 line-clamp-3 font-sans leading-relaxed">{book.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
};

const LibrarySection = ({ user, onReadBook }: { user: any, onReadBook: (book: UserBook) => void }) => {
  const [books, setBooks] = useState<UserBook[]>([]);
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  useEffect(() => {
    if (!user) return;
    
    // Fetch books
    const qBooks = query(collection(db, 'userBooks'), where('uid', '==', user.uid));
    const unsubBooks = onSnapshot(qBooks, (snapshot) => {
      const b = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as UserBook));
      setBooks(b);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'userBooks');
    });

    // Fetch lists
    const qLists = query(collection(db, 'readingLists'), where('uid', '==', user.uid));
    const unsubLists = onSnapshot(qLists, (snapshot) => {
      const l = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as ReadingList));
      setLists(l);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'readingLists');
    });

    return () => {
      unsubBooks();
      unsubLists();
    };
  }, [user]);

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'readingLists'), {
        uid: user.uid,
        name: newListName.trim(),
        bookIds: [],
        createdAt: serverTimestamp(),
      });
      setNewListName('');
      setIsCreatingList(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'readingLists');
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!window.confirm('Are you sure you want to delete this list?')) return;
    try {
      await deleteDoc(doc(db, 'readingLists', listId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'readingLists');
    }
  };

  if (!user) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-600">
      <LibraryIcon className="w-12 h-12 mb-4 opacity-20" />
      <p className="font-sans italic">Sign in to view your personal library</p>
    </div>
  );

  const predefinedSections = [
    { title: 'Currently Reading', status: 'currently-reading' },
    { title: 'Want to Read', status: 'want-to-read' },
    { title: 'Read', status: 'read' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-4xl font-serif font-bold text-gold-accent">Your Library</h1>
        <button 
          onClick={() => setIsCreatingList(true)}
          className="btn-gold flex items-center gap-2 text-sm py-2"
        >
          <Plus className="w-4 h-4" /> New List
        </button>
      </div>

      {isCreatingList && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 p-6 card-codex"
        >
          <form onSubmit={handleCreateList} className="flex gap-4">
            <input 
              type="text"
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Enter list name..."
              className="input-codex flex-1"
            />
            <button type="submit" className="btn-gold">Create</button>
            <button type="button" onClick={() => setIsCreatingList(false)} className="px-6 py-3 text-gray-400 hover:text-off-white transition-colors">Cancel</button>
          </form>
        </motion.div>
      )}

      {/* Predefined Sections */}
      {predefinedSections.map(section => {
        const filtered = books.filter(b => b.status === section.status);
        if (filtered.length === 0) return null;
        return (
          <div key={section.status} className="mb-16">
            <h2 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-gold-accent/80">
              {section.title} 
              <span className="text-xs font-sans font-bold text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">{filtered.length}</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
              {filtered.map(book => (
                <BookCard key={book.docId} book={book} onClick={() => onReadBook(book)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Custom Lists */}
      {lists.map(list => {
        const listBooks = books.filter(b => list.bookIds?.includes(b.id));
        return (
          <div key={list.docId} className="mb-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-serif font-bold flex items-center gap-3 text-gold-accent/80">
                {list.name}
                <span className="text-xs font-sans font-bold text-gray-500 bg-white/5 px-3 py-1 rounded-full border border-white/5">{listBooks.length}</span>
              </h2>
              <button 
                onClick={() => handleDeleteList(list.docId)}
                className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                title="Delete List"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            {listBooks.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
                {listBooks.map(book => (
                  <BookCard key={book.docId} book={book} onClick={() => onReadBook(book)} />
                ))}
              </div>
            ) : (
              <div className="py-12 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-gray-600">
                <p className="font-sans italic">No books in this list yet</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BookCard = ({ book, onClick }: { book: UserBook, onClick: () => void }) => (
  <motion.div
    whileHover={{ y: -8 }}
    className="group cursor-pointer"
    onClick={onClick}
  >
    <div className="relative aspect-[2/3] mb-4">
      <img src={book.thumbnail} alt={book.title} className="w-full h-full object-cover rounded-2xl shadow-xl group-hover:ring-2 group-hover:ring-gold-accent/50 transition-all" referrerPolicy="no-referrer" />
      {book.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10 rounded-b-2xl overflow-hidden">
          <div className="h-full bg-gold-accent" style={{ width: `${book.progress}%` }} />
        </div>
      )}
    </div>
    <h3 className="font-serif font-bold text-sm line-clamp-2 leading-tight group-hover:text-gold-accent transition-colors">{book.title}</h3>
    <p className="text-xs text-gray-500 mt-1 font-sans">{book.authors?.[0]}</p>
  </motion.div>
);

const BookDetails = ({ book, user, onBack, onStartReading }: { book: Book | UserBook, user: any, onBack: () => void, onStartReading: () => void }) => {
  const isSaved = 'docId' in book;
  const [lists, setLists] = useState<ReadingList[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'readingLists'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const l = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id } as ReadingList));
      setLists(l);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSave = async (status: 'want-to-read' | 'currently-reading' | 'read') => {
    if (!user) return signIn();
    try {
      if (isSaved) {
        await updateDoc(doc(db, 'userBooks', (book as UserBook).docId), { status });
      } else {
        await addDoc(collection(db, 'userBooks'), {
          ...book,
          uid: user.uid,
          status,
          progress: 0,
          currentPage: 0,
          lastReadAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'userBooks');
    }
  };

  const toggleListMembership = async (list: ReadingList) => {
    if (!user) return signIn();
    
    // Ensure book is in library first
    if (!isSaved) {
      await handleSave('want-to-read');
    }

    const isInList = list.bookIds?.includes(book.id);
    const newBookIds = isInList 
      ? list.bookIds.filter(id => id !== book.id)
      : [...(list.bookIds || []), book.id];

    try {
      await updateDoc(doc(db, 'readingLists', list.docId), { bookIds: newBookIds });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'readingLists');
    }
  };

  return (
    <div className="fixed inset-0 bg-midnight-bg z-[60] flex flex-col overflow-y-auto">
      <header className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-surface sticky top-0 z-10">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-serif font-bold text-lg text-gold-accent">Book Details</h2>
        <div className="w-10" />
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 md:p-12">
        <div className="flex flex-col md:flex-row gap-12">
          <div className="w-full md:w-64 flex-shrink-0">
            <img 
              src={book.thumbnail} 
              alt={book.title} 
              className="w-full aspect-[2/3] object-cover rounded-2xl shadow-2xl mb-6 ring-1 ring-white/10" 
              referrerPolicy="no-referrer" 
            />
            <div className="space-y-3">
              <button 
                onClick={onStartReading}
                className="btn-gold w-full flex items-center justify-center gap-2"
              >
                <BookOpen className="w-5 h-5" /> Start Reading
              </button>
              
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-3">Status</p>
                <div className="flex flex-col gap-2">
                  {(['want-to-read', 'currently-reading', 'read'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => handleSave(s)}
                      className={`text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                        isSaved && (book as UserBook).status === s 
                          ? 'bg-gold-accent/20 text-gold-accent font-bold' 
                          : 'text-gray-400 hover:bg-white/5'
                      }`}
                    >
                      {s.replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {lists.length > 0 && (
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-3">Add to List</p>
                  <div className="flex flex-col gap-2">
                    {lists.map(list => {
                      const isInList = list.bookIds?.includes(book.id);
                      return (
                        <button
                          key={list.docId}
                          onClick={() => toggleListMembership(list)}
                          className={`text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                            isInList 
                              ? 'bg-white/10 text-off-white font-bold' 
                              : 'text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          {list.name}
                          {isInList && <Check className="w-4 h-4 text-gold-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-4xl font-serif font-bold mb-2 leading-tight text-off-white">{book.title}</h1>
            <p className="text-xl text-gray-400 mb-8 font-sans">{book.authors?.join(', ')}</p>

            <div className="grid grid-cols-2 gap-8 mb-12">
              {book.publicationDate && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Published</p>
                  <p className="font-sans text-off-white">{book.publicationDate}</p>
                </div>
              )}
              {book.genre && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Genre</p>
                  <p className="font-sans text-off-white">{book.genre}</p>
                </div>
              )}
            </div>

            <div className="prose prose-invert max-w-none">
              <h3 className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-4">Description</h3>
              <p className="text-gray-300 leading-relaxed font-sans whitespace-pre-wrap">
                {book.description}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const BookReader = ({ book, user, onBack }: { book: UserBook | Book, user: any, onBack: () => void }) => {
  const [isReading, setIsReading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState((book as UserBook).progress || 0);

  const isSaved = 'docId' in book;

  const handleSave = async (status: 'want-to-read' | 'currently-reading' | 'read') => {
    if (!user) return signIn();
    try {
      if (isSaved) {
        await updateDoc(doc(db, 'userBooks', (book as UserBook).docId), { status });
      } else {
        await addDoc(collection(db, 'userBooks'), {
          ...book,
          uid: user.uid,
          status,
          progress: 0,
          currentPage: 0,
          lastReadAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'userBooks');
    }
  };

  const handleTTS = async () => {
    if (audioUrl) {
      if (isReading) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
      setIsReading(!isReading);
      return;
    }

    setLoadingAudio(true);
    const base64 = await generateSpeech(book.content || book.description);
    if (base64) {
      const url = `data:audio/wav;base64,${base64}`;
      setAudioUrl(url);
      setIsReading(true);
    }
    setLoadingAudio(false);
  };

  const updateProgress = async (newProgress: number) => {
    setProgress(newProgress);
    if (isSaved && user) {
      try {
        await updateDoc(doc(db, 'userBooks', (book as UserBook).docId), { 
          progress: newProgress,
          lastReadAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Progress update failed", error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-midnight-bg z-[60] flex flex-col overflow-hidden">
      <header className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-surface">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center flex-1">
          <h2 className="font-serif font-bold text-lg line-clamp-1 text-off-white">{book.title}</h2>
          <p className="text-xs text-gray-500 font-sans">{book.authors?.join(', ')}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isSaved && (
            <button 
              onClick={() => handleSave('want-to-read')}
              className="p-2 text-gray-500 hover:text-gold-accent transition-colors"
              title="Add to Library"
            >
              <Bookmark className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={handleTTS}
            disabled={loadingAudio}
            className={`p-2 rounded-full transition-all ${isReading ? 'bg-gold-accent/20 text-gold-accent' : 'hover:bg-white/5 text-gray-400'}`}
          >
            {loadingAudio ? <Loader2 className="w-6 h-6 animate-spin" /> : isReading ? <Pause className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 bg-midnight-bg">
        <div className="max-w-2xl mx-auto">
          <img src={book.thumbnail} alt={book.title} className="w-56 h-80 mx-auto object-cover rounded-2xl shadow-2xl mb-12 ring-1 ring-white/10" referrerPolicy="no-referrer" />
          <div className="font-serif text-xl leading-relaxed text-gray-300 space-y-8 first-letter:text-6xl first-letter:font-bold first-letter:mr-4 first-letter:float-left first-letter:text-gold-accent">
            {book.content ? (
              book.content.split('\n').map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p>{book.description}</p>
            )}
          </div>
        </div>
      </main>

      <footer className="p-6 bg-slate-surface border-t border-white/5">
        <div className="max-w-2xl mx-auto flex items-center gap-6">
          <span className="text-xs font-sans font-bold text-gray-500 tracking-widest">{Math.round(progress)}%</span>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={progress} 
            onChange={(e) => updateProgress(parseInt(e.target.value))}
            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-gold-accent"
          />
          <div className="flex items-center gap-2">
            <button onClick={() => updateProgress(Math.max(0, progress - 5))} className="p-2 hover:bg-white/5 rounded-full text-gray-400"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={() => updateProgress(Math.min(100, progress + 5))} className="p-2 hover:bg-white/5 rounded-full text-gray-400"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </footer>

      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onEnded={() => setIsReading(false)}
          onPlay={() => setIsReading(true)}
          onPause={() => setIsReading(false)}
        />
      )}
    </div>
  );
};

export default function App() {
  const [user] = useAuthState(auth);
  const [activeTab, setActiveTab] = useState<'search' | 'library'>('search');
  const [selectedBook, setSelectedBook] = useState<Book | UserBook | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'reading'>('details');

  const handleSelectBook = (book: Book | UserBook) => {
    setSelectedBook(book);
    setViewMode('details');
  };

  return (
    <div className="min-h-screen bg-midnight-bg text-off-white selection:bg-gold-accent/20 selection:text-gold-accent">
      <Navbar user={user} />
      
      <main className="pb-24">
        {activeTab === 'search' ? (
          <SearchSection onSelectBook={handleSelectBook} />
        ) : (
          <LibrarySection user={user} onReadBook={handleSelectBook} />
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-slate-surface/80 backdrop-blur-xl border-t border-white/5 p-4 flex justify-center gap-16 z-50">
        <button 
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-gold-accent' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <SearchIcon className="w-6 h-6" />
          <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em]">Explore</span>
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'library' ? 'text-gold-accent' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <LibraryIcon className="w-6 h-6" />
          <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em]">Library</span>
        </button>
      </footer>

      <AnimatePresence mode="wait">
        {selectedBook && (
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-[60]"
          >
            {viewMode === 'details' ? (
              <BookDetails 
                book={selectedBook} 
                user={user} 
                onBack={() => setSelectedBook(null)}
                onStartReading={() => setViewMode('reading')}
              />
            ) : (
              <BookReader 
                book={selectedBook} 
                user={user} 
                onBack={() => setViewMode('details')} 
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
