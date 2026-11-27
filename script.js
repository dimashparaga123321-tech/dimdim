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
const editableLabels = new Map([...document.querySelectorAll('[data-edit-text]')].map(element => [element, element.textContent]));
function applyCatalogTexts(overrides) {
  for (const [element, original] of editableLabels) {
    const value = overrides[element.dataset.editText];
    element.textContent = typeof value === 'string' ? value : original;
  }
}
if (!sharedCatalog) {
  try { applyCatalogTexts(JSON.parse(localStorage.getItem('daria-site-text-v2') || '{}')); } catch {}
  if (siteButtonLabel) document.querySelector('.circle-link').textContent = siteButtonLabel;
}
menuToggle?.addEventListener('click', () => {
  const open = navigation.classList.toggle('is-open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

navigation?.addEventListener('click', (event) => {
  if (!event.target.closest('a')) return;
  navigation.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
});

const works = {};

const projectGrid = document.querySelector('#project-grid');
const artworkRevisionKey = 'daria-artwork-revision';

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
    showWork(works[workKey]);
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
  const hidden = new Set(sharedCatalog ? sharedHidden : JSON.parse(localStorage.getItem('daria-hidden-artworks') || '[]'));
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
  const remaining = Math.max(0, shown.length - visibleArtworks);
  artworkMore.hidden = remaining === 0;
  artworkMore.textContent = remaining > 0 ? `Развернуть (ещё ${remaining})` : 'Развернуть';
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
let sharedHidden = [];
let sharedRevision;
let readingSharedCatalog = false;

async function loadSharedArtworks() {
  if (readingSharedCatalog) return;
  readingSharedCatalog = true;
  try {
    const { revision, content } = await sharedCatalog.read();
    if (revision === sharedRevision) return;
    for (const key of Object.keys(works)) delete works[key];
    replacedArtworkPages.clear();
    sharedHidden = content.hidden;
    for (const [id, row] of Object.entries(content.works)) {
      const images = row.photos.map(path => sharedCatalog.photoURL(path)).filter(Boolean);
      if (!images.length) continue;
      if (row.sourcePage) replacedArtworkPages.add(row.sourcePage);
      works[`local-${id}`] = { ...row, images, cover: images[0], kicker: 'Авторская работа' };
    }
    applyCatalogTexts(content.texts);
    renderProject();
    sharedRevision = revision;
    document.dispatchEvent(new Event('daria-catalog-update'));
  } catch (error) {
    console.warn('Не удалось обновить каталог.', error);
  } finally {
    readingSharedCatalog = false;
  }
}

let artworkRevision;
function loadLocalArtworks() {
  if (!('indexedDB' in window)) return;
  const revision = localStorage.getItem(artworkRevisionKey);
  if (revision === artworkRevision) return;
  artworkRevision = revision;
  const request = indexedDB.open('daria-portfolio', 2);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' });
  };
  const allowRetry = () => { if (artworkRevision === revision) artworkRevision = undefined; };
  request.onerror = allowRetry;
  request.onsuccess = () => {
    const db = request.result;
    const rows = db.transaction('artworks').objectStore('artworks').getAll();
    db.close();
    rows.onerror = allowRetry;
    rows.onsuccess = () => {
      if (artworkRevision !== revision) return;
      const oldWorks = Object.values(works);
      Object.keys(works).forEach(key => delete works[key]);
      replacedArtworkPages.clear();
      rows.result.map(row => row.pending ? row.live : row).filter(row => row && row.published !== false).forEach((row) => {
        if (row.removed) {
          if (row.sourcePage) replacedArtworkPages.add(row.sourcePage);
          return;
        }
        const photos = Array.isArray(row.images) ? row.images.filter(isArtworkPhoto) : [];
        const cover = isArtworkPhoto(row.cover) ? row.cover : photos[0];
        if (!cover) return;
        if (!photos.length) photos.push(cover);
        const images = photos.map(blob => URL.createObjectURL(blob));
        if (row.sourcePage) replacedArtworkPages.add(row.sourcePage);
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
          cover: photos.includes(cover) ? images[photos.indexOf(cover)] : URL.createObjectURL(cover),
          images
        };
      });
      renderProject();
      for (const work of oldWorks) {
        const release = () => {
          for (const url of new Set([work.cover, ...work.images])) {
            warmImages.delete(url);
            URL.revokeObjectURL(url);
          }
        };
        if (dialog.open && activeWork === work) dialog.addEventListener('close', release, { once: true });
        else release();
      }
    };
  };
}

function isArtworkPhoto(blob) {
  return blob instanceof Blob && blob.size > 0;
}

const dialog = document.querySelector('#work-dialog');
const dialogImage = document.querySelector('#dialog-image');
const dialogTitle = document.querySelector('#dialog-title');
const dialogKicker = document.querySelector('#dialog-kicker');
const dialogYear = document.querySelector('#dialog-year');
const dialogMaterials = document.querySelector('#dialog-materials');
const thumbs = document.querySelector('#dialog-thumbs');
let activeWork = null;
let activeImage = 0;
let artworkSlideshow;

function stopArtworkSlideshow() {
  clearInterval(artworkSlideshow);
}

function selectArtworkPhoto(index, manual = true) {
  if (!dialog.open || !activeWork || activeWork.images.length < 2) return;
  if (manual) stopArtworkSlideshow();
  const count = activeWork.images.length;
  activeImage = (index + count) % count;
  renderGalleryImage();
}

function renderGalleryImage() {
  if (!activeWork) return;
  const source = activeWork.images[activeImage];
  const work = activeWork;
  const index = activeImage;
  dialogImage.src = index === 0 && work.preview ? work.preview : source;
  if (index === 0 && work.preview) {
    warmImage(source).decode().then(() => {
      if (activeWork === work && activeImage === index) dialogImage.src = source;
    }).catch(() => {});
  }
  document.querySelector('#dialog-photo-count').textContent = `${index + 1} из ${work.images.length}`;
  dialogImage.alt = `${activeWork.title}, фотография ${activeImage + 1}`;
  [...thumbs.children].forEach((button, index) => {
    button.classList.toggle('is-active', index === activeImage);
    button.setAttribute('aria-pressed', String(index === activeImage));
  });
}

function showWork(work) {
  if (!work?.images?.length || dialog.open) return;
  activeWork = work;
  if (!activeWork || !dialog) return;
  activeImage = 0;
  dialogTitle.textContent = activeWork.title;
  dialogKicker.textContent = activeWork.kicker;
  const description = (activeWork.description || '').trim();
  const more = document.querySelector('#description-more');
  more.open = false;
  more.hidden = !description;
  document.querySelector('#description-rest').textContent = description;
  const size = document.querySelector('#dialog-size');
  size.parentElement.hidden = !activeWork.size;
  size.textContent = activeWork.size || '';
  dialog.querySelector('.gallery-controls').hidden = activeWork.images.length < 2;
  document.querySelector("#dialog-price").textContent = activeWork.priceLabel || workPrice(activeWork);
  const contact = dialog.querySelector('.dialog-contact');
  const sold = activeWork.status === 'Продана';
  contact.textContent = sold ? 'Заказать копию' : 'Написать о картине';
  dialogYear.textContent = activeWork.year || '';
  dialogYear.parentElement.hidden = !activeWork.year;
  dialogMaterials.textContent = activeWork.materials;
  thumbs.replaceChildren(...activeWork.images.map((source, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Показать фотографию ${index + 1}`);
    const image = document.createElement('img');
    image.src = source;
    image.alt = '';
    button.append(image);
    button.addEventListener('click', () => selectArtworkPhoto(index));
    return button;
  }));
  renderGalleryImage();
  dialog.showModal();
  dialog.scrollTop = 0;
  stopArtworkSlideshow();
  if (work.images.length > 1 && !reducedMotion.matches) {
    artworkSlideshow = setInterval(() => {
      if (!document.hidden && !document.querySelector('.contact-choice[open]') && !reducedMotion.matches) {
        selectArtworkPhoto(activeImage + 1, false);
      }
    }, 4000);
  }
}

artworkMore.addEventListener('click', () => { visibleArtworks += 2; renderProject(); });
artworkLess.addEventListener('click', () => { visibleArtworks -= 2; renderProject(); });
renderProject();
const refreshCatalog = sharedCatalog ? loadSharedArtworks : loadLocalArtworks;
refreshCatalog();
window.addEventListener('storage', event => {
  if (event.key === artworkRevisionKey) refreshCatalog();
});
window.addEventListener('pageshow', refreshCatalog);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshCatalog();
});
if (sharedCatalog) setInterval(() => { if (!document.hidden) refreshCatalog(); }, 45000);

const artworkPages = new Map();
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

projectGrid.addEventListener('click', async event => {
  const card = event.target.closest('a.art-card');
  if (!card || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const url = card.href;
  const preview = card.querySelector('img');
  const page = await loadArtwork(url);
  if (!page) return void location.assign(url);
  const details = page.querySelector('.artwork-page-details');
  const [size, year] = details.querySelector('p').textContent.split(',').map(value => value.trim());
  showWork({
    title: details.querySelector('h1').textContent,
    kicker: 'Авторская работа',
    size, year,
    priceLabel: details.querySelector('.artwork-price').textContent,
    materials: details.querySelector('.artwork-price + p')?.textContent || '',
    description: [...page.querySelectorAll('.artwork-description p')].map(p => p.textContent.trim()).join('\n\n'),
    preview: preview.currentSrc || preview.src,
    images: [new URL(page.querySelector('img').getAttribute('src'), url).href]
  });
});


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
  selectArtworkPhoto(activeImage - 1);
});
document.querySelector('.gallery-arrow.next')?.addEventListener('click', () => {
  selectArtworkPhoto(activeImage + 1);
});
dialog.addEventListener('close', () => {
  if (!dialog.open) stopArtworkSlideshow();
});
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
