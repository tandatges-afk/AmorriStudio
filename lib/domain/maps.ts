/** Allow only Google-owned map URLs as pasted links. All other text becomes a map search. */
export function googleMapUrl(raw: string): string | null {
  const value=raw.trim();if(!value)return null;
  try {
    const url=new URL(value);
    const host=url.hostname.toLowerCase();
    if(url.protocol==='https:' && (host==='maps.app.goo.gl'||host==='goo.gl'||host==='maps.google.com'||host==='www.google.com'||host==='google.com'||host==='google.com.vn'||host==='www.google.com.vn') &&
      (host==='maps.app.goo.gl'||host==='goo.gl'||url.pathname.startsWith('/maps')||url.pathname.startsWith('/url')||url.pathname==='/'))return url.href;
  }catch{/* address or search text */}
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
}
