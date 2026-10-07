// src/utils/documents.js
//
// Saca el texto de una minuta subida como archivo: PDF (pdf-parse, como en
// KIBO 1), Word .docx (mammoth) o texto plano (.txt / .md).
// El formato se revisa por extension y por los primeros bytes del archivo,
// para no confiar solo en lo que dice el navegador.

const path = require("path");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const { HttpError } = require("./http");

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CHARS = 30_000; // lo mismo que acepta el Analista
const MIN_CHARS = 20;

const FORMATS = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "txt",
};

// Recibe un solo archivo en el campo "file", en memoria (no toca el disco).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** Mensajes de multer en espanol (los usa el manejador de errores). */
function describeUploadError(err) {
  if (err.code === "LIMIT_FILE_SIZE") return new HttpError(413, "El archivo pasa de 5 MB");
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
    return new HttpError(400, 'Sube un solo archivo en el campo "file"');
  }
  return new HttpError(400, `No se pudo recibir el archivo: ${err.message}`);
}

/**
 * Middleware: recibe el archivo opcional del campo "file" (solo si la peticion
 * es multipart) y traduce los errores de multer.
 */
function receiveFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) {
      // multer lee el nombre como Latin-1; se pasa a UTF-8 para que "minuta_reunión.pdf" se vea bien.
      if (req.file) req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      return next();
    }
    next(err instanceof multer.MulterError ? describeUploadError(err) : err);
  });
}

/** Misma limpieza que KIBO 1: saltos de linea normales y sin espacios de sobra. */
function cleanText(text) {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectFormat(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const format = FORMATS[ext];
  if (!format) {
    const extra = ext === ".doc" ? " (los .doc viejos no; guardalo como .docx)" : "";
    throw new HttpError(415, `Formato no soportado${extra}. Usa PDF, DOCX o TXT`);
  }
  const head = file.buffer.subarray(0, 4).toString("latin1");
  if (format === "pdf" && !head.startsWith("%PDF")) throw new HttpError(415, "El archivo no es un PDF valido");
  // Un .docx es un ZIP: empieza con "PK".
  if (format === "docx" && !head.startsWith("PK")) throw new HttpError(415, "El archivo no es un .docx valido");
  return format;
}

/** Texto plano: UTF-8, y si trae caracteres invalidos se lee como Latin-1 (Bloc de notas viejo). */
function decodePlainText(buffer) {
  const utf8 = buffer.toString("utf8").replace(/^﻿/, "");
  return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    // Se juntan las paginas a mano: data.text trae separadores "-- 1 of 2 --" que confundirian al Analista.
    return { text: data.pages.map((p) => p.text).join("\n\n"), pages: data.total };
  } catch (err) {
    throw new HttpError(422, `No se pudo leer el PDF: ${err.message}`);
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer) {
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value };
  } catch (err) {
    throw new HttpError(422, `No se pudo leer el .docx: ${err.message}`);
  }
}

/**
 * @param {{ buffer: Buffer, originalname: string, size: number }} file  archivo de multer
 * @returns {Promise<{ text: string, format: string, filename: string, pages: number|null,
 *                     chars: number, truncated: boolean }>}
 */
async function extractText(file) {
  if (!file || !file.buffer || file.size === 0) throw new HttpError(400, 'Falta el archivo en el campo "file"');
  const format = detectFormat(file);

  let result;
  if (format === "pdf") result = await extractPdf(file.buffer);
  else if (format === "docx") result = await extractDocx(file.buffer);
  else result = { text: decodePlainText(file.buffer) };

  let text = cleanText(result.text);
  if (text.length < MIN_CHARS) {
    throw new HttpError(
      422,
      format === "pdf"
        ? "No se encontro texto en el PDF. Si es un PDF escaneado (una imagen), pega el texto a mano"
        : "El archivo casi no tiene texto",
    );
  }

  // El Analista lee hasta 30,000 caracteres; lo demas se corta y se avisa.
  const chars = text.length;
  const truncated = chars > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);

  return { text, format, filename: file.originalname, pages: result.pages ?? null, chars, truncated };
}

module.exports = { receiveFile, extractText, MAX_BYTES, MAX_CHARS };
