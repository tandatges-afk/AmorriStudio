'use strict';
const api=window.amorriDesktopTools;
const el=id=>document.getElementById(id);
const stack=[{id:'root',name:'My Drive'}];let chosen=null,mode='product',list=[],results=null,epoch=0,timer=null,busy=false;
const hint=s=>{el('message').textContent=String(s)};
el('closePicker').onclick=()=>void api.closeWindow().catch(e=>hint(e.message||String(e)));
if(typeof document.addEventListener==='function')document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();void api.closeWindow().catch(err=>hint(err.message||String(err)));}});
const show=items=>{
 const host=el('folders');host.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Không tìm thấy thư mục phù hợp.';host.append(empty);return;}
 for(const folder of items){const b=document.createElement('button');b.type='button';b.className='item'+(chosen?.id===folder.id?' active':'');
  const icon=document.createElement('span');icon.className='mark';icon.textContent='▣';const name=document.createElement('span');name.className='name';name.textContent=folder.name;
  const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='›';b.append(icon,name,arrow);
  b.onclick=async()=>{if(busy)return;chosen=folder;el('chosen').textContent=folder.name;el('confirm').disabled=false;
   if(results!==null){stack.splice(1,stack.length-1,folder);results=null;el('search').value='';}else stack.push(folder);
   await load();};host.append(b);
 }
};
async function load(){const token=++epoch;const target=stack.at(-1);el('back').disabled=stack.length===1;el('crumb').textContent=stack.slice(1).map(f=>' / '+f.name).join('');
 const host=el('folders');host.replaceChildren();const msg=document.createElement('p');msg.className='empty';msg.textContent='Đang tải...';host.append(msg);
 try{const items=await api.driveChildren(target.id);if(token!==epoch)return;list=items;show(list);}catch(e){if(token===epoch)hint(e.message||String(e));}
}
el('back').onclick=async()=>{if(stack.length<=1)return;stack.pop();chosen=stack.at(-1).id==='root'?(mode==='upload'?{id:'root',name:'My Drive'}:null):stack.at(-1);el('chosen').textContent=chosen?.name||'Chưa chọn thư mục';el('confirm').disabled=!chosen;results=null;el('search').value='';await load();};
el('root').onclick=async()=>{stack.splice(1);chosen=mode==='upload'?{id:'root',name:'My Drive'}:null;el('chosen').textContent=chosen?.name||'Chưa chọn thư mục';el('confirm').disabled=!chosen;results=null;el('search').value='';await load();};
el('search').oninput=()=>{clearTimeout(timer);const term=el('search').value.trim();if(!term){++epoch;results=null;show(list);return;}if(term.length<2){show([]);return;}timer=setTimeout(async()=>{const token=++epoch;try{const found=await api.driveSearch(term);if(token!==epoch)return;results=found;show(found);}catch(e){hint(e.message||String(e));}},250);};
el('confirm').onclick=async()=>{if(!chosen||busy)return;busy=true;el('confirm').disabled=true;hint(mode==='upload'?'Đang tạo folder và upload JPG…':'Đang đưa folder vào sản phẩm…');
 try{await api.pickerConfirm(chosen.id,chosen.name);}catch(e){hint('Lỗi: '+(e.message||String(e)));busy=false;el('confirm').disabled=false;}
};
(async()=>{try{const context=await api.pickerContext();mode=context.mode==='upload'?'upload':'product';
 if(mode==='upload'){el('heading').textContent='Chọn thư mục cha';el('description').textContent='Chọn xong app sẽ tạo tenkhach/jpg và tự upload.';el('confirm').textContent='Chọn & Upload JPG';}
 await load();}catch(e){hint('Lỗi: '+(e.message||String(e)));}})();
