#!/usr/bin/env node
/**
 * Repair a partial Amorri v3.2.0 patch without rolling back R2 API/worker.
 * Restores the locally committed Dashboard, then adds the Video R2 tab ONLY
 * when the old Dashboard has known-compatible system tab anchors.
 */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root = process.cwd();
const path = resolve(root,'components/Dashboard.tsx');
if (!existsSync(path)) throw new Error('Không tìm thấy components/Dashboard.tsx. Hãy chạy từ thư mục gốc AmorriStudio.');
if (!existsSync(resolve(root,'components/VideoSyncMonitor.tsx'))) throw new Error('Thiếu components/VideoSyncMonitor.tsx từ PATCH 3.2.0.');
let original;
try{original=execFileSync('git',['show','HEAD:components/Dashboard.tsx'],{cwd:root,encoding:'utf8'});}
catch{throw new Error('Git HEAD không có Dashboard.tsx. Không tự ý ghi đè; hãy khôi phục từ bản commit hoạt động trước đó.');}

// A partially updated repository may have already committed the broken Dashboard.
const requiredFiles=[
  ['@/lib/domain/vietnam-money', 'lib/domain/vietnam-money.ts'],
  ["'./SystemHealth'",'components/SystemHealth.tsx'],
  ["'./v30.css'",'components/v30.css'],
];
const missing=requiredFiles.filter(([marker,relative])=>original.includes(marker)&&!existsSync(resolve(root,relative)));
if(missing.length){
  throw new Error('Dashboard trong Git HEAD cũng thiếu dependency: '+missing.map(x=>x[1]).join(', ')+'. Chọn một commit Dashboard hoạt động trước đó hoặc cung cấp đầy đủ mã nguồn.');
}
const thumbPath=resolve(root,'components/AdminThumbnail.tsx');
if(original.includes('THUMB_CACHE_NAME')&&existsSync(thumbPath)&&!readFileSync(thumbPath,'utf8').includes('export const THUMB_CACHE_NAME')){
  throw new Error('Dashboard trong Git HEAD cũng cần export THUMB_CACHE_NAME không tồn tại. Cần chọn commit Dashboard cũ hơn; không tự thay API thumbnail.');
}
const backup=join(tmpdir(),`amorri-dashboard-before-3-2-repair-${Date.now()}.tsx`);
writeFileSync(backup,readFileSync(path));
let result=original;
let integrated=false;
const typeMatch=result.match(/type\s+SystemSection\s*=\s*[^;]+;/);
const navMatch=result.match(/<button\b(?:(?!<\/button>)[\s\S])*?setSystemSection\(['"]data['"]\)(?:(?!<\/button>)[\s\S])*?<\/button>/);
const healthAnchor=/\{systemSection===['"]health['"]&&<SystemHealth\s+user=\{user\}\s*\/>\}/;
if(typeMatch&&navMatch&&healthAnchor.test(result)&&!result.includes('VideoSyncMonitor')){
  result=result.replace(typeMatch[0],typeMatch[0].replace(/;$/, "|'video';"));
  result=result.replace(navMatch[0],navMatch[0]+"\n            <button type=\"button\" className={systemSection==='video'?'active':''} onClick={()=>setSystemSection('video')}>Video R2</button>");
  result=result.replace(healthAnchor,match=>match+"\n          {systemSection==='video'&&<VideoSyncMonitor user={user}/>} ");
  result=result.replace(/^(['"]use client['"];?)/, "$1\nimport {VideoSyncMonitor} from './VideoSyncMonitor';");
  integrated=true;
}
writeFileSync(path,result);
console.log('Đã khôi phục Dashboard từ Git HEAD; bản cũ lưu tạm tại:',backup);
console.log(integrated?'Đã ghép tab Video R2 vào Hệ thống, không thay đổi dependency khác.':'Dashboard khác cấu trúc dự kiến; không chỉnh tab để tránh lỗi build. Xem Video R2 tại /admin/video-r2.');
console.log('Tiếp theo: npm run typecheck && npm run build');
