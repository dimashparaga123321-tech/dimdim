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

document.querySelectorAll('[data-pending]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelector('#contacts')?.scrollIntoView({ behavior: 'smooth' });
    contactStatus.textContent = 'Добавим прямую ссылку, когда Даша пришлёт адрес своего аккаунта.';
  });
});
