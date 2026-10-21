export const MAX_CONCEPT_PHOTOS=6;
export const MAX_CONCEPT_BYTES=2_500_000;
export const EVENT_ID=/^[A-Za-z0-9_-]{12,100}$/;
export const PHOTO_ID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
/** Trust file signatures, not extensions or the browser-reported MIME type. Never accept SVG. */
export function detectConceptImage(bytes){
 const b=Buffer.from(bytes);
 if(b.length<12||b.length>MAX_CONCEPT_BYTES)return null;
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return {type:'image/jpeg',ext:'jpg'};
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {type:'image/png',ext:'png'};
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return {type:'image/webp',ext:'webp'};
 return null;
}
