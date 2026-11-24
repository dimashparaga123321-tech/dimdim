const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('.menu');
const storyToggle = document.querySelector('#storyToggle');
const storyMore = document.querySelector('#storyMore');
const contactStatus = document.querySelector('#contactStatus');

menuButton?.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(open));
});

menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

storyToggle?.addEventListener('click', () => {
  const expanded = storyToggle.getAttribute('aria-expanded') === 'true';
  storyToggle.setAttribute('aria-expanded', String(!expanded));
  storyMore.hidden = expanded;
  storyToggle.textContent = expanded ? 'Больше истории' : 'Свернуть историю';
});

const availableWorks = [
  {title:'Большая волна в Канагаве', details:'Пробная работа · цена по запросу', image:'met-45434.jpg'},
  {title:'Колыбельная', details:'Пробная работа · цена по запросу', image:'met-437984.jpg'},
  {title:'Женщина рядом с вазой цветов', details:'Пробная работа · цена по запросу', image:'met-436121.jpg'}
];
let availableIndex = 0;
let selectedIndex = null;
const availableImage = document.querySelector('#availableImage');
const availableTitle = document.querySelector('#availableTitle');
const availableDetails = document.querySelector('#availableDetails');
const availableCount = document.querySelector('#availableCount');
const selectArtwork = document.querySelector('#selectArtwork');

function renderAvailable(direction = 1) {
  const work = availableWorks[availableIndex];
  availableImage.animate?.([
    {opacity:0, transform:`translateX(${direction * 22}px) scale(.985)`},
    {opacity:1, transform:'translateX(0) scale(1)'}
  ], {duration:420, easing:'cubic-bezier(.22,.72,.2,1)'});
  availableImage.src = work.image;
  availableImage.alt = work.title;
  availableTitle.textContent = work.title;
  availableDetails.textContent = work.details;
  availableCount.textContent = `${availableIndex + 1} / ${availableWorks.length}`;
  const selected = selectedIndex === availableIndex;
  selectArtwork.classList.toggle('is-selected', selected);
  selectArtwork.textContent = selected ? 'Заказать картину' : 'Выбрать работу';
}

document.querySelector('#availablePrev')?.addEventListener('click', () => {
  availableIndex = (availableIndex - 1 + availableWorks.length) % availableWorks.length;
  renderAvailable(-1);
});

document.querySelector('#availableNext')?.addEventListener('click', () => {
  availableIndex = (availableIndex + 1) % availableWorks.length;
  renderAvailable(1);
});

selectArtwork?.addEventListener('click', () => {
  if (selectedIndex !== availableIndex) {
    selectedIndex = availableIndex;
    renderAvailable();
    return;
  }
  document.querySelector('#contacts')?.scrollIntoView({behavior:'smooth'});
  contactStatus.textContent = `Выбрана работа «${availableWorks[availableIndex].title}». Добавим отправку этого названия в Telegram Дарьи.`;
});

document.querySelectorAll('[data-pending]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector('#contacts')?.scrollIntoView({behavior:'smooth'});
    contactStatus.textContent = 'Добавим прямую ссылку, когда Дарья пришлёт адрес своего аккаунта.';
  });
});
