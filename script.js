const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');

function cmsTextElements() {
  const selector = 'h1,h2,h3,p,small,strong,span,figcaption,dt,dd,li,a,button';
  return [...document.querySelectorAll(selector)].filter((element) => {
    if (!element.textContent.trim() || element.closest('dialog') || element.closest('svg')) return false;
    return ![...element.children].some((child) => child.matches(selector) && child.textContent.trim());
  });
}

function cmsImageElements() {
  return [...document.querySelectorAll('img,.hero-portrait,.about-photo,.wrapped-art')].filter((element) => !element.closest('dialog'));
}

function applyCmsImage(element, source) {
  if (element.tagName === 'IMG') element.src = source;
  else {
    element.classList.add('cms-has-image');
    element.style.backgroundImage = `url("${source}")`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.querySelector('span')?.setAttribute('hidden', '');
  }
}

async function applyPublishedSiteContent() {
  let published = {};
  try { published = JSON.parse(localStorage.getItem('daria-site-published-v1')) || {}; } catch {}
  cmsTextElements().forEach((element, index) => {
    const value = published.text?.[`text-${index}`];
    if (value !== undefined) element.textContent = value;
  });
  if (!('indexedDB' in window)) return;
  const request = indexedDB.open('daria-portfolio', 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' });
  };
  request.onsuccess = () => {
    const db = request.result;
    const media = db.transaction('media').objectStore('media').getAll();
    media.onsuccess = () => {
      const map = new Map(media.result.map((record) => [record.key, record]));
      cmsImageElements().forEach((element, index) => {
        const blob = map.get(`image-${index}`)?.publishedBlob;
        if (blob) applyCmsImage(element, URL.createObjectURL(blob));
      });
    };
  };
}

if (!new URLSearchParams(location.search).has('editor')) applyPublishedSiteContent();

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

const projectDialog = document.querySelector('#project-dialog');
const projectGrid = document.querySelector('#project-grid');

function createProjectCard(workKey, work) {
  const button = document.createElement('button');
  button.className = 'art-card';
  button.type = 'button';
  button.dataset.work = workKey;
  const image = document.createElement('img');
  image.src = work.cover || work.images[0];
  image.alt = work.title;
  if (work.crop) image.style.objectPosition = `${work.crop.x}% ${work.crop.y}%`;
  const copy = document.createElement('span');
  copy.className = 'art-card-copy';
  const title = document.createElement('strong');
  title.textContent = work.title;
  const meta = document.createElement('small');
  meta.textContent = `${work.kicker} · ${work.year}`;
  copy.append(title, meta);
  button.append(image, copy);
  button.addEventListener('click', () => {
    projectDialog?.close();
    showWork(workKey);
  });
  return button;
}

function renderProject() {
  if (!projectGrid) return;
  projectGrid.replaceChildren(...Object.entries(works).map(([key, work]) => createProjectCard(key, work)));
}

function loadLocalArtworks() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve();
    const request = indexedDB.open('daria-portfolio', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' });
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const rows = request.result.transaction('artworks').objectStore('artworks').getAll();
      rows.onerror = () => resolve();
      rows.onsuccess = () => {
        rows.result.filter((row) => row.published !== false).forEach((row) => {
          const images = (row.images || []).map((blob) => URL.createObjectURL(blob));
          if (!images.length) return;
          works[`local-${row.id}`] = {
            title: row.title || 'Без названия',
            kicker: 'Авторская работа',
            year: row.year || '2026',
            materials: row.materials || 'Материалы не указаны',
            description: row.description || '',
            crop: row.crop || null,
            cover: row.cover ? URL.createObjectURL(row.cover) : images[0],
            images
          };
        });
        renderProject();
        resolve();
      };
    };
  });
}

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

document.querySelector('#open-project')?.addEventListener('click', async () => {
  renderProject();
  projectDialog?.showModal();
});
document.querySelector('.project-close')?.addEventListener('click', () => projectDialog?.close());
projectDialog?.addEventListener('click', (event) => {
  if (event.target === projectDialog) projectDialog.close();
});
loadLocalArtworks();

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
