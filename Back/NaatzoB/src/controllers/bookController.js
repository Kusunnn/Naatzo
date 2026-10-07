const { browseBooks, resolveBookTopic } = require("../services/bookService");

async function search(req, res, next) {
  try {
    // An empty query intentionally loads Gutenberg's popular books.
    const q = req.query.q === undefined ? "" : String(req.query.q).trim();
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Página inválida' });
    const topic = String(req.query.topic || resolveBookTopic(q) || '');
    const payload = await browseBooks({ query: resolveBookTopic(q) ? '' : q, topic, page });
    res.json({ query: q, ...payload });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  search,
};
