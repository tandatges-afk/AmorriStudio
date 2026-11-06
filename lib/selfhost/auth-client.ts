'use client';
import {onAuthStateChanged as firebaseOnAuthStateChanged,signInWithEmailAndPassword as firebaseSignIn,signOut as firebaseSignOut,type User as FirebaseUser,type Auth as FirebaseAuth} from 'firebase/auth';
/** Replacement for only the Firebase Auth client operations Amorri uses.
 * JWT is stored in memory; the refresh cookie is HttpOnly and SameSite=Strict.
 */
export type LocalUser={uid:string;email:string|null;getIdToken:(forceRefresh?:boolean)=>Promise<string>};
export type User=FirebaseUser|LocalUser;
export type LocalAuth={currentUser:LocalUser|null};
type Auth=LocalAuth|FirebaseAuth;
const localMode=process.env.NEXT_PUBLIC_AMORRI_AUTH_BACKEND==='local';
const auth:LocalAuth={currentUser:null};
const listeners=new Set<(u:LocalUser|null)=>void>();
let token='';let initializing:Promise<void>|null=null;
const notify=()=>{for(const fn of listeners)fn(auth.currentUser);};
function identity(value:{uid:string;email:string}):LocalUser{
 return {uid:value.uid,email:value.email,getIdToken:async(force=false)=>{
  if(force||!token){
   const response=await fetch('/api/auth/local/session',{cache:'no-store',credentials:'same-origin'});
   if(!response.ok){token='';auth.currentUser=null;notify();throw new Error('Phiên đăng nhập đã hết hạn');}
   const result=await response.json() as {token:string};token=result.token;
  }
  return token;
 }};
}
export function localBrowserAuth():LocalAuth{return auth;}
async function hydrate(){
 try{
  const r=await fetch('/api/auth/local/session',{cache:'no-store',credentials:'same-origin'});
  if(r.ok){const data=await r.json() as {token:string;user:{uid:string;email:string}};token=data.token;auth.currentUser=identity(data.user);}
  else{token='';auth.currentUser=null;}
 }catch{token='';auth.currentUser=null;}
 notify();
}
function localOnAuthStateChanged(_auth:Auth,listener:(u:User|null)=>void,onError?:(e:Error)=>void){
 listeners.add(listener);
 if(!initializing)initializing=hydrate().catch(e=>{onError?.(e as Error);});
 else if(initializing)void initializing.then(()=>{if(listeners.has(listener))listener(auth.currentUser);});
 return ()=>{listeners.delete(listener);};
}
async function localSignInWithEmailAndPassword(_auth:Auth,identifier:string,password:string){
 const r=await fetch('/api/auth/local/login',{method:'POST',headers:{'Content-Type':'application/json'},
  credentials:'same-origin',body:JSON.stringify({identifier,password}),cache:'no-store'});
 if(!r.ok)throw new Error('Tên tài khoản hoặc mật khẩu không đúng');
 const data=await r.json() as {token:string;user:{uid:string;email:string}};
 token=data.token;auth.currentUser=identity(data.user);notify();return {user:auth.currentUser};
}
async function localSignOut(_auth:Auth){
 try{await fetch('/api/auth/local/logout',{method:'POST',credentials:'same-origin'});}finally{token='';auth.currentUser=null;notify();}
}

export function onAuthStateChanged(instance:Auth,callback:(u:User|null)=>void,onError?:(e:Error)=>void){
 if(!localMode)return firebaseOnAuthStateChanged(instance as FirebaseAuth,callback,onError);
 return localOnAuthStateChanged(instance,callback,onError);
}
export function signInWithEmailAndPassword(instance:Auth,email:string,password:string){
 if(!localMode)return firebaseSignIn(instance as FirebaseAuth,email,password);
 return localSignInWithEmailAndPassword(instance,email,password);
}
export function signOut(instance:Auth){
 if(!localMode)return firebaseSignOut(instance as FirebaseAuth);
 return localSignOut(instance);
}
