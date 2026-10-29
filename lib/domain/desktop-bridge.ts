/** Only the installed Electron shell handles this scheme, not ordinary browsers. */
export function desktopDriveFolderId(url:string):string|null{
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.hostname!=='drive.google.com'||parsed.username||parsed.password)return null;
  return parsed.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,160})\/?$/)?.[1]||null;
 }catch{return null;}
}
export function isDesktopBrowser():boolean{
 return typeof navigator!=='undefined'&&navigator.userAgent.includes('AmorriDesktop/');
}
export function desktopRawFilterUrl(url:string,names:string[]):string|null{
 const folderId=desktopDriveFolderId(url);
 if(!folderId||names.length<1||names.length>2500)return null;
 if(names.some(n=>typeof n!=='string'||n.length>255||! /^[^\\/\x00-\x1f]+\.jpe?g$/i.test(n)))return null;
 const command=`amorri-desktop://filter?folderId=${encodeURIComponent(folderId)}&names=${encodeURIComponent(JSON.stringify(names))}`;
 return command.length<=220000?command:null;
}
export function openDesktopCommand(command:string):void{
 // Electron handles this trusted internal scheme in setWindowOpenHandler.
 window.open(command,'_blank','noopener');
}

/** Open only the folder previously created by the trusted Electron RAW filter. */
export function desktopOpenFilteredFolderUrl(url:string):string|null{
 const id=desktopDriveFolderId(url);
 return id?`amorri-desktop://open-loc?folderId=${encodeURIComponent(id)}`:null;
}
