
/* One Drive stream per browser tab while viewing a gallery. */
(()=>{document.addEventListener('play',event=>{
  const current=event.target;
  if(!(current instanceof HTMLVideoElement)||!current.closest('#cgVideoContainer'))return;
  document.querySelectorAll('#cgVideoContainer .client-video-card video').forEach(video=>{
    if(video!==current && !video.paused)video.pause();
  });
},true);})();

//# sourceURL=assets/js/enhancement-06.js
