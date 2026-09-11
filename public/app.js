const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];

const tools={
  vocals:{
    title:'Eliminar Voces de Cualquier Canción',subtitle:'Separación HQ de canción en voces e instrumental',
    children:[
      {id:'vocals_music',label:'Música y voces',icon:'♨',model:'BS-RoFormer Revive 3e (unwa)'},
      {id:'lead',label:'Conservar coros',icon:'♧',model:'RoFormer Lead/Back B'},
      {id:'back',label:'Aislar coros',icon:'♧',model:'RoFormer Lead/Back B'}
    ]
  },
  instruments:{
    title:'Separar Instrumentos',subtitle:'Aislamiento de instrumentos con modelos de IA',
    children:[
      {id:'guitar',label:'Guitarra',icon:'♭',model:'BS-RoFormer 6-stems SW'},
      {id:'drums',label:'Batería',icon:'◉',model:'Demucs v4 (Drumsep)'},
      {id:'piano',label:'Piano',icon:'♬',model:'BS-RoFormer 6-stems SW'},
      {id:'splitter',label:'Separador',icon:'⑂',model:'Demucs v4'},
      {id:'bass',label:'Bajo',icon:'𝄢',model:'BS-RoFormer 6-stems SW'}
    ]
  },
  enhance:{
    title:'Mejorar Audio',subtitle:'Limpieza y restauración de audio con IA',
    children:[
      {id:'dereverb',label:'Eco / reverb',icon:'≈',model:'MDX DeReverb'},
      {id:'decrowd',label:'De-crowd',icon:'◎',model:'MDX (De-crowd)'},
      {id:'denoise',label:'De-noise',icon:'◌',model:'MDX Denoise'},
      {id:'quality',label:'Mejorar calidad',icon:'✦',model:'Audio Enhancer'}
    ]
  },
  other:{title:'Otras Herramientas',subtitle:'Modelos experimentales y utilidades adicionales',children:[]}
};

const modelSets={
  recommended:[
    ['BS-RoFormer Revive 3e (unwa)','vocal / instrumental'],
    ['RoFormer Lead/Back B','principal / coros'],
    ['BS-RoFormer 6-stems SW','6 stems'],
    ['Demucs v4 (Drumsep)','stems'],
    ['MDX (De-crowd)','limpieza']
  ],
  old:[
    ['UVR-MDX-NET Main','clásico'],
    ['Kim Vocal 2','voces'],
    ['MDX-Net Inst HQ 3','instrumental']
  ],
  test:[
    ['RoFormer Lead/Back C','prueba'],
    ['Mel-RoFormer vocfv7beta3','beta'],
    ['BS-RoFormer Duality v1','experimental']
  ]
};

const historyData=[
  ['green','Brunella Torpoco - Cerves...','BS-RoFormer 6-stems SW'],
  ['green','Victor Manuel del Perú - M...','BS-RoFormer 6-stems SW'],
  ['green','Victor Manuel del Perú - M...','Demucs v4 (Drumsep)'],
  ['purple','Grupo Amor Rebelde - Mix...','RoFormer Lead/Back B'],
  ['red','Otros ← Grupo Amor Rebe...','MDX (De-crowd)'],
  ['green','Batería ← Otros ← Grupo ...','Demucs v4 (Drumsep)'],
  ['red','Otros ← Grupo Amor Rebe...','BS-RoFormer Duality by giilian v1']
];

let activeCategory='vocals';
let activeChild='vocals_music';
let activeModelTab='recommended';
let historyOffset=0;

function toast(message){
  const el=$('#toast'); el.textContent=message; el.classList.remove('hidden');
  clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.add('hidden'),1900);
}

function renderHistory(){
  const list=$('#historyList');
  const rows=[...historyData.slice(historyOffset),...historyData.slice(0,historyOffset)].slice(0,7);
  list.innerHTML=rows.map(([tone,title,model])=>`<div class="history-item ${tone}"><div class="history-icon">${tone==='purple'?'♧':tone==='red'?'◎':'⌘'}</div><div class="history-copy"><strong>${title}</strong><small>${model}</small></div><div class="history-check">✓</div></div>`).join('');
}

function setModel(name){
  $('#modelText').textContent=name;
  renderModels();
}

function renderModels(){
  const host=$('#modelOptions');
  host.innerHTML=modelSets[activeModelTab].map(([name,meta])=>`<button class="model-option ${$('#modelText').textContent===name?'active':''}" data-name="${name}"><span>${name}</span><small>${meta}</small></button>`).join('');
  $$('.model-option').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation(); setModel(btn.dataset.name); $('#modelMenu').classList.add('hidden');
  }));
}

function renderBranch(){
  const group=tools[activeCategory];
  $('#pageTitle').textContent=group.title;
  $('#pageSubtitle').textContent=group.subtitle;
  const row=$('#childRow');
  const branch=$('#branch');
  if(!group.children.length){
    row.innerHTML=''; branch.classList.add('hidden');
    $('#modelCard').classList.remove('hidden');
    setModel('BS-RoFormer Duality v1');
    return;
  }
  branch.classList.remove('hidden');
  row.innerHTML=group.children.map(item=>`<button class="child-tool ${item.id===activeChild?'active':''}" data-child="${item.id}"><span class="tool-icon">${item.icon}</span><span>${item.label}</span></button>`).join('');
  $$('.child-tool').forEach(btn=>btn.addEventListener('click',()=>{
    activeChild=btn.dataset.child;
    const item=group.children.find(x=>x.id===activeChild);
    $$('.child-tool').forEach(x=>x.classList.toggle('active',x===btn));
    if(item) setModel(item.model);
  }));
  const selected=group.children.find(x=>x.id===activeChild) || group.children[0];
  if(!group.children.some(x=>x.id===activeChild)) activeChild=group.children[0].id;
  setModel(selected?.model || group.children[0].model);
}

$$('.category').forEach(btn=>btn.addEventListener('click',()=>{
  activeCategory=btn.dataset.category;
  const group=tools[activeCategory];
  if(group.children.length) activeChild=group.children[0].id;
  $$('.category').forEach(x=>{
    const on=x===btn; x.classList.toggle('active',on);
    const arrow=x.querySelector('i'); if(arrow) arrow.textContent=on&&group.children.length?'⌃':'⌄';
  });
  renderBranch();
}));

$('#modelTrigger').addEventListener('click',e=>{
  e.stopPropagation(); $('#modelMenu').classList.toggle('hidden');
});
$$('[data-model-tab]').forEach(btn=>btn.addEventListener('click',e=>{
  e.stopPropagation(); activeModelTab=btn.dataset.modelTab;
  $$('[data-model-tab]').forEach(x=>x.classList.toggle('active',x===btn));
  renderModels();
}));
document.addEventListener('click',()=>$('#modelMenu').classList.add('hidden'));

const uploadBox=$('#uploadBox');
const fileInput=$('#fileInput');
$('#chooseFile').addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',()=>fileInput.files[0]&&showFile(fileInput.files[0]));
['dragenter','dragover'].forEach(type=>uploadBox.addEventListener(type,e=>{e.preventDefault();uploadBox.classList.add('drag')}));
['dragleave','drop'].forEach(type=>uploadBox.addEventListener(type,e=>{e.preventDefault();uploadBox.classList.remove('drag')}));
uploadBox.addEventListener('drop',e=>{const file=e.dataTransfer.files[0]; if(file)showFile(file)});
function showFile(file){
  $('#selectedFileName').textContent=file.name;
  $('#selectedFileMeta').textContent=`${(file.size/1024/1024).toFixed(1)} MB · listo`;
  $('#selectedFile').classList.remove('hidden');
}
$('#clearFile').addEventListener('click',()=>{fileInput.value='';$('#selectedFile').classList.add('hidden')});

$('#pasteUrl').addEventListener('click',()=>$('#urlModal').classList.remove('hidden'));
$('#closeUrl').addEventListener('click',()=>$('#urlModal').classList.add('hidden'));
$('#urlModal').addEventListener('click',e=>{if(e.target.id==='urlModal')e.currentTarget.classList.add('hidden')});
$('#urlSubmit').addEventListener('click',()=>{
  const value=$('#urlInput').value.trim();
  if(!value){toast('Pega una URL primero');return}
  $('#urlModal').classList.add('hidden');
  $('#selectedFileName').textContent=value;
  $('#selectedFileMeta').textContent='URL cargada · lista';
  $('#selectedFile').classList.remove('hidden');
});

let compact=false;
$('#showLess').addEventListener('click',()=>{
  compact=!compact;
  $('#modelCard').classList.toggle('hidden',compact);
  $('#showLess').querySelector('span').textContent=compact?'Mostrar más':'Mostrar menos';
  $('#showLess').querySelector('i').textContent=compact?'⌄':'⌃';
});

$('#avatarBtn').addEventListener('click',e=>{e.stopPropagation();$('#sidePopover').classList.add('hidden');$('#accountMenu').classList.toggle('hidden')});
$('#menuBtn').addEventListener('click',e=>{e.stopPropagation();$('#accountMenu').classList.add('hidden');$('#sidePopover').classList.toggle('hidden')});
$('#accountMenu').addEventListener('click',e=>e.stopPropagation());
$('#sidePopover').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{$('#accountMenu').classList.add('hidden');$('#sidePopover').classList.add('hidden')});
$$('#accountMenu button,#sidePopover button').forEach(btn=>btn.addEventListener('click',()=>toast(btn.textContent.trim())));

$('#prevHistory').addEventListener('click',()=>{historyOffset=(historyOffset-1+historyData.length)%historyData.length;renderHistory()});
$('#nextHistory').addEventListener('click',()=>{historyOffset=(historyOffset+1)%historyData.length;renderHistory()});
$('#selectHistory').addEventListener('change',e=>toast(e.target.checked?'Selección activada':'Selección desactivada'));

renderModels();
renderHistory();
renderBranch();
