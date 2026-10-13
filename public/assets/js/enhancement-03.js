
/* v5.70: One small frame sampler for native HTML5. The unified v5.63
   controller owns all cinema state. No MutationObserver, duplicate global
   cinema callbacks or repaint loop while the video is waiting/hidden. */
(()=>{
  const selector='#cgVideoContainer .client-video-card video';
  const resources=new WeakMap();
  function setup(video){
    if(resources.has(video))return resources.get(video);
    const host=video.closest('.client-video-left');if(!host)return null;
    const canvas=document.createElement('canvas');
    canvas.className='amorri-ambient-canvas';canvas.width=72;canvas.height=40;
    canvas.setAttribute('aria-hidden','true');
    host.insertBefore(canvas,host.firstChild);
    const ctx=canvas.getContext('2d',{alpha:false});
    const state={canvas,ctx,id:0,active:false,last:0,failed:false};
    const targetMs=matchMedia('(hover:none)').matches?330:180;
    function step(now){
      if(!state.active)return;
      if(!video.isConnected||video.paused||video.ended){stop();return;}
      if(!document.hidden && video.readyState>=3 && now-state.last>=targetMs && !state.failed){
        state.last=now;
        try{ctx.drawImage(video,0,0,canvas.width,canvas.height)}
        catch(_){state.failed=true;canvas.style.background='radial-gradient(ellipse,#765449,#27252a 68%,transparent)';}
      }
      state.id=requestAnimationFrame(step);
    }
    function start(){if(state.active)return;state.active=true;state.id=requestAnimationFrame(step);}
    function stop(){state.active=false;cancelAnimationFrame(state.id);}
    state.start=start;state.stop=stop;
    resources.set(video,state);return state;
  }
  document.addEventListener('play',e=>{const v=e.target;if(v instanceof HTMLVideoElement&&v.matches(selector))setup(v)?.start();},true);
  for(const ev of ['pause','ended','emptied'])document.addEventListener(ev,e=>{const v=e.target;if(v instanceof HTMLVideoElement&&v.matches(selector))resources.get(v)?.stop();},true);
  document.addEventListener('visibilitychange',()=>{
    document.querySelectorAll(selector).forEach(v=>{
      const r=resources.get(v);if(!r)return;
      if(document.hidden)r.stop();else if(!v.paused&&!v.ended)r.start();
    });
  });
})();

//# sourceURL=assets/js/enhancement-03.js
