const GUTENDEX_BASE_URL =
  process.env.GUTENDEX_BASE_URL || "https://gutendex.com/books/";
const catalogCache = new Map();
const catalogPending = new Map();
const CACHE_TTL = 10 * 60 * 1000;

async function loadCatalog(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        const error = new Error(`Gutenberg respondió ${response.status}`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      if (!Array.isArray(payload.results) || !Number.isFinite(payload.count)) throw new Error('Respuesta inválida de Gutenberg');
      return payload;
    } catch (error) {
      lastError = error;
      if (error.retryable === false) break;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
  throw new Error(`No se pudo conectar con Gutenberg después de reintentar (${lastError.message}). Intenta nuevamente en unos momentos.`);
}

function normalizeBook(book) {
  const formats = book.formats || {};
  const cover = formats["image/jpeg"]
    ? formats["image/jpeg"]
    : "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80";

  // Prefer an HTML reader, then EPUB, and finally plain text. Gutenberg
  // exposes these links in the formats object for each public-domain book.
  const pdfLink =
    formats["text/html"] ||
    formats["application/epub+zip"] ||
    formats["text/plain"] ||
    `https://www.gutenberg.org/ebooks/${book.id}`;

  return {
    id: String(book.id),
    title: book.title || "Sin titulo",
    author: Array.isArray(book.authors) && book.authors[0]
      ? book.authors[0].name
      : "Autor desconocido",
    cover,
    pdfLink,
    topics: Array.isArray(book.subjects) ? book.subjects.slice(0, 5) : [],
  };
}

async function browseBooks({ query, topic, page = 1 }) {
  const params = new URLSearchParams({
    page: String(page),
  });

  if (topic) params.set("topic", topic);
  if (query && query.trim()) {
    params.set("search", query.trim());
  } else {
    params.set("sort", "popular");
  }

  const url = `${GUTENDEX_BASE_URL}?${params.toString()}`;

  const cached = catalogCache.get(url);
  let payload;
  let stale = false;
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    payload = cached.payload;
  } else {
    let pending = catalogPending.get(url);
    if (!pending) {
      pending = loadCatalog(url).then(result => {
        if (catalogCache.size >= 100) catalogCache.delete(catalogCache.keys().next().value);
        catalogCache.set(url, { at: Date.now(), payload: result });
        return result;
      }).finally(() => catalogPending.delete(url));
      catalogPending.set(url, pending);
    }
    try { payload = await pending; }
    catch (error) {
      if (!cached) throw error;
      payload = cached.payload;
      stale = true;
    }
  }
  const books = Array.isArray(payload.results) ? payload.results : [];
  return { books: books.map(normalizeBook), count: payload.count || 0, page, stale,
    hasNext: Boolean(payload.next), hasPrevious: Boolean(payload.previous) };
}

async function searchBooks({ query, topic, limit = 12 }) {
  const payload = await browseBooks({ query, topic });
  return payload.books.slice(0, Math.max(1, Math.min(Number(limit) || 12, 32)));
}

function resolveBookTopic(query) {
  const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return TASK_TOPICS.find(({ pattern }) => pattern.test(normalized))?.topic;
}

const TASK_TOPICS = [
  { pattern: /\b(calculo|derivadas?|integrales?|limites?|calculus)\b/, topic: 'calculus', label: 'cálculo' },
  { pattern: /\b(algebra|ecuaciones?|polinomios?)\b/, topic: 'algebra', label: 'álgebra' },
  { pattern: /\b(geometria|triangulos?|trigonometria)\b/, topic: 'geometry', label: 'geometría' },
  { pattern: /\b(matematicas?|aritmetica|fracciones?)\b/, topic: 'mathematics', label: 'matemáticas' },
  { pattern: /\b(fisica|mecanica|newton|movimiento|energia)\b/, topic: 'physics', label: 'física' },
  { pattern: /\b(quimica|atomos?|moleculas?)\b/, topic: 'chemistry', label: 'química' },
  { pattern: /\b(biologia|celulas?|fotosintesis|genetica)\b/, topic: 'biology', label: 'biología' },
  { pattern: /\b(historia|revolucion|history)\b/, topic: 'history', label: 'historia' },
  { pattern: /\b(filosofia|etica)\b/, topic: 'philosophy', label: 'filosofía' },
  { pattern: /\b(literatura|poesia|novelas?)\b/, topic: 'literature', label: 'literatura' },
  { pattern: /\b(economia|economics)\b/, topic: 'economics', label: 'economía' },
];

async function recommendBooks({ title, description = '', limit = 2 }) {
  const text = `${title} ${description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = TASK_TOPICS.find(({ pattern }) => pattern.test(text));
  const books = await searchBooks({
    topic: match?.topic,
    query: match ? '' : keywordFromTask(title),
    limit,
  });
  return books.map(book => ({
    ...book,
    reason: match
      ? `Este libro puede servir para tu tarea de ${match.label}: su catálogo lo clasifica en este tema. No se han revisado capítulos específicos.`
      : 'Este libro coincide con palabras del título de tu tarea. Revisa su contenido para confirmar que te sea útil.',
  }));
}

function calculateBestDay(dueAtIso) {
  if (!dueAtIso) {
    return "Hoy";
  }

  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) {
    return "Hoy";
  }

  const recommended = new Date(due.getTime() - 24 * 60 * 60 * 1000);
  return recommended.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
}

function keywordFromTask(taskTitle) {
  if (!taskTitle || typeof taskTitle !== "string") {
    return "productividad";
  }
  const cleaned = taskTitle
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  return cleaned || "productividad";
}

module.exports = {
  searchBooks,
  browseBooks,
  resolveBookTopic,
  recommendBooks,
  calculateBestDay,
  keywordFromTask,
};
