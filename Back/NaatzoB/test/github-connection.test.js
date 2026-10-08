const {test}=require('node:test');
const assert=require('node:assert/strict');
const axios=require('axios');
const env=require('../src/modules/team/config/env');
const connection=require('../src/modules/team/integrations/githubConnection');

test('GitHub device connection is isolated per user, never exposes tokens and can disconnect',async t=>{
  const post=axios.post,get=axios.get,clientId=env.GITHUB_CLIENT_ID;
  t.after(()=>{axios.post=post;axios.get=get;env.GITHUB_CLIENT_ID=clientId;connection.disconnect('owner');});
  env.GITHUB_CLIENT_ID='client-test';
  let now=100000;
  t.mock.method(Date,'now',()=>now);
  let count=0;
  axios.post=async(url,body)=>{
    count++;
    if(url.endsWith('/device/code')){
      assert.equal(body.scope,'public_repo');
      return {data:{device_code:'secret-device',user_code:'TEST-CODE',expires_in:900,interval:5}};
    }
    assert.equal(body.device_code,'secret-device');
    return {data:{access_token:'secret-access',expires_in:3600}};
  };
  axios.get=async(url,options)=>{
    assert.equal(url,'https://api.github.com/user');
    assert.equal(options.headers.Authorization,'Bearer secret-access');
    return {data:{login:'test-account'}};
  };
  const begin=await connection.begin('owner');
  assert.equal(begin.userCode,'TEST-CODE');
  assert.ok(!JSON.stringify(begin).includes('secret-device'));
  assert.equal((await connection.complete('owner')).pending,true);
  assert.equal(count,1);
  now+=5001;
  assert.equal((await connection.complete('owner')).login,'test-account');
  assert.equal(connection.status('other').connected,false);
  assert.ok(!JSON.stringify(connection.status('owner')).includes('secret-access'));
  assert.equal(connection.account('owner').token,'secret-access');
  now+=3600001;
  assert.equal(connection.status('owner').connected,false);
  connection.disconnect('owner');
  await assert.rejects(connection.complete('owner'),/expiró/);
});

test('expired or refused device requests never connect an account',async t=>{
  const post=axios.post,clientId=env.GITHUB_CLIENT_ID;
  t.after(()=>{axios.post=post;env.GITHUB_CLIENT_ID=clientId;connection.disconnect('refused');});
  env.GITHUB_CLIENT_ID='client-test';
  let now=100000;t.mock.method(Date,'now',()=>now);
  axios.post=async url=>({data:url.endsWith('/device/code')?{device_code:'x',user_code:'x',expires_in:900,interval:5}:{error:'access_denied'}});
  await connection.begin('refused');now+=6000;
  await assert.rejects(connection.complete('refused'),/no autorizó/);
  assert.equal(connection.status('refused').connected,false);
});
