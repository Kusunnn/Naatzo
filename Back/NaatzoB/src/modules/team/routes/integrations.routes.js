const router=require('express').Router();
const {asyncHandler}=require('../middleware/errorHandler');
const connection=require('../integrations/githubConnection');
const {HttpError}=require('../utils/http');
// Never forward upstream axios objects: they can contain authorization headers.
function safe(fn){return asyncHandler(async(req,res)=>{
  try{res.json(await fn(req.user.id));}catch(error){
    if(error instanceof HttpError)throw error;
    res.status(502).json({ok:false,error:'No se pudo contactar a GitHub. Intenta nuevamente.'});
  }
});}
router.get('/github',safe(connection.status));
router.post('/github/connect',safe(connection.begin));
router.post('/github/complete',safe(connection.complete));
router.delete('/github',safe(id=>{connection.disconnect(id);return {connected:false};}));
module.exports=router;
