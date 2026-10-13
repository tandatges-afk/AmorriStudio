
/* v5.62: native-video keyboard control is a single keydown action.
   Capture/consume keyup too: Chromium's native media-control shadow DOM can
   otherwise react to release and immediately resume a paused Drive video. */
(() => {
  const blocked='input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="button"], [role="slider"], [role="combobox"], [role="menuitem"], [role="checkbox"], [role="radio"]';
  let handledSpace=false;
  function galleryVisible(){
    const gallery=document.getElementById('clientGalleryView');
    return gallery && gallery.getClientRects().length && getComputedStyle(gallery).display!=='none' ? gallery : null;
  }
  function ignore(e){
    if(e.code!=='Space' && e.key!==' ')return true;
    if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.isComposing)return true;
    const active=document.activeElement;
    // Never capture form typing or keyboard activation of controls.
    return !!(e.target instanceof Element && e.target.closest(blocked)) || !!active?.closest?.(blocked);
  }
  function pickVideo(gallery){
    const displayed=(node)=>node.getClientRects().length>0 && getComputedStyle(node).display!=='none' && getComputedStyle(node).visibility!=='hidden';
    const videos=[...gallery.querySelectorAll('#cgVideoContainer .client-video-card video')]
      .filter(v=>displayed(v) && (v.currentSrc || v.src));
    if(!videos.length)return null;
    const active=document.activeElement;
    if(active instanceof HTMLVideoElement && videos.includes(active))return active;
    const playing=videos.find(v=>!v.paused&&!v.ended);
    if(playing)return playing;
    const center=innerHeight/2;
    return videos.filter(v=>{const r=v.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;})
      .sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return Math.abs((ar.top+ar.bottom)/2-center)-Math.abs((br.top+br.bottom)/2-center)})[0] || videos[0];
  }
  function capture(e){
    if(ignore(e) || !galleryVisible())return;
    const video=pickVideo(galleryVisible());
    if(!video)return; // A cross-origin Drive fallback iframe cannot be controlled from the parent document.
    if(e.type==='keydown'){
      e.preventDefault();e.stopImmediatePropagation();
      if(e.repeat || handledSpace)return;
      handledSpace=true;
      if(video.paused || video.ended){video.play()?.catch?.(err=>console.warn('[Amorri] Space play rejected:',err));}
      else video.pause();
    }else if(handledSpace){
      e.preventDefault();e.stopImmediatePropagation();
      if(e.type==='keyup')handledSpace=false;
    }
  }
  document.addEventListener('keydown',capture,true);
  document.addEventListener('keypress',capture,true);
  document.addEventListener('keyup',capture,true);
  window.addEventListener('blur',()=>{handledSpace=false});
})();

//# sourceURL=assets/js/enhancement-01.js
