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

const works = {
  wave: {
    title: 'Вода и движение',
    kicker: 'Авторская работа',
    year: '2026',
    materials: 'Холст, акрил',
    description: 'Работа о внутренней силе и движении. Здесь позже появится личная история картины и замысел Дарьи.',
    images: ['met-45434.jpg', 'detail-45434.jpg', 'wave.jpg']
  },
  stories: {
    title: 'Личные истории',
    kicker: 'Авторская работа',
    year: '2026',
    materials: 'Холст, смешанная техника',
    description: 'Картина, в которой личная история раскрывается через цвет, детали и настроение.',
    images: ['met-437984.jpg', 'detail-437984.jpg', 'met-437984.jpg']
  },
  silence: {
    title: 'Тишина и цвет',
    kicker: 'Авторская работа',
    year: '2026',
    materials: 'Холст, акрил',
    description: 'Спокойная работа о паузе, внимании к себе и ощущении пространства.',
    images: ['met-436121.jpg', 'detail-436121.jpg', 'met-436121.jpg']
  },
  detail: {
    title: 'Новая серия',
    kicker: 'Авторская работа',
    year: '2026',
    materials: 'Холст, смешанная техника',
    description: 'Демонстрационная карточка будущей работы. Название, описание и фотографии легко заменить.',
    images: ['wave.jpg', 'detail-45434.jpg', 'met-45434.jpg']
  }
};

const dialog = document.querySelector('#work-dialog');
const dialogImage = document.querySelector('#dialog-image');
const dialogTitle = document.querySelector('#dialog-title');
const dialogKicker = document.querySelector('#dialog-kicker');
const dialogDescription = document.querySelector('#dialog-description');
const dialogYear = document.querySelector('#dialog-year');
const dialogMaterials = document.querySelector('#dialog-materials');
const thumbs = document.querySelector('#dialog-thumbs');
let activeWork = null;
let activeImage = 0;

function renderGalleryImage() {
  if (!activeWork) return;
  const source = activeWork.images[activeImage];
  dialogImage.src = source;
  dialogImage.alt = `${activeWork.title}, фотография ${activeImage + 1}`;
  [...thumbs.children].forEach((button, index) => button.classList.toggle('is-active', index === activeImage));
}

function showWork(workKey) {
  activeWork = works[workKey];
  if (!activeWork || !dialog) return;
  activeImage = 0;
  dialogTitle.textContent = activeWork.title;
  dialogKicker.textContent = activeWork.kicker;
  dialogDescription.textContent = activeWork.description;
  dialogYear.textContent = activeWork.year;
  dialogMaterials.textContent = activeWork.materials;
  thumbs.replaceChildren(...activeWork.images.map((source, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Показать фотографию ${index + 1}`);
    const image = document.createElement('img');
    image.src = source;
    image.alt = '';
    button.append(image);
    button.addEventListener('click', () => {
      activeImage = index;
      renderGalleryImage();
    });
    return button;
  }));
  renderGalleryImage();
  dialog.showModal();
}

document.querySelectorAll('[data-work]').forEach((card) => {
  card.addEventListener('click', () => showWork(card.dataset.work));
});

document.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
document.querySelector('.gallery-arrow.prev')?.addEventListener('click', () => {
  activeImage = (activeImage - 1 + activeWork.images.length) % activeWork.images.length;
  renderGalleryImage();
});
document.querySelector('.gallery-arrow.next')?.addEventListener('click', () => {
  activeImage = (activeImage + 1) % activeWork.images.length;
  renderGalleryImage();
});
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
document.querySelector('.dialog-contact')?.addEventListener('click', () => dialog.close());
