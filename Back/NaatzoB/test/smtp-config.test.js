const {test}=require('node:test');
const assert=require('node:assert/strict');
const {smtpConfig}=require('../src/config/smtp');

test('SMTP uses either environment naming convention and validates credentials',t=>{
  const keys=['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','SMTP_PASS','EMAIL_FROM','SMTP_FROM'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}});
  for(const key of keys)delete process.env[key];
  assert.equal(smtpConfig().configured,false);
  Object.assign(process.env,{SMTP_HOST:'smtp.example.test',SMTP_PORT:'465',SMTP_USER:'sender@example.test',SMTP_PASS:'fake-app-password',SMTP_FROM:'Naatzo <sender@example.test>',SMTP_SECURE:'false'});
  assert.equal(smtpConfig().configured,true);
  assert.equal(smtpConfig().options.secure,true);
  assert.equal(smtpConfig().options.auth.pass,'fake-app-password');
  delete process.env.SMTP_FROM;
  assert.equal(smtpConfig().from,'sender@example.test');
  delete process.env.SMTP_PASS;
  assert.equal(smtpConfig().configured,false);
  process.env.SMTP_PASSWORD='another-fake-password';
  process.env.EMAIL_FROM='Naatzo <sender@example.test>';
  assert.equal(smtpConfig().configured,true);
  process.env.SMTP_PORT='invalid';
  assert.equal(smtpConfig().configured,false);
});
