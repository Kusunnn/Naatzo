const GUTENDEX_BASE_URL =
  process.env.GUTENDEX_BASE_URL || "https://gutendex.com/books/";

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

async function searchBooks({ query, limit = 12 }) {
  const safeLimit = Math.max(1, Math.min(limit, 32));
  const params = new URLSearchParams({
    page: "1",
  });

  if (query && query.trim()) {
    params.set("search", query.trim());
  } else {
    params.set("sort", "popular");
  }

  const url = `${GUTENDEX_BASE_URL}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Project Gutenberg error: ${response.status}`);
  }

  const payload = await response.json();
  const books = Array.isArray(payload.results) ? payload.results : [];
  return books.slice(0, safeLimit).map(normalizeBook);
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
  calculateBestDay,
  keywordFromTask,
};
