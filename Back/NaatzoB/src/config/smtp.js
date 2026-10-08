function smtpConfig() {
  const host=(process.env.SMTP_HOST||'').trim();
  const user=(process.env.SMTP_USER||'').trim();
  const pass=process.env.SMTP_PASSWORD||process.env.SMTP_PASS;
  const from=(process.env.EMAIL_FROM||process.env.SMTP_FROM||user).trim();
  const port=Number(process.env.SMTP_PORT||587);
  return {
    configured:Boolean(host&&from&&Number.isInteger(port)&&port>0&&port<=65535&&(!user||pass)),
    from,
    options:{host,port,secure:port===465||process.env.SMTP_SECURE==='true',auth:user?{user,pass}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000},
  };
}
module.exports={smtpConfig};
