// Hackatec: credentials remain server-side in memory, never in browser storage.
const axios = require('axios');
const env = require('../config/env');
const {HttpError} = require('../utils/http');
const pending = new Map();
const accounts = new Map();
const options = {headers:{Accept:'application/json'},timeout:15000};
function account(userId) {
  const entry = accounts.get(String(userId));
  if (entry && entry.expiresAt > Date.now()) return entry;
  accounts.delete(String(userId));
  return null;
}
function status(userId) {
  const entry = account(userId);
  return {available:Boolean(env.GITHUB_CLIENT_ID),connected:Boolean(entry),login:entry?.login || null};
}
async function begin(userId) {
  if(!env.GITHUB_CLIENT_ID)throw new HttpError(503,'Falta GITHUB_CLIENT_ID. Registra una OAuth App en GitHub y habilita Device flow.');
  const {data} = await axios.post('https://github.com/login/device/code',{client_id:env.GITHUB_CLIENT_ID,scope:'public_repo'},options);
  if(data.error || !data.device_code)throw new HttpError(502,'GitHub no pudo iniciar la autorización. Revisa el Client ID y Device flow.');
  pending.set(String(userId),{code:data.device_code,expiresAt:Date.now()+data.expires_in*1000,interval:(data.interval || 5)*1000,nextPoll:Date.now()+(data.interval || 5)*1000});
  return {userCode:data.user_code,verificationUrl:'https://github.com/login/device',expiresIn:data.expires_in};
}
async function complete(userId) {
  const key=String(userId);
  const request=pending.get(key);
  if(!request || request.expiresAt<=Date.now()){pending.delete(key);throw new HttpError(410,'La autorización expiró. Vuelve a conectar GitHub.');}
  if(Date.now()<request.nextPoll)return {pending:true,message:'Espera unos segundos antes de comprobar de nuevo.'};
  request.nextPoll=Date.now()+request.interval;
  const {data}=await axios.post('https://github.com/login/oauth/access_token',{client_id:env.GITHUB_CLIENT_ID,device_code:request.code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'},options);
  if(['authorization_pending','slow_down'].includes(data.error)){
    if(data.error==='slow_down'){request.interval+=5000;request.nextPoll=Date.now()+request.interval;}
    return {pending:true,message:'Autoriza en GitHub y vuelve a comprobar.'};
  }
  if(data.error || !data.access_token){pending.delete(key);throw new HttpError(400,'GitHub no autorizó la conexión. Vuelve a intentarlo.');}
  const {data:user}=await axios.get('https://api.github.com/user',{headers:{Authorization:`Bearer ${data.access_token}`,Accept:'application/vnd.github+json'},timeout:15000});
  accounts.set(key,{token:data.access_token,login:user.login,expiresAt:Date.now()+Math.min(data.expires_in || 28800,28800)*1000});
  pending.delete(key);
  return {...status(userId),pending:false};
}
function disconnect(userId){accounts.delete(String(userId));pending.delete(String(userId));}
module.exports={account,status,begin,complete,disconnect};
