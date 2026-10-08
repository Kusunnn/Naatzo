const MAX_INPUT_CHARS = 500_000;
const CHUNK_CHARS = 8_000;

function splitText(text, size = CHUNK_CHARS) {
  if (!Number.isInteger(size) || size < 2) throw new Error('Tamaño de fragmento inválido');
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + size, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end - 1);
      const space = text.lastIndexOf(' ', end - 1);
      const boundary = Math.max(newline, space);
      if (boundary > offset + size / 2) end = boundary + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}

module.exports = { MAX_INPUT_CHARS, CHUNK_CHARS, splitText };
