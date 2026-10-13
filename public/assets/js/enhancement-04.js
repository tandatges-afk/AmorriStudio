
(()=>{
  'use strict';
  const gallery=document.getElementById('clientGalleryView');
  if(!gallery)return;
  let isActive=false,activeCard=null,lastPaletteBucket=-1,paletteTimer=null;
  const reduced=window.matchMedia('(prefers-reduced-motion:reduce)');
  const stage=document.createElement('div');
  stage.id='amorri-ambient-stage';stage.setAttribute('aria-hidden','true');
  const mountingHost=gallery.querySelector('.gallery-container');
  if(mountingHost)mountingHost.prepend(stage);
  function ensureHost(){
    const host=gallery.querySelector('.gallery-container');
    if(host&&stage.parentElement!==host)host.prepend(stage);
  }
  function getCards(){return [...gallery.querySelectorAll('#cgVideoContainer .client-video-card')];}
  function isVisible(){return getComputedStyle(gallery).display!=='none';}
  function moveStage(){
    if(!activeCard?.isConnected)return;
    const frame=activeCard.querySelector('.client-video-frame');
    if(!frame)return;
    const r=frame.getBoundingClientRect();
    if(r.width<10||r.height<10)return;
    stage.style.setProperty('--ambient-x',((r.left+r.width/2)/window.innerWidth*100).toFixed(2)+'%');
    stage.style.setProperty('--ambient-y',((r.top+r.height/2)/window.innerHeight*100).toFixed(2)+'%');
    stage.style.setProperty('--ambient-width',Math.min(window.innerWidth*1.45,Math.max(520,r.width*1.46)).toFixed(0)+'px');
    stage.style.setProperty('--ambient-height',Math.min(window.innerHeight*1.7,Math.max(340,r.height*1.65)).toFixed(0)+'px');
  }
  function palette(){
    if(!isActive||!activeCard || activeCard.dataset.vrType!=='youtube'||reduced.matches)return;
    // YouTube cross-origin video pixels are inaccessible. These smoothly changing
    // hues are a simulated halo. Never show thumbnails as a fake video frame.
    let time=0;
    try{
      const key=activeCard.dataset.vrProduct;
      const p=window.__amorriYtPlayers?.get?.(key);
      time=Number(p?.getCurrentTime?.())||0;
    }catch(_){}
    const bucket=Math.floor(time/9);
    if(bucket===lastPaletteBucket)return;
    lastPaletteBucket=bucket;
    const palettes=[
      ['166,106,83','74,134,118','121,91,144'],
      ['146,119,81','75,111,172','135,90,116'],
      ['125,100,150','64,120,139','190,110,85'],
      ['170,96,94','78,100,150','135,128,94']
    ];
    const selected=palettes[bucket%palettes.length];
    stage.style.setProperty('--ambient-c1-color','rgb('+selected[0]+')');
    stage.style.setProperty('--ambient-c2-color','rgb('+selected[1]+')');
    stage.style.setProperty('--ambient-c3-color','rgb('+selected[2]+')');
  }
  function refresh(){
    ensureHost();
    if(!isVisible()){
      isActive=false;activeCard=null;
    }else{
      const cards=getCards();
      const playing=cards.find(c=>c.classList.contains('vr-ambient-playing'));
      isActive=!!playing;
      activeCard=playing||null;
    }
    stage.classList.toggle('ambient-active',isActive && activeCard?.dataset.vrType==='youtube');
    document.body.classList.toggle('amorri-cinema',isActive);
    gallery.classList.toggle('amorri-cinema-active',isActive);
    if(!isActive){
      lastPaletteBucket=-1;
      if(paletteTimer){clearInterval(paletteTimer);paletteTimer=null;}
    }else{
      moveStage();palette();
      if(!paletteTimer)paletteTimer=setInterval(()=>{if(isActive){moveStage();palette();}},1800);
    }
  }
  let centerLast=0;
  function center(card){
    if(reduced.matches||Date.now()-centerLast<1800)return;
    centerLast=Date.now();
    requestAnimationFrame(()=>{
      const r=card.querySelector('.client-video-frame')?.getBoundingClientRect();
      if(!r)return;
      const dest=Math.max(0,scrollY+r.top+r.height/2-innerHeight/2);
      if(Math.abs(dest-scrollY)>36)window.scrollTo({top:dest,behavior:'smooth'});
    });
  }
  // Preserve the v5.60 event-level Firebase logic. Only change presentation state.
  window.amorriSetIframeCinema=(node,playing)=>{
    const card=node?.closest?.('.client-video-card');
    if(!card?.isConnected)return;
    const wasActive=isActive;
    card.classList.toggle('vr-ambient-playing',!!playing);
    refresh();
    if(playing&&!wasActive)center(card);
  };
  const srcSelector='#cgVideoContainer .client-video-card video';
  document.addEventListener('play',e=>{
    const video=e.target;if(!(video instanceof HTMLVideoElement)||!video.matches(srcSelector))return;
    video.closest('.client-video-card')?.classList.add('vr-ambient-playing');refresh();
  },true);
  document.addEventListener('pause',e=>{
    const video=e.target;if(!(video instanceof HTMLVideoElement)||!video.matches(srcSelector))return;
    video.closest('.client-video-card')?.classList.remove('vr-ambient-playing');refresh();
  },true);
  document.addEventListener('ended',e=>{
    const video=e.target;if(!(video instanceof HTMLVideoElement)||!video.matches(srcSelector))return;
    video.closest('.client-video-card')?.classList.remove('vr-ambient-playing');refresh();
  },true);
  // Geometry follows page scrolling/resizing without re-rendering the video.
  window.addEventListener('scroll',()=>{if(isActive)moveStage();},{passive:true});
  window.addEventListener('resize',()=>{if(isActive)moveStage();},{passive:true});
  // MutationObserver only watches card creations/removals, not inner text/comments.
  const cardsContainer=document.getElementById('cgVideoContainer');
  if(cardsContainer)new MutationObserver(()=>refresh()).observe(cardsContainer,{childList:true,subtree:false});
  refresh();
})();

//# sourceURL=assets/js/enhancement-04.js
