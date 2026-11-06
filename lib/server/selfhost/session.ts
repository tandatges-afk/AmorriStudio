import {createHmac, timingSafeEqual} from 'node:crypto';

type Session={uid:string;email:string;epoch:number;exp:number;iss:string};
const COOKIE='amorri_session';
function secret(){
 const value=process.env.AMORRI_SESSION_SECRET||'';
 if(value.length<48)throw new Error('AMORRI_SESSION_SECRET is missing or too short');
 return value;
}
function sign(content:string){return createHmac('sha256',secret()).update(content).digest('base64url');}
export function issueSelfHostedToken(user:{uid:string;email:string;session_epoch:number}){
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(user.uid)||!user.email.includes('@'))throw new Error('Invalid local identity');
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const body=Buffer.from(JSON.stringify({uid:user.uid,email:user.email,epoch:Number(user.session_epoch),exp:Math.floor(Date.now()/1000)+12*3600,iss:'amorri-local-v1'})).toString('base64url');
 const unsigned=`${header}.${body}`;
 return unsigned+'.'+sign(unsigned);
}
export function verifySelfHostedToken(token:string):Session{
 if(typeof token!=='string'||token.length>4096)throw new Error('Invalid session');
 const parts=token.split('.');
 if(parts.length!==3)throw new Error('Invalid JWT');
 const actual=Buffer.from(parts[2],'base64url');
 const expected=Buffer.from(sign(parts[0]+'.'+parts[1]),'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected)||parts[2]!==sign(parts[0]+'.'+parts[1]))throw new Error('Invalid signature');
 const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')) as {alg?:string};
 const data=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')) as Session;
 if(header.alg!=='HS256'||data.iss!=='amorri-local-v1'||!Number.isInteger(data.exp)||data.exp<=Date.now()/1000 ||
 !Number.isInteger(data.epoch)||data.epoch<0||!/^[A-Za-z0-9_-]{1,160}$/.test(data.uid)||typeof data.email!=='string')throw new Error('Invalid claims');
 return data;
}
export function parseSelfHostedCookie(header:string|null):string|null{
 const pair=(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 return pair?.slice(COOKIE.length+1)||null;
}
export function selfHostedCookie(token:string,maxAge=43200){
 return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
