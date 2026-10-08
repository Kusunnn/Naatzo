const {test} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxy = require('../src/services/chatbotProxyService');
const repository = require('../src/repositories/dbRepository');
const requests = [];
const files = [];
proxy.callChatbot = async (path, options) => {
  requests.push({path, body: JSON.parse(options.body)});
  return {resourceId: 'resource-test', documentId: 'document-test'};
};
repository.readDb = async () => ({chatbotFiles: files});
repository.writeDb = async () => {};
const {upload} = require('../src/controllers/chatbotController');
const {receiveFile} = require('../src/modules/team/utils/documents');
const {errorHandler} = require('../src/middleware/errorHandler');

test('chat attachment sends extracted text to ingestion and rejects invalid files and foreign owners', async t => {
  const app = express();
  app.post('/files', (req, res, next) => {req.user={id:'owner'}; next();}, receiveFile, upload);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = async (name, content, owner='owner') => {
    const body = new FormData();
    body.append('userId', owner);
    body.append('file', new Blob([content]), name);
    return fetch(`http://localhost:${server.address().port}/files`, {method:'POST', body});
  };
  const text = 'La química estudia la composición de la materia y sus cambios.';
  const response = await send('apuntes.txt', text);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(requests[0].body.text, text);
  assert.equal(requests[0].path, '/ingest');
  assert.equal(result.file.documentId, 'document-test');
  assert.equal(result.file.resourceId, 'resource-test');
  assert.match(requests[0].body.url, /^user-upload:\/\/owner\//);
  assert.equal((await send('falso.pdf', text)).status, 415);
  assert.equal((await send('viejo.doc', text)).status, 415);
  assert.equal((await send('vacio.txt', '')).status, 400);
  assert.equal((await send('apuntes.txt', text, 'another-user')).status, 403);
  assert.equal(requests.length, 1);
});
