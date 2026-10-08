const fs=require('fs');
const path=require('path');
const dotenv=require('dotenv');
function smtpConfig() {
  // Load from the backend's own file, independent of the terminal directory.
  // Empty inherited variables must not hide configured local SMTP credentials.
  let local={};
  if(process.env.NODE_ENV!=='test')try{local=dotenv.parse(fs.readFileSync(path.join(__dirname,'../../.env')));}catch{}
  const value=key=>process.env[key]?.trim()||local[key]?.trim()||'';
  const host=value('SMTP_HOST');
  const user=value('SMTP_USER');
  const pass=value('SMTP_PASSWORD')||value('SMTP_PASS');
  const from=value('EMAIL_FROM')||value('SMTP_FROM')||user;
  const port=Number(value('SMTP_PORT')||587);
  return {
    configured:Boolean(host&&from&&Number.isInteger(port)&&port>0&&port<=65535&&(!user||pass)),
    from,
    options:{host,port,secure:port===465||value('SMTP_SECURE')==='true',auth:user?{user,pass}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000},
  };
}
module.exports={smtpConfig};
