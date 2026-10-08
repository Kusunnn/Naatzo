const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';
Object.assign(process.env,{SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'fake-password',EMAIL_FROM:'sender@example.test'});
const {newDb}=require('pg-mem');
const {Pool}=newDb().adapters.createPg();
const pool=new Pool();
const db=require('../src/db/postgres');
db.query=(...args)=>pool.query(...args);
let accepted=true;
let deliveries=0;
require('nodemailer').createTransport=()=>({sendMail:async message=>{deliveries++;return {accepted:accepted?[message.to]:[],rejected:accepted?[]:[message.to],messageId:'test-message'};}});
const mail=require('../src/services/emailService');
const message={to:'recipient@example.test',subject:'Prueba',text:'Descripción con acentos'};

test('only SMTP acceptance counts as sent and rejected notifications remain retryable',async t=>{
  t.after(()=>pool.end());
  const result=await mail.sendEmail(message);
  assert.equal(result.sent,true);assert.equal(result.messageId,'test-message');
  accepted=false;
  await assert.rejects(()=>mail.sendEmail(message),error=>error.code==='ERECIPIENT');
  accepted=true;deliveries=0;
  assert.equal(await mail.sendOnce('reminder-test',message),true);
  assert.equal(deliveries,1);
  assert.equal((await pool.query("SELECT status FROM naatzo_email_log WHERE key='reminder-test'")).rows[0].status,'sent');
  accepted=false;
  await assert.rejects(()=>mail.sendOnce('rejected-test',message),error=>error.code==='ERECIPIENT');
  assert.equal((await pool.query("SELECT status FROM naatzo_email_log WHERE key='rejected-test'")).rows[0].status,'failed');
});
