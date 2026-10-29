import {contextBridge,ipcRenderer} from 'electron';
const call=(name:string,...args:unknown[])=>ipcRenderer.invoke(name,...args);
contextBridge.exposeInMainWorld('amorriDesktopTools',{
 status:()=>call('tools:status'),pickJpg:()=>call('tools:pick-jpg'),setNames:(s:string[])=>call('tools:set-names',s),
 rawPreflight:()=>call('tools:raw-preflight'),scanRaw:()=>call('tools:scan-raw'),copyRaw:()=>call('tools:copy-raw'),openOutput:()=>call('tools:open-output'),
 driveLogin:()=>call('tools:drive-login'),driveFullLogin:()=>call('tools:drive-full-login'),driveLogout:()=>call('tools:drive-logout'),
 createUpload:(name:string)=>call('tools:create-upload',name),stageFolder:(name:string)=>call('tools:stage-folder',name),
 knownClients:()=>call('tools:known-clients'),selectClient:(folder:string)=>call('tools:select-client',folder),
 driveAccount:()=>call('tools:drive-account'),listDriveStorages:()=>call('tools:list-drive-storages'),
 createDriveStorage:(name:string,parent?:string)=>call('tools:create-drive-storage',name,parent),selectDriveStorage:(id:string)=>call('tools:select-drive-storage',id),
 pickExistingDrive:()=>call('tools:pick-existing-drive'),stageSelectedDrive:(id:string,name:string)=>call('tools:stage-selected-drive',id,name),
 knownFolders:()=>call('tools:known-folders'),stageKnownFolder:(folderId:string,name:string)=>call('tools:stage-known-folder',folderId,name),
 onProgress:(cb:(msg:string)=>void)=>ipcRenderer.on('amorri-tools-progress',(_e,text)=>cb(String(text))),
 onSelection:(cb:(names:string[])=>void)=>ipcRenderer.on('amorri-tools-selection',(_e,names)=>cb(names)),
 onDriveRequest:(cb:()=>void)=>ipcRenderer.on('amorri-tools-drive-request',()=>cb()),
});
