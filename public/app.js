
const $=s=>document.querySelector(s);
let items=[], settings={banner:null,viewerIcon:null},isAdmin=false,editingId=null;

async function api(url,opts={}){
 const res=await fetch(url,{
  credentials:'same-origin',
  ...opts,
  headers:{
   ...(opts.body?{'Content-Type':'application/json'}:{}),
   ...(opts.headers||{})
  }
 });
 let data;
 try{
  data=await res.json();
 }catch{
  throw Error('서버 응답을 확인할 수 없습니다.');
 }
 if(!res.ok)throw Error(data.error||'요청이 실패했습니다.');
 return data;
}

async function reload(){
 const data=await api('/api/public');
 items=data.items;
 settings=data.settings;
 refreshBanner();
 render();
 updateViewerIconControls();
}

function refreshBanner(){
 const src=settings.banner;
 $('#bannerArea').hidden=!src;
 if(src)$('#bannerImage').src=src;
 else $('#bannerImage').removeAttribute('src');
}

function updateViewerIconControls(){
 $('#viewerIconRemove').disabled=!settings.viewerIcon;
 $('#bannerRemove').disabled=!settings.banner;
}

// 이미지 업로드 및 변환 처리
async function fileToDataUrl(file,w,h,quality=0.8){
 if(!file){
  throw new Error('이미지 파일을 선택해 주세요.');
 }

 const supportedTypes=[
  'image/jpeg',
  'image/png',
  'image/webp'
 ];

 if(!supportedTypes.includes(file.type)){
  throw new Error(
   'JPG, PNG, WebP 형식의 이미지만 업로드할 수 있습니다.'
  );
 }

 if(file.size>8*1024*1024){
  throw new Error('8MB 이하의 이미지만 등록할 수 있습니다.');
 }

 const objectUrl=URL.createObjectURL(file);

 try{
  const img=new Image();

  await new Promise((resolve,reject)=>{
   img.onload=()=>resolve();
   img.onerror=()=>reject(
    new Error(
     '이미지를 읽을 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요.'
    )
   );
   img.src=objectUrl;
  });

  if(!img.naturalWidth||!img.naturalHeight){
   throw new Error('이미지 크기를 확인할 수 없습니다.');
  }

  const canvas=document.createElement('canvas');
  canvas.width=w;
  canvas.height=h;

  const ctx=canvas.getContext('2d');

  if(!ctx){
   throw new Error('브라우저에서 이미지 변환을 지원하지 않습니다.');
  }

  const scale=Math.max(
   w/img.naturalWidth,
   h/img.naturalHeight
  );

  const drawWidth=img.naturalWidth*scale;
  const drawHeight=img.naturalHeight*scale;

  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,w,h);

  ctx.drawImage(
   img,
   (w-drawWidth)/2,
   (h-drawHeight)/2,
   drawWidth,
   drawHeight
  );

  try{
   return canvas.toDataURL('image/jpeg',quality);
  }catch{
   throw new Error('이미지를 JPG 형식으로 변환하지 못했습니다.');
  }
 }finally{
  URL.revokeObjectURL(objectUrl);
 }
}

async function setImage(kind,value){
 await api('/api/settings/'+kind,{
  method:'PUT',
  body:JSON.stringify({value})
 });
 await reload();
}

$('#bannerUpload').onchange=async e=>{
 const f=e.target.files?.[0];
 if(!f)return;

 try{
  const imageData=await fileToDataUrl(f,1160,169);
  await setImage('banner',imageData);
  $('#bannerMessage').textContent=
   '사진이 모든 방문자에게 적용되었습니다.';
 }catch(err){
  alert(err.message);
 }
 e.target.value='';
};

$('#viewerIconUpload').onchange=async e=>{
 const f=e.target.files?.[0];
 if(!f)return;

 try{
  const imageData=await fileToDataUrl(f,160,160);
  await setImage('viewerIcon',imageData);
  $('#viewerIconMessage').textContent=
   '공통 이미지가 저장되었습니다.';
 }catch(err){
  alert(err.message);
 }
 e.target.value='';
};

$('#bannerRemove').onclick=async()=>{
 if(!confirm('상단 사진을 삭제할까요?'))return;
 try{
  await setImage('banner',null);
 }catch(e){
  alert(e.message);
 }
};

$('#viewerIconRemove').onclick=async()=>{
 if(!confirm('공통 이미지를 삭제할까요?'))return;
 try{
  await setImage('viewerIcon',null);
 }catch(e){
  alert(e.message);
 }
};

const esc=s=>String(s??'').replace(
 /[&<>"']/g,
 m=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#039;'
 }[m])
);

function badgeClass(s){
 return s==='완료'?'done':s==='진행중'?'progress':'pending';
}

// 룰렛 상품명과 수량 분석
function parsePrizeText(item){
 const raw=String(item.desc||'').trim();

 if(!raw){
  return [{
   label:'룰렛 상품 미등록',
   qty:Math.max(0,Number(item.count)||0)
  }];
 }

 const chunks=raw.split(/[,，\n]+/)
  .map(t=>t.trim())
  .filter(Boolean);

 const structured=chunks.length>1||
  /[＊*]\s*\d+\s*$/.test(raw);

 if(!structured){
  return [{
   label:raw,
   qty:Math.max(0,Number(item.count)||0)
  }];
 }

 return chunks.map(chunk=>{
  const m=chunk.match(/^(.*?)[＊*]\s*(\d+)\s*$/);

  return m&&m[1].trim()
   ?{
    label:m[1].trim(),
    qty:Math.min(999999,Number(m[2]))
   }
   :{
    label:chunk,
    qty:1
   };
 });
}

function prizeCount(item){
 return parsePrizeText(item)
  .reduce((sum,p)=>sum+p.qty,0);
}

// 같은 시청자의 동일한 상품 합산
function aggregatePrizes(records){
 const merged=new Map();

 for(const record of records){
  for(const prize of parsePrizeText(record)){
   const key=prize.label.trim()
    .replace(/\s+/g,' ')
    .toLocaleLowerCase();

   if(!key)continue;

   if(!merged.has(key)){
    merged.set(key,{
     label:prize.label.trim(),
     qty:0,
     ids:[]
    });
   }

   const entry=merged.get(key);
   entry.qty+=prize.qty;

   if(!entry.ids.includes(String(record.id))){
    entry.ids.push(String(record.id));
   }
  }
 }

 return [...merged.values()];
}

function render(){
 const view=items;
 const groups=new Map();
 const commonIcon=settings.viewerIcon;

 for(const x of view){
  const key=(x.viewerId||'').trim()
   ?'id:'+x.viewerId.trim().toLowerCase()
   :'name:'+String(x.name||'').trim().toLowerCase();

  if(!groups.has(key)){
   groups.set(key,{
    name:x.name,
    viewerId:x.viewerId||'',
    image:x.image||'',
    prizes:[]
   });
  }

  const g=groups.get(key);

  if(!g.image&&x.image)g.image=x.image;
  if(!g.viewerId&&x.viewerId)g.viewerId=x.viewerId;

  g.prizes.push(x);
 }

 for(const g of groups.values()){
  g.merged=aggregatePrizes(g.prizes);
 }

 $('#viewerCount').textContent=
  groups.size.toLocaleString('ko-KR')+'명';

 $('#rouletteCount').textContent=
  [...groups.values()].reduce(
   (total,g)=>total+g.merged.reduce(
    (sum,p)=>sum+p.qty,0
   ),0
  ).toLocaleString('ko-KR')+'개';

 const query=($('#viewerSearch')?.value||'')
  .trim()
  .toLocaleLowerCase();

 const matched=[...groups.values()].filter(g=>
  !query||
  String(g.name||'').toLocaleLowerCase().includes(query)||
  String(g.viewerId||'').toLocaleLowerCase().includes(query)
 );

 $('#list').innerHTML=matched.length
  ?matched.map(g=>`<article class="card">
   <div class="viewer-info">
    <div class="upbo-icon">
     ${commonIcon
      ?`<img src="${commonIcon}" alt=""
       onerror="this.remove();this.nextElementSibling.style.display='grid';">
       <span class="fox-fallback" style="display:none">
        <svg class="fox-outline" viewBox="0 0 64 64"
         width="32" height="32" fill="none"
         stroke="currentColor" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round"
         aria-label="여우 아이콘" role="img">
         <path d="M12 29 9 9l17 11h12L55 9l-3 20c3 7 2 15-3 20-5 6-12 9-17 9s-12-3-17-9c-5-5-6-13-3-20Z"/>
         <path d="m22 37 5 3m15-3-5 3M27 48l5 4 5-4M32 52v3"/>
         <path d="M16 31c4-2 9-3 16-3s12 1 16 3"/>
        </svg>
       </span>`
      :`<span class="fox-fallback">
        <svg class="fox-outline" viewBox="0 0 64 64"
         width="32" height="32" fill="none"
         stroke="currentColor" stroke-width="3"
         stroke-linecap="round" stroke-linejoin="round"
         aria-label="여우 아이콘" role="img">
         <path d="M12 29 9 9l17 11h12L55 9l-3 20c3 7 2 15-3 20-5-5-6-13-3-20Z"/>
         <path d="m22 37 5 3m15-3-5 3M27 48l5 4 5-4M32 52v3"/>
         <path d="M16 31c4-2 9-3 16-3s12 1 16 3"/>
        </svg>
       </span>`
     }
    </div>
    <div class="viewer-identity">
     <div class="name">${esc(g.name)}</div>
     <div class="viewer-id">
      ${g.viewerId?'@'+esc(g.viewerId):'아이디 미등록'}
     </div>
    </div>
   </div>
   <div class="viewer-prizes">
    ${g.merged.map(p=>`
     <span class="prize-tag">
      <span class="prize-label">${esc(p.label)}</span>
      <span class="prize-qty">× ${p.qty}개</span>
     </span>
    `).join('')}
    <span class="viewer-total">
     총 ${g.merged.reduce((sum,p)=>sum+p.qty,0)}개
    </span>
   </div>
  </article>`).join('')
  :`<div class="empty">
    ${query?'검색 결과가 없습니다.':'등록된 룰렛 상품이 없습니다.'}
   </div>`;

 if(isAdmin)renderAdmin();
}

function renderAdmin(){
 const box=$('#adminList');

 box.innerHTML=items.length
  ?items.map(x=>`<div class="admin-item">
   <div class="grow">
    <b>${esc(x.name)}</b>
    <div style="font-size:11px;color:var(--sub);margin-top:3px">
     ${esc(x.status)} · 총 ${prizeCount(x)}개 ·
     ${esc(x.desc||'내용 없음')}
    </div>
   </div>
   <button class="btn small edit" data-id="${x.id}" type="button">
    수정
   </button>
   <button class="btn small danger del" data-id="${x.id}" type="button">
    삭제
   </button>
  </div>`).join('')
  :`<div style="font-size:12px;color:var(--sub);padding:10px 0">
    등록된 업보가 없습니다.
   </div>`;

 box.querySelectorAll('.edit').forEach(b=>b.onclick=()=>{
  const x=items.find(v=>String(v.id)===String(b.dataset.id));
  if(!x)return;

  editingId=x.id;
  $('#name').value=x.name;
  $('#viewerId').value=x.viewerId||'';
  $('#image').value=x.image||'';
  $('#count').value=x.count??0;
  $('#desc').value=x.desc||'';

  $('#saveBtn').textContent='룰렛 수정';
  $('#drawer').classList.add('show');
 });

 box.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{
  const x=items.find(v=>String(v.id)===String(b.dataset.id));
  if(!x)return;

  if(!confirm(`"${x.name}" 업보를 삭제할까요?`))return;

  try{
   await api('/api/items/'+encodeURIComponent(x.id),{
    method:'DELETE'
   });
   await reload();
  }catch(e){
   alert(e.message);
  }

  $('#drawer').classList.add('show');
  $('#adminBox').style.display='block';
  $('#loginBox').style.display='none';
 });
}

$('#form').onsubmit=async e=>{
 e.preventDefault();

 const data={
  name:$('#name').value.trim(),
  viewerId:$('#viewerId').value.trim(),
  image:$('#image').value.trim(),
  count:Math.max(0,Number($('#count').value||0)),
  desc:$('#desc').value.trim()
 };

 if(!data.name)return;

 try{
  await api(
   editingId
    ?'/api/items/'+encodeURIComponent(editingId)
    :'/api/items',
   {
    method:editingId?'PUT':'POST',
    body:JSON.stringify(data)
   }
  );

  editingId=null;
  e.target.reset();
  $('#saveBtn').textContent='룰렛 등록';
  await reload();
 }catch(err){
  alert(err.message);
 }
};

$('#cancelBtn').onclick=()=>{
 editingId=null;
 $('#form').reset();
 $('#saveBtn').textContent='룰렛 등록';
};

function showAdmin(){
 isAdmin=true;
 $('#loginBox').style.display='none';
 $('#adminBox').style.display='block';
 renderAdmin();
}

$('#adminBtn').onclick=()=>{
 $('#drawer').classList.add('show');
 $('#overlay').classList.add('show');
 if(isAdmin)showAdmin();
};

function closeDrawer(){
 $('#drawer').classList.remove('show');
 $('#overlay').classList.remove('show');
}

$('#closeDrawer').onclick=closeDrawer;
$('#overlay').onclick=closeDrawer;

$('#loginBtn').onclick=async()=>{
 try{
  await api('/api/login',{
   method:'POST',
   body:JSON.stringify({
    password:$('#password').value
   })
  });

  $('#password').value='';
  showAdmin();
 }catch(err){
  alert(err.message);
 }
};

$('#closeModal').onclick=()=>{
 $('#modal').classList.remove('show');
};

$('#modal').onclick=e=>{
 if(e.target===$('#modal')){
  $('#modal').classList.remove('show');
 }
};

$('#viewerSearch').addEventListener('input',render);

(async()=>{
 try{
  const a=await api('/api/session');
  isAdmin=a.admin;
  await reload();
 }catch(e){
  $('#list').innerHTML=
   '<div class="empty">서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.</div>';
  console.error(e);
 }
})();
