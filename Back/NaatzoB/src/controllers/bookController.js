const { searchBooks } = require("../services/bookService");

async function search(req, res, next) {
  try {
    // An empty query intentionally loads Gutenberg's popular books.
    const q = req.query.q === undefined ? "" : String(req.query.q).trim();
    const limit = Number(req.query.limit || 12);
    const books = await searchBooks({ query: q, limit });
    res.json({ query: q, books });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  search,
};
