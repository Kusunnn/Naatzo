const { HttpError } = require('./http');
const { MAX_INPUT_CHARS: MAX_CHARS } = require('./textChunks');

function combineProjectInput(documentText, comments) {
  if(comments!==undefined && typeof comments!=='string')throw new HttpError(400,'Los comentarios deben ser texto.');
  const note=(comments||'').trim();
  if(note.length>MAX_CHARS)throw new HttpError(400,`Los comentarios no pueden pasar de ${MAX_CHARS} caracteres.`);
  if(documentText === undefined || documentText === null)return note;
  if(typeof documentText !== 'string' || !documentText.trim())throw new HttpError(422,'No se pudo extraer contenido del documento. No se analizará solo la descripción.');
  if(documentText.length>MAX_CHARS)throw new HttpError(422,`El documento supera los ${MAX_CHARS} caracteres. Divide el archivo para analizar su contenido completo.`);
  if(!note)return documentText;
  const combined='Contenido del documento (fuente principal):\n'+documentText+'\n\nComentarios adicionales del usuario (contexto secundario):\n'+note;
  if(combined.length>MAX_CHARS)throw new HttpError(422,`El documento y los comentarios superan los ${MAX_CHARS} caracteres. Reduce los comentarios o divide el archivo; no se recortará el documento.`);
  return combined;
}

module.exports={combineProjectInput};
