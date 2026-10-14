/** Only old objects from a DIFFERENT confirmed Drive revision are candidates for deletion. */
export function classifyStaleR2Object(entry,currentRevision,now=Date.now(),minAgeDays=30){
  const match=/^videos\/([A-Za-z0-9_-]{10,200})\/([a-f0-9]{24})\/(1080p|original)\.mp4$/.exec(entry.Path||'');
  if(!match)return {eligible:false,reason:'unrecognized-key'};
  const age=now-Date.parse(entry.ModTime);
  if(!Number.isFinite(age)||age<minAgeDays*86400000)return {eligible:false,reason:'too-recent'};
  if(!/^[a-f0-9]{24}$/.test(currentRevision||''))return {eligible:false,reason:'current-revision-unknown'};
  if(currentRevision===match[2])return {eligible:false,reason:'current-revision'};
  return {eligible:true,reason:'old-revision',fileId:match[1],revision:match[2]};
}

/** Never delete a superseded revision until current 1080p exists on R2. */
export function hasReplacement1080(objects,id,currentRevision){
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(id)||!/^[a-f0-9]{24}$/.test(currentRevision||''))return false;
 const wanted=`${id}/${currentRevision}/1080p.mp4`;
 return Array.isArray(objects)&&objects.some(entry=>entry.Path===wanted&&entry.IsDir===false&&Number(entry.Size)>0);
}
