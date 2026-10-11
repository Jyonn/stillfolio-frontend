import './portfolio-layouts.css';
import logoUrl from './assets/stillfolio-logo.svg?url';

const icon = name => ({
  plus: '<path d="M12 5v14M5 12h14"/>',
  tune: '<path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M10 14v6"/>',
  export: '<path d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14"/>',
  grid: '<path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/>',
  frame: '<path d="M5 8V5h3m8 0h3v3m0 8v3h-3M8 19H5v-3M8 8h8v8H8z"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
}[name] || '');

const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`;
const actions = `<button aria-label="新增照片">${svg('plus')}</button><button aria-label="自定义展示">${svg('tune')}</button><button aria-label="导出">${svg('export')}</button>`;
const photo = (tone = 1, wide = false) => `<div class="mock-photo photo-${tone}${wide ? ' wide' : ''}"><i></i><b></b></div>`;
const collections = ['光抵达的地方', '北境缓慢经过', '潮汐以前', '无人的下午'];

const concepts = [
  {
    id: 'rail', no: '01', name: '编辑画廊', note: '最接近当前产品；在桌面端保持收藏夹始终可见，手机端压成顶部横向轨道。',
    markup: `<div class="concept rail-layout">
      <aside class="rail"><img src="${logoUrl}" alt="留幅 STILLFOLIO"><span>4 COLLECTIONS</span>${collections.map((x,i)=>`<button class="${i?'':'active'}"><em>0${i+1}</em>${x}<small>${[12,9,16,7][i]}</small></button>`).join('')}<button class="new-collection">＋ 新建作品集</button></aside>
      <section class="rail-main"><header><button class="mobile-back">${svg('back')}</button><div><small>COLLECTION 01</small><h2>光抵达的地方</h2></div><div class="toolbar">${actions}<span class="avatar">J</span></div></header>
      <div class="canvas-area"><article class="art"><div class="tech"><span>CAMERA<br><b>SONY · DSC-RX100M6</b></span><span>EXPOSURE<br><b>72 MM / ƒ5.6 / 1/250 S</b></span></div>${photo(1)}<footer>内蒙古 · 根河湿地<br><small>50.880864° N, 121.691672° E</small></footer></article><nav class="segments">${Array.from({length:8},(_,i)=>`<i class="${i===2?'on':''}"></i>`).join('')}</nav></div></section>
    </div>`,
  },
  {
    id: 'sheet', no: '02', name: '联系印样', note: '作品集优先，适合快速建立、整理和选择封面；进入单张后再显示编辑工具。',
    markup: `<div class="concept sheet-layout"><header><img src="${logoUrl}" alt="留幅 STILLFOLIO"><nav><button class="active">作品集</button><button>最近添加</button></nav><div class="toolbar">${actions}<span class="avatar">J</span></div></header>
      <section class="sheet-title"><div><small>PHOTO LIBRARY · 04</small><h2>作品集</h2></div><button>按更新时间排列⌄</button></section>
      <div class="collection-grid">${collections.map((x,i)=>`<article class="collection-card"><div class="cover cover-${i+1}">${photo(i+1,true)}<span>0${i+1}</span></div><h3>${x}</h3><p>${[12,9,16,7][i]} 张照片 · 2026</p></article>`).join('')}<button class="collection-add">＋<span>新建作品集</span></button></div>
      <div class="mobile-dock"><button>${svg('grid')}<span>作品集</span></button><button>${svg('plus')}<span>照片</span></button><button>${svg('tune')}<span>展示</span></button><button><span class="avatar">J</span><span>我的</span></button></div>
    </div>`,
  },
  {
    id: 'film', no: '03', name: '胶片工作台', note: '让照片成为唯一主角；桌面端以底部胶片带浏览，手机端用拇指横滑同一条胶片带。',
    markup: `<div class="concept film-layout"><header><div class="collection-switch"><small>正在编辑</small><strong>光抵达的地方⌄</strong></div><div class="toolbar">${actions}<span class="avatar">J</span></div></header>
      <section class="film-stage"><article class="dark-art"><div class="tech"><span>SONY · DSC-RX100M6</span><span>72 MM / ƒ5.6 / 1/250 S</span></div>${photo(3)}<footer>根河湿地 · 内蒙古</footer></article></section>
      <footer class="filmstrip"><div class="film-meta"><strong>03</strong><span>/ 12</span></div><div class="frames">${[1,2,3,4,2,1].map((x,i)=>`<button class="${i===2?'active':''}">${photo(x,true)}</button>`).join('')}</div><button class="all-collections">${svg('grid')}<span>全部作品集</span></button></footer>
    </div>`,
  },
  {
    id: 'library', no: '04', name: '图书馆分层', note: '把“管理作品集”和“编辑单个作品集”拆成两层；桌面是分栏，手机是清晰的前后页关系。',
    markup: `<div class="concept library-layout"><aside><div class="library-brand"><img src="${logoUrl}" alt="留幅 STILLFOLIO"><span class="avatar">J</span></div><small>你的作品集</small>${collections.map((x,i)=>`<button class="${i?'':'active'}"><span class="mini-cover cover-${i+1}"></span><span><strong>${x}</strong><em>${[12,9,16,7][i]} PHOTOS</em></span></button>`).join('')}<button class="library-new">＋ 新建作品集</button></aside>
      <section class="library-work"><header><button class="mobile-back">${svg('back')}</button><div><small>01 / 04</small><h2>光抵达的地方</h2></div><div class="toolbar">${actions}</div></header><div class="library-canvas">${photo(4)}<div class="side-note"><span>03 / 12</span><strong>秋日午后</strong><small>2026.09.28 · 根河</small></div></div><nav class="library-pages"><button>←</button><span></span><button>→</button></nav></section>
    </div>`,
  },
];

document.querySelector('#layout-lab').innerHTML = `<header class="lab-header"><div class="lab-brand"><img src="${logoUrl}" alt="留幅 STILLFOLIO"><div><small>INTERFACE STUDIES</small><h1>作品集布局研究</h1></div></div><div class="viewport-switch" role="group"><button class="active" data-view="desktop">Desktop</button><button data-view="mobile">Mobile</button></div></header>
  <nav class="concept-tabs">${concepts.map((c,i)=>`<button class="${i?'':'active'}" data-concept="${c.id}"><span>${c.no}</span><strong>${c.name}</strong></button>`).join('')}</nav>
  <section class="study-copy"><span class="study-number">${concepts[0].no}</span><div><h2>${concepts[0].name}</h2><p>${concepts[0].note}</p></div></section>
  <section class="viewport desktop">${concepts.map((c,i)=>`<div class="study ${i?'':'active'}" data-study="${c.id}">${c.markup}</div>`).join('')}</section>`;

const viewport = document.querySelector('.viewport');
const copy = document.querySelector('.study-copy');
document.querySelector('.concept-tabs').addEventListener('click', event => {
  const button = event.target.closest('[data-concept]');
  if (!button) return;
  const concept = concepts.find(item => item.id === button.dataset.concept);
  document.querySelectorAll('[data-concept]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('[data-study]').forEach(item => item.classList.toggle('active', item.dataset.study === concept.id));
  copy.innerHTML = `<span class="study-number">${concept.no}</span><div><h2>${concept.name}</h2><p>${concept.note}</p></div>`;
});
document.querySelector('.viewport-switch').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item === button));
  viewport.className = `viewport ${button.dataset.view}`;
});
