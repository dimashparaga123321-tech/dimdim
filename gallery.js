collectionReady.then(customWorks => {
const el = id => document.getElementById(id);
const wall = el('wall');
const note = el('note');
const camera = createCamera(el('scene'));
const works = customWorks.length ? customWorks : window.demoWorks;
const labels = ['Волна', 'Колыбельная', 'Цветы'];
const colors = ['#c9a5ad', '#c7ad9e', '#b99eaa'];
const frameStyles = ['gilded', 'ebony', 'walnut', 'ivory', 'bronze'];
let active = 0;
let busy = false;
let lastAction = Date.now();
let paused = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stops = [[0,0],[.031,.006],[.134,.012],[.206,.023],[.278,.047],[.34,.07],[.412,.105],[.485,.158],[.546,.246],[.583,.55],[.62,.825],[.69,.9],[.79,.94],[.85,.956],[.93,.975],[1,1]];
function coverage(t) {
  const i = stops.findIndex(([time]) => time >= t);
  if (i <= 0) return i === 0 ? 0 : 1;
  const [a,x] = stops[i-1], [b,y] = stops[i];
  const k = (t-a)/(b-a);
  return x+(y-x)*k*k*(3-2*k);
}
function moveSlide(bay, offset, arriving) {
  bay.querySelectorAll('[data-depth]').forEach(layer => {
    layer.style.translate = (offset * (arriving ? Number(layer.dataset.depth) : .14)) + 'vw 0';
  });
}
function hideNote() {
  note.hidden = true;
  document.querySelector('.museum').classList.remove('reading');
}
function select(index, manual = true) {
  if (manual) lastAction = Date.now();
  if (busy || camera.active) return;
  const target = (index + works.length) % works.length;
  const incoming = wall.children[target], outgoing = wall.children[active];
  const direction = Math.sign(index-active);
  hideNote();
  active = target;
  const tabs = [...el('tabs').children];
  tabs.forEach((tab,i) => tab.setAttribute('aria-current', String(i===target)));
  el('tabs').style.setProperty('--bar-x', tabs[target].offsetLeft+'px');
  el('tabs').style.setProperty('--bar-width', tabs[target].offsetWidth+'px');
  el('count').textContent = (target+1)+' / '+works.length;
  function finish() {
    [...wall.children].forEach(bay => {
      bay.hidden = bay !== incoming;
      bay.inert = bay.hidden;
      bay.style.clipPath = '';
      bay.style.zIndex = '';
      moveSlide(bay,0,true);
    });
    busy = false;
  }
  if (incoming === outgoing || reduced.matches) return finish();
  busy = true;
  incoming.hidden = false;
  incoming.style.zIndex = '1';
  outgoing.style.zIndex = '2';
  outgoing.inert = true;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1,(now-start)/1300);
    const c = t*t*(3-2*t);
    outgoing.style.clipPath = direction>0 ? 'inset(0 '+c*100+'% 0 0)' : 'inset(0 0 0 '+c*100+'%)';
    moveSlide(outgoing,-direction*c*100,false);
    const k = Math.min(1,Math.max(0,(t-.12)/.88));
    moveSlide(incoming,direction*100*(1-k)**2,true);
    if(t<1) requestAnimationFrame(tick); else finish();
  }
  tick(start);
}
for (const [id, rawTitle, artist, year, description, customImage, key, savedFrameStyle] of works) {
  const title = rawTitle?.trim() || 'Без названия';
  const i = wall.children.length;
  const bay = document.createElement('article');
  bay.className = 'bay';
  bay.innerHTML = '<button class="frame"></button><button class="plate"><span></span><small></small></button>';
  const [frame, plate] = bay.querySelectorAll('button');
  frame.classList.add('frame-'+(savedFrameStyle || frameStyles[i % frameStyles.length]));
  frame.append(el('moulding').content.cloneNode(true));
  const image = frame.firstElementChild;
  image.src = customImage || 'met-' + id + '.jpg';
  if (id) image.dataset.original = 'detail-' + id + '.jpg';
  image.alt = artist + ' — ' + title;
  frame.setAttribute('aria-label', 'Рассмотреть: ' + title);
  plate.firstElementChild.textContent = 'О работе';
  plate.lastElementChild.textContent = artist + ' · ' + year + '　 ⓘ';
  frame.onclick = () => {
    if (performance.now() < suppressClickUntil) return;
    if (busy || camera.active) return;
    hideNote();
    camera.enter(frame);
  };
  plate.onclick = () => {
    if (performance.now() < suppressClickUntil) return;
    note.querySelector('h2').textContent = title;
    note.querySelector('p').textContent = description;
    note.querySelector('.edit-caption')?.remove();
    if (key !== undefined) {
      const edit = document.createElement('button');
      edit.className = 'edit-caption';
      edit.textContent = 'Править подпись';
      edit.onclick = () => window.editCaption(key);
      note.append(edit);
    }
    note.querySelector('a').hidden = !id;
    if (id) note.querySelector('a').href = 'https://www.metmuseum.org/art/collection/search/' + id;
    note.hidden = false;
    document.querySelector('.museum').classList.add('reading');
    el('closeNote').focus();
  };
  const label = id ? labels[i] || title : title;
  bay.style.setProperty('--tint', colors[i % colors.length]);
  const heading = document.createElement('h1');
  heading.className = 'work-title';
  heading.textContent = title;
  heading.dataset.depth = '.25';
  frame.dataset.depth = '.15';
  plate.dataset.depth = '.30';
  bay.prepend(heading);
  const tab = document.createElement('button');
  tab.textContent = label;
  tab.onclick = () => select(i);
  el('tabs').append(tab);
  wall.append(bay);
}
el('closeNote').onclick = () => {hideNote(); wall.children[active].querySelector('.plate').focus()};
el('prev').onclick = () => select(active - 1);
el('next').onclick = () => select(active + 1);
document.addEventListener('keydown', event => {
  if (camera.active || document.querySelector('dialog[open]')) return;
  if (event.key === 'ArrowRight') select(active + 1);
  if (event.key === 'ArrowLeft') select(active - 1);
  if (event.key === 'Escape' && !note.hidden) el('closeNote').click();
});
let startX = null;
let suppressClickUntil = 0;
const scene = el('scene');
scene.onpointerdown = event => {startX = camera.active ? null : event.clientX};
scene.onpointercancel = () => {startX = null};
scene.onpointerup = event => {
  if (startX !== null && Math.abs(event.clientX - startX) > 38) {
    suppressClickUntil = performance.now() + 350;
    select(active + Math.sign(startX - event.clientX));
  }
  startX = null;
};
scene.ondragstart = event => event.preventDefault();
let wheelTime = -1000;
scene.addEventListener('wheel', event => {
  if (camera.active) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (Math.abs(delta) < 3) return;
  event.preventDefault();
  if (performance.now() - wheelTime > 650) select(active + Math.sign(delta));
  wheelTime = performance.now();
}, {passive:false});
select(0);
el('play').onclick = () => {
  paused = !paused;
  el('play').textContent = paused ? 'Включить показ' : 'Пауза';
};
for(const type of ['pointerdown','keydown','wheel','focusin']) document.addEventListener(type,()=>lastAction=Date.now(),{passive:true});
setInterval(()=> {
  if (!paused && !document.hidden && !camera.active && !editor.open && note.hidden && Date.now()-lastAction>6000) select(active+1,false);
},6200);
window.addEventListener('resize',()=>{
  const tab = el('tabs').children[active];
  el('tabs').style.setProperty('--bar-x',tab.offsetLeft+'px');
  el('tabs').style.setProperty('--bar-width',tab.offsetWidth+'px');
});
});
