const {test}=require('node:test');
const assert=require('node:assert/strict');
const {callChatbot}=require('../src/services/chatbotProxyService');
const originalFetch=global.fetch;
test('chatbot proxy reports disconnected service and missing keys clearly',async t=>{
 t.after(()=>{global.fetch=originalFetch;});
 global.fetch=async()=>{throw new TypeError('fetch failed');};
 await assert.rejects(callChatbot('/chat'),e=>e.statusCode===503 && /apagado/.test(e.message));
 global.fetch=async()=>new Response(JSON.stringify({error:'EMBEDDINGS_API_KEY no definida en .env'}),{status:500});
 await assert.rejects(callChatbot('/chat'),e=>e.statusCode===503 && /clave de Gemini/.test(e.message));
 global.fetch=async()=>new Response('internal provider details',{status:500});
 await assert.rejects(callChatbot('/chat'),e=>e.statusCode===502 && !e.message.includes('internal provider details'));
 global.fetch=async()=>new Response(JSON.stringify({answer:'Hola'}),{status:200,headers:{'Content-Type':'application/json'}});
 assert.deepEqual(await callChatbot('/chat'),{answer:'Hola'});
});
