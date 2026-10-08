const { HttpError } = require('./http');
const MAX_CHARS = 30_000;

function combineProjectInput(documentText, comments) {
  if(comments!==undefined && typeof comments!=='string')throw new HttpError(400,'Los comentarios deben ser texto.');
  const note=(comments||'').trim();
  if(note.length>MAX_CHARS)throw new HttpError(400,'Los comentarios no pueden pasar de 30,000 caracteres.');
  if(!documentText)return note;
  if(!note)return documentText.slice(0,MAX_CHARS);
  const prefix='Comentarios y objetivo del usuario:\n'+note+'\n\nContenido del documento:\n';
  if(prefix.length>=MAX_CHARS)throw new HttpError(400,'Reduce los comentarios para dejar espacio al documento.');
  return prefix+documentText.slice(0,MAX_CHARS-prefix.length);
}

module.exports={combineProjectInput};
