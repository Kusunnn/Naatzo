const {test}=require('node:test');
const assert=require('node:assert/strict');
require('@octokit/rest');
const connection=require('../src/modules/team/integrations/githubConnection');
const requests=[];
const FakeOctokit=class {
  constructor(options){
    requests.push({auth:options.auth});
    this.rest={repos:{
      createInOrg:async()=>{throw new Error('Should not create in the global organization');},
      createForAuthenticatedUser:async params=>{
        requests.push(params);
        return {data:{owner:{login:'connected-owner'},name:params.name,default_branch:'main',html_url:'https://github.com/connected-owner/project'}};
      },
    },git:{
      getRef:async()=>({data:{object:{sha:'base'}}}),
      getCommit:async()=>({data:{tree:{sha:'tree-base'}}}),
      createTree:async params=>{requests.push(params);return {data:{sha:'tree'}};},
      createCommit:async()=>({data:{sha:'commit'}}),
      updateRef:async()=>({}),
    }};
  }
};
require.cache[require.resolve('@octokit/rest')].exports={Octokit:FakeOctokit};
const github=require('../src/modules/team/integrations/github');
test('publishing uses the project owner account and returns the repository URL',async t=>{
  const original=connection.account;
  t.after(()=>{connection.account=original;});
  connection.account=id=>id==='project-owner'?{token:'private-test-token',login:'connected-owner'}:null;
  const result=await github.publishRepo({userId:'project-owner',name:'project',description:'Project',files:[{path:'README.md',content:'Project'}]});
  assert.equal(requests[0].auth,'private-test-token');
  assert.equal(requests[1].private,false);
  assert.equal(requests[2].owner,'connected-owner');
  assert.equal(requests[2].tree[0].content,'Project');
  assert.equal(result.url,'https://github.com/connected-owner/project');
});
