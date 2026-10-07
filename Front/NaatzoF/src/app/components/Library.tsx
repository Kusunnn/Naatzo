import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Search, Library as LibraryIcon } from 'lucide-react';
import { apiRequest } from '../services/api';

interface LibraryBook {
  id: string;
  title: string;
  author: string;
  cover: string;
  pdfLink: string;
  topics?: string[];
}

export function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const loadBooks = async () => {
      try {
        const payload = await apiRequest<{ books: LibraryBook[]; count: number; hasNext: boolean; stale?: boolean }>(
          `/books/search?q=${encodeURIComponent(searchQuery)}&page=${page}&topic=${selectedCategory === 'all' ? '' : encodeURIComponent(selectedCategory)}`,
          { signal: controller.signal }
        );

        if (!isMounted) {
          return;
        }

        setBooks(payload.books || []);
        setCount(payload.count);
        setHasNext(payload.hasNext);
        setStale(Boolean(payload.stale));
      } catch (error) {
        if (isMounted) {
          setBooks([]);
          setError(error instanceof Error ? error.message : 'No se pudo consultar Gutenberg. Intenta nuevamente.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = window.setTimeout(() => void loadBooks(), 350);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, selectedCategory, page, retry]);

  const categories = [
    ['all', 'Todos'], ['calculus', 'Cálculo'], ['mathematics', 'Matemáticas'],
    ['physics', 'Física'], ['chemistry', 'Química'], ['biology', 'Biología'],
    ['history', 'Historia'], ['literature', 'Literatura'], ['philosophy', 'Filosofía'],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary via-background to-secondary p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-foreground mb-2 flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-lg">
              <LibraryIcon className="w-6 h-6 text-white" />
            </div>
            Biblioteca Digital
          </h1>
          <p className="text-muted-foreground">
            Explora libros de dominio público disponibles en Project Gutenberg
          </p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar título, autor o tema (por ejemplo, cálculo)..."
              className="w-full pl-12 pr-4 py-3 bg-card rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-ring transition-all shadow-sm"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map(([category, label]) => (
              <button
                key={category}
                onClick={() => { setSelectedCategory(category); setSearchQuery(''); setPage(1); }}
                className={`px-4 py-2 rounded-xl transition-all font-medium ${
                  selectedCategory === category
                    ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg'
                    : 'bg-secondary text-foreground hover:bg-muted hover:shadow-sm'
                }`}
              >
                    {label}
              </button>
            ))}
          </div>
        </div>

        {!loading && !error && stale && <p role="status" className="mb-4 text-muted-foreground">Gutenberg no respondió. Mostramos la última página guardada temporalmente.</p>}
        {loading ? <p role="status">Consultando Gutenberg… Si tarda, reintentaremos automáticamente.</p> : error ? (
          <div role="alert"><p>{error}</p><button className="mt-3 text-primary underline" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>
        ) : books.length === 0 ? (
          <div className="bg-card rounded-3xl shadow-xl border border-border p-12 text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-foreground mb-2">No se encontraron libros</h2>
            <p className="text-muted-foreground">
              Intenta con otra búsqueda o categoría
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {books.map((book) => (
              <a
                key={book.id}
                href={book.pdfLink}
                target="_blank"
                rel="noreferrer"
                className="bg-card rounded-3xl shadow-xl border border-border overflow-hidden hover:shadow-2xl transition-all hover:-translate-y-1 group"
              >
                <div className="aspect-[2/3] overflow-hidden bg-muted">
                  <img
                    src={book.cover}
                    alt={book.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-foreground group-hover:text-primary transition-colors mb-1">
                    {book.title}
                  </h3>
                  <p className="text-muted-foreground mb-2">{book.author}</p>
                  <span className="inline-block px-2 py-1 bg-secondary text-foreground rounded text-sm">
                    {(book.topics?.[0] || 'General')}
                  </span>
                  <div className="flex items-center gap-2 mt-3 text-primary">
                    <ExternalLink className="w-4 h-4" />
                    <span>Leer en Gutenberg</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
        {!loading && !error && count > 0 && (
          <nav aria-label="Páginas de la biblioteca" className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="px-4 py-2 rounded-xl bg-secondary disabled:opacity-40">Anterior</button>
            <span aria-live="polite">Página {page} de {Math.ceil(count / 32)} · {count.toLocaleString('es-MX')} libros</span>
            <button disabled={!hasNext} onClick={() => setPage(value => value + 1)} className="px-4 py-2 rounded-xl bg-secondary disabled:opacity-40">Siguiente</button>
          </nav>
        )}
      </div>
    </div>
  );
}
