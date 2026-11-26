const menuToggle = document.querySelector('.menu-toggle');
const aboutToggle = document.querySelector('#about-toggle');
aboutToggle?.addEventListener('click', () => {
  const expanded = aboutToggle.getAttribute('aria-expanded') === 'true';
  document.querySelector('#about-short').hidden = !expanded;
  document.querySelector('#about-full').hidden = expanded;
  aboutToggle.setAttribute('aria-expanded', String(!expanded));
  aboutToggle.textContent = expanded ? 'Прочитать историю' : 'Свернуть историю';
  if (expanded) aboutToggle.focus();
});
const navigation = document.querySelector('.site-nav');

// Read only explicitly named overrides. Old position-based drafts could target unrelated elements.
const siteButtonLabel = localStorage.getItem('daria-contact-label');
if (siteButtonLabel) document.querySelector('.circle-link').textContent = siteButtonLabel;
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
  meta.textContent = workPrice(work);
  copy.append(title, meta);
  button.append(image, copy);
  button.addEventListener('click', () => {
    showWork(workKey);
  });
  return button;
}

function workPrice(work) {
  if (work.status === 'Продана') return work.price ? `Продана за ${work.price} ₽` : 'Продана';
  if (work.price) return `${work.price} ₽`;
  return 'Цена по запросу';
}

let visibleArtworks = 8;
const artworkMore = document.querySelector('#art-more');
const artworkLess = document.querySelector('#art-less');

function renderProject() {
  if (!projectGrid) return;
  const entries = Object.entries(works).sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
  const sold = entries.filter(([, work]) => work.status === 'Продана');
  const available = entries.filter(([key, work]) => key.startsWith('local-') && work.status !== 'Продана');
  const cards = [...document.querySelector('#featured-work').content.children].map(card => card.cloneNode(true));
  cards.push(...available.map(([key, work]) => createProjectCard(key, work)));
  const hidden = new Set(JSON.parse(localStorage.getItem('daria-hidden-artworks') || '[]'));
  replacedArtworkPages.forEach(page => hidden.add(page));
  const getValue = card => {
    const price = card.querySelector('small').textContent;
    return price.includes('₽') ? Number(price.replace(/\D/g, '')) : null;
  };
  cards.sort((a, b) => {
    const x = getValue(a), y = getValue(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return y - x;
  });
  const shown = cards.filter(card => !hidden.has(card.getAttribute('href')));
  shown.forEach((card, index) => { card.hidden = index >= visibleArtworks; });
  projectGrid.replaceChildren(...shown);
  artworkMore.hidden = visibleArtworks >= shown.length;
  artworkLess.hidden = visibleArtworks <= 8;
  const soldGrid = document.querySelector('#sold-grid');
  soldGrid.querySelectorAll('[data-sold-record]').forEach(card => card.remove());
  soldGrid.prepend(...sold.map(([key, work]) => {
    const card = createProjectCard(key, work);
    card.dataset.soldRecord = '';
    return card;
  }));
}

const replacedArtworkPages = new Set();
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
        rows.result.map(row => row.pending ? row.live : row).filter(row => row && row.published !== false).forEach((row) => {
          if (row.sourcePage) replacedArtworkPages.add(row.sourcePage);
          if (row.removed) return;
          const images = (row.images || []).map((blob) => URL.createObjectURL(blob));
          if (!images.length) return;
          works[`local-${row.id}`] = {
            title: row.title || 'Без названия',
            kicker: 'Авторская работа',
            year: row.year || '2026',
            materials: row.materials || 'Материалы не указаны',
            description: row.description || '',
            status: row.status,
            size: row.size,
            price: row.price,
            createdAt: row.createdAt || row.id,
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

function showWork(workKey, { commission = false } = {}) {
  const work = works[workKey];
  activeWork = work && { ...work, images: work.images.slice(0, 1) };
  if (!activeWork || !dialog) return;
  activeImage = 0;
  dialogTitle.textContent = activeWork.title;
  dialogKicker.textContent = activeWork.kicker;
  const description = (activeWork.description || '').trim();
  const split = description.length > 100 ? description.lastIndexOf(' ', 85) : -1;
  const more = document.querySelector('#description-more');
  more.open = false;
  more.hidden = split < 1;
  dialogDescription.textContent = split < 1 ? description : description.slice(0, split);
  document.querySelector('#description-rest').textContent = split < 1 ? '' : description.slice(split + 1);
  dialog.querySelector('.gallery-controls').hidden = activeWork.images.length < 2;
  document.querySelector("#dialog-price").textContent = workPrice(activeWork);
  const contact = dialog.querySelector('.dialog-contact');
  const sold = activeWork.status === 'Продана';
  contact.textContent = sold || commission ? 'Заказать копию' : 'Заказать';
  contact.href = 'https://t.me/Art_Daria1';
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
  card.addEventListener('click', () => showWork(card.dataset.work, {
    commission: Boolean(card.closest('#sold'))
  }));
});

artworkMore.addEventListener('click', () => { visibleArtworks += 2; renderProject(); });
artworkLess.addEventListener('click', () => { visibleArtworks -= 2; renderProject(); });
renderProject();
loadLocalArtworks();

const artworkDialog = document.querySelector('#portfolio-artwork');
const artworkPages = new Map();
const featuredCards = [...document.querySelectorAll('#project-grid a.art-card')];
const warmImages = new Map();

function warmImage(src) {
  if (!warmImages.has(src)) {
    const image = new Image();
    image.src = src;
    warmImages.set(src, image);
  }
  return warmImages.get(src);
}

function loadArtwork(url) {
  const html = typeof artworkMarkup !== 'undefined' && artworkMarkup[new URL(url).pathname.split('/').pop()];
  if (html) return Promise.resolve(new DOMParser().parseFromString(html, 'text/html').querySelector('.artwork-page'));
  if (!artworkPages.has(url)) {
    artworkPages.set(url, fetch(url).then(response => {
      if (!response.ok) throw new Error('Artwork unavailable');
      return response.text();
    }).then(html => {
      const page = new DOMParser().parseFromString(html, 'text/html').querySelector('.artwork-page');
      if (!page) throw new Error('Artwork missing');
      return page;
    }).catch(() => {
      artworkPages.delete(url);
      return null;
    }));
  }
  return artworkPages.get(url);
}

function closeArtwork() {
  if (artworkDialog.classList.contains('is-closing')) return;
  artworkDialog.classList.add('is-closing');
  const animation = artworkDialog.getAnimations()[0];
  const finish = () => {
    artworkDialog.close();
    artworkDialog.classList.remove('is-closing');
  };
  if (animation) animation.finished.then(finish, finish);
  else finish();
}

artworkDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeArtwork();
});
artworkDialog.addEventListener('click', event => {
  if (event.target === artworkDialog) closeArtwork();
});

projectGrid.addEventListener('click', async event => {
  const card = event.target.closest('a.art-card');
  if (!card || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const url = card.href;
  const preview = card.querySelector('img');
  const page = await loadArtwork(url);
  if (artworkDialog.open) return;
  if (!page) return void location.assign(url);
  const content = page.cloneNode(true);
  const description = content.querySelector('.artwork-description');
  if (description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artwork-description-button';
    button.textContent = 'Описание';
    const arrow = document.createElement('span');
    arrow.textContent = '↓';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(arrow);
    button.setAttribute('aria-expanded', 'false');
    description.id = 'portfolio-description';
    button.setAttribute('aria-controls', description.id);
    description.querySelector('summary').hidden = true;
    button.addEventListener('click', () => {
      description.open = !description.open;
      button.setAttribute('aria-expanded', String(description.open));
    });
    content.querySelector('.artwork-page-details').append(button);
    button.after(description);
    description.hidden = true;
    button.addEventListener('click', () => { description.hidden = !description.open; });
  }
  const full = new URL(page.querySelector('img').getAttribute('src'), url).href;
  const image = content.querySelector('img');
  image.src = preview.currentSrc || preview.src;
  warmImage(full).decode().then(() => { image.src = full; }).catch(() => {});
  const back = content.querySelector('a');
  back.addEventListener('click', event => {
    event.preventDefault();
    closeArtwork();
  });
  artworkDialog.replaceChildren(content);
  artworkDialog.showModal();
  artworkDialog.scrollTop = 0;
});

window.addEventListener('load', () => {
  featuredCards.forEach(card => {
    warmImage(card.querySelector('img').src);
    loadArtwork(card.href).then(page => {
      if (page) warmImage(new URL(page.querySelector('img').getAttribute('src'), card.href).href);
    });
  });
}, { once: true });

const carousel = document.querySelector('#pricing-carousel');
const carouselImage = carousel.querySelector('img');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let carouselVisible = false;
new IntersectionObserver(([entry]) => { carouselVisible = entry.isIntersecting; }).observe(carousel);
setInterval(async () => {
  if (reducedMotion.matches || !carouselVisible || document.hidden) return;
  const images = [...document.querySelectorAll('#project-grid img, #sold-grid [data-sold-record] img')]
    .filter(image => image.src !== carouselImage.src);
  if (!images.length) return;
  const next = images[Math.floor(Math.random() * images.length)];
  try { await warmImage(next.src).decode(); } catch { return; }
  if (!reducedMotion.matches) await carouselImage.animate([{opacity:1},{opacity:0}], 220).finished;
  carouselImage.src = next.src;
  carouselImage.alt = next.alt;
  if (!reducedMotion.matches) carouselImage.animate([{opacity:0},{opacity:1}], 300);
}, 3000);

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
