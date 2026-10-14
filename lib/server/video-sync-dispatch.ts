/** Server-only GitHub workflow dispatcher. Never expose PAT to browsers.
 * If no token is configured, scheduled sync still runs automatically. */
import 'server-only';
export type Source={type:'file'|'folder';id:string};
export type DispatchResult={queued:boolean;reason:string};
const ID=/^[A-Za-z0-9_-]{10,200}$/;
export async function dispatchR2Sync(source:Source):Promise<DispatchResult>{
  const token=(process.env.AMORRI_GITHUB_ACTIONS_DISPATCH_TOKEN||'').trim();
  if(!token)return {queued:false,reason:'hourly-scan-only'};
  if(!ID.test(source.id)||!['file','folder'].includes(source.type))return {queued:false,reason:'invalid-source'};
  const repo=process.env.AMORRI_GITHUB_ACTIONS_REPOSITORY||'tandatges-afk/AmorriStudio';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))return {queued:false,reason:'invalid-repository'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(`https://api.github.com/repos/${repo}/actions/workflows/r2-video-sync.yml/dispatches`,{
      method:'POST',signal:controller.signal,cache:'no-store',
      headers:{'Accept':'application/vnd.github+json','Content-Type':'application/json',
        'Authorization':`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},
      body:JSON.stringify({ref:'main',inputs:{drive_file_id:source.type==='file'?source.id:'',dry_run:false}})
    });
    if(response.status===204)return {queued:true,reason:'github-dispatch-accepted'};
    // Log only status: GitHub response may contain identifiers, never include credentials.
    console.warn('[video-sync-dispatch]',{httpStatus:response.status});
    return {queued:false,reason:`github-http-${response.status}`};
  }catch(error){
    console.warn('[video-sync-dispatch] GitHub request unavailable',error instanceof Error?error.name:'unknown');
    return {queued:false,reason:'github-unavailable'};
  }finally{clearTimeout(timer);}
}
