const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');

menuToggle?.addEventListener('click', () => {
  const open = navigation.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

navigation?.addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  navigation.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
});

const works = [
  { image: 'met-45434.jpg', title: 'Волна' },
  { image: 'met-437984.jpg', title: 'Личные истории' },
  { image: 'met-436121.jpg', title: 'Тишина и цвет' }
];

const showcase = document.querySelector('.available-frame');
const image = document.querySelector('#available-image');
const title = document.querySelector('#available-title');
const count = document.querySelector('#available-count');
let activeWork = 0;

function showWork(nextIndex) {
  activeWork = (nextIndex + works.length) % works.length;
  showcase?.classList.add('is-changing');
  window.setTimeout(() => {
    const work = works[activeWork];
    image.src = work.image;
    image.alt = `${work.title} — демонстрационная работа`;
    title.textContent = work.title;
    count.textContent = `${String(activeWork + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`;
    showcase?.classList.remove('is-changing');
  }, 220);
}

document.querySelector('#prev-work')?.addEventListener('click', () => showWork(activeWork - 1));
document.querySelector('#next-work')?.addEventListener('click', () => showWork(activeWork + 1));

const rotatingOrbits = [...document.querySelectorAll('.scroll-orbit')];
let orbitFrame = 0;

function rotateOrbits() {
  orbitFrame = 0;
  const scrollPosition = window.scrollY;
  rotatingOrbits.forEach((orbit) => {
    const speed = Number(orbit.dataset.scrollSpeed || 0.1);
    orbit.style.transform = `rotate(${scrollPosition * speed}deg)`;
  });
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('scroll', () => {
    if (orbitFrame) return;
    orbitFrame = window.requestAnimationFrame(rotateOrbits);
  }, { passive: true });
  rotateOrbits();
}
