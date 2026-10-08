const {test}=require('node:test');
const assert=require('node:assert/strict');
const nodemailer=require('nodemailer');
const {renderEmail}=require('../src/services/emailTemplates');

function decodeSubject(header){
  return header.replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/gi,(_,encoding,value)=>{
    if(encoding.toUpperCase()==='B')return Buffer.from(value,'base64').toString('utf8');
    const bytes=value.replace(/_/g,' ').replace(/=([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    return Buffer.from(bytes,'latin1').toString('utf8');
  });
}

test('real multipart email keeps accented subject, plain text and HTML characters',async()=>{
  const payload=renderEmail('invitation',{recipientName:'María',inviterName:'José',projectName:'Exposición de química',expiresAt:'2026-10-14T18:00:00Z',url:'https://example.test/invite/test'});
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});
  const result=await transport.sendMail({from:'sender@example.test',to:'recipient@example.test',...payload,textEncoding:'base64'});
  const mime=result.message.toString('utf8');
  const unfolded=mime.replace(/\r?\n[ \t]+/g,'');
  const subject=unfolded.match(/^Subject: (.*)$/m)[1].trim();
  assert.equal(decodeSubject(subject),payload.subject);
  const boundary=mime.match(/boundary="([^"]+)"/)[1];
  const parts=mime.split('--'+boundary);
  for(const type of ['text/plain','text/html']){
    const part=parts.find(p=>p.includes('Content-Type: '+type));
    assert.ok(part);
    assert.match(part,/charset=utf-8/i);
    assert.match(part,/Content-Transfer-Encoding: base64/i);
    const encoded=part.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/\s/g,'');
    const decoded=Buffer.from(encoded,'base64').toString('utf8').trimEnd();
    assert.equal(decoded,type==='text/plain'?payload.text:payload.html);
    if(type==='text/plain'){assert.match(decoded,/Inicia sesión/);assert.match(decoded,/Exposición de química/);assert.match(decoded,/José/);}
    else{assert.match(decoded,/Invitaci&#243;n|invitaci&#243;n/);assert.match(decoded,/qu&#237;mica/);}
  }
});
