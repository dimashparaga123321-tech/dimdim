const LOGIN = 'darya.art';
const PASSWORD_HASH = 'd8a69268ab0d1b9b833d3c189f1fdb94ea8233665f0bea5b0da480c0f430da3e';
const SESSION_KEY = 'daria-admin-preview';
const DRAFT_KEY = 'daria-site-draft-v1';
const PUBLISHED_KEY = 'daria-site-published-v1';

const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const sitePreview = document.querySelector('#site-preview');
const inspectorEmpty = document.querySelector('#inspector-empty');
const textInspector = document.querySelector('#text-inspector');
const imageInspector = document.querySelector('#image-inspector');
const worksManager = document.querySelector('#works-manager');
const editor = document.querySelector('#editor');
const artworkForm = document.querySelector('#artwork-form');
const artworkPreview = document.querySelector('#crop-preview');
const artworkPreviewImage = artworkPreview.querySelector('img');
let database;
let selectedElement = null;
let selectedKey = '';
let selectedType = '';
let replacementFile = null;
let artworkPreviewUrl = '';
let editingArtworkId = null;
let editingArtworkRecord = null;

function readJson(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setAuthenticated(authenticated) {
  document.body.classList.toggle('is-authenticated', authenticated);
  loginView.hidden = authenticated;
  dashboard.hidden = !authenticated;
  logout.hidden = !authenticated;
  if (authenticated) openDatabase().then(async () => {
    renderLibrary();
    await setupPreview();
    setTimeout(setupPreview, 700);
  });
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#login-message');
  const valid = form.elements.login.value.trim().toLowerCase() === LOGIN
    && await sha256(form.elements.password.value) === PASSWORD_HASH;
  if (!valid) return void (message.textContent = 'Неверный логин или пароль.');
  sessionStorage.setItem(SESSION_KEY, '1');
  form.reset();
  message.textContent = '';
  setAuthenticated(true);
});

logout.addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  setAuthenticated(false);
});

function openDatabase() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('daria-portfolio', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { database = request.result; resolve(database); };
  });
}

function storeRequest(store, mode, action, value) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(store, mode).objectStore(store)[action](value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const getAllWorks = () => storeRequest('artworks', 'readonly', 'getAll');
const addWork = (work) => storeRequest('artworks', 'readwrite', 'add', work);
const updateWork = (work) => storeRequest('artworks', 'readwrite', 'put', work);
const removeWork = (id) => storeRequest('artworks', 'readwrite', 'delete', id);
const getMedia = (key) => storeRequest('media', 'readonly', 'get', key);
const putMedia = (record) => storeRequest('media', 'readwrite', 'put', record);
const getAllMedia = () => storeRequest('media', 'readonly', 'getAll');

function getTextElements(doc) {
  const selector = 'h1,h2,h3,p,small,strong,span,figcaption,dt,dd,li,a,button';
  return [...doc.querySelectorAll(selector)].filter((element) => {
    if (!element.textContent.trim() || element.closest('dialog') || element.closest('svg')) return false;
    return ![...element.children].some((child) => child.matches(selector) && child.textContent.trim());
  });
}

function getImageElements(doc) {
  return [...doc.querySelectorAll('img,.hero-portrait,.about-photo,.wrapped-art')].filter((element) => !element.closest('dialog'));
}

function markDraftChanged() {
  document.querySelector('#draft-status').textContent = 'Есть неопубликованные изменения';
  document.querySelector('#publish-message').textContent = 'Есть неопубликованные изменения';
}

function showInspector(type, element, key) {
  selectedElement?.classList.remove('cms-selected');
  selectedElement = element;
  selectedKey = key;
  selectedType = type;
  selectedElement.classList.add('cms-selected');
  inspectorEmpty.hidden = true;
  textInspector.hidden = type !== 'text';
  imageInspector.hidden = type !== 'image';

  if (type === 'text') {
    document.querySelector('#text-element-name').textContent = element.closest('section')?.querySelector('.section-title h2')?.textContent || 'Текст на странице';
    document.querySelector('#text-value').value = element.textContent.trim();
  } else {
    document.querySelector('#image-element-name').textContent = element.getAttribute('alt') || element.getAttribute('aria-label') || 'Фотография на странице';
    replacementFile = null;
    document.querySelector('#replacement-image').value = '';
    const source = element.tagName === 'IMG' ? element.src : getComputedStyle(element).backgroundImage.replace(/^url\(["']?|["']?\)$/g, '');
    const preview = document.querySelector('#image-preview');
    preview.src = source && source !== 'none' ? source : 'met-437984.jpg';
    getMedia(key).then((record) => {
      const crop = record?.crop || { x: 50, y: 50, zoom: 100 };
      document.querySelector('#image-x').value = crop.x;
      document.querySelector('#image-y').value = crop.y;
      document.querySelector('#image-zoom').value = crop.zoom;
      updateInspectorCrop();
    });
  }
}

async function setupPreview() {
  await openDatabase();
  const doc = sitePreview.contentDocument;
  if (!doc?.body) return;
  let style = doc.querySelector('#cms-editor-styles');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'cms-editor-styles';
    style.textContent = `[data-cms-editable]{cursor:pointer!important;outline:1px dashed transparent;outline-offset:3px;transition:outline-color .15s,background .15s}[data-cms-editable]:hover{outline-color:#be718f!important;background:rgba(229,162,187,.12)!important}.cms-selected{outline:3px solid #be718f!important;outline-offset:3px!important}a[data-cms-editable],button[data-cms-editable]{pointer-events:auto!important}`;
    doc.head.append(style);
  }

  const published = readJson(PUBLISHED_KEY);
  const draft = readJson(DRAFT_KEY);
  getTextElements(doc).forEach((element, index) => {
    const key = `text-${index}`;
    element.dataset.cmsEditable = key;
    const value = draft.text?.[key] ?? published.text?.[key];
    if (value !== undefined) element.textContent = value;
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showInspector('text', element, key);
    });
  });

  const media = await getAllMedia();
  const mediaMap = new Map(media.map((record) => [record.key, record]));
  getImageElements(doc).forEach((element, index) => {
    const key = `image-${index}`;
    element.dataset.cmsEditable = key;
    const record = mediaMap.get(key);
    if (record?.cropped) applyImageToElement(element, URL.createObjectURL(record.cropped));
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showInspector('image', element, key);
    });
  });
}

sitePreview.addEventListener('load', setupPreview);

document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
  sitePreview.contentDocument?.querySelector(`#${button.dataset.section}`)?.scrollIntoView({ behavior: 'smooth' });
}));

textInspector.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedElement || selectedType !== 'text') return;
  const value = document.querySelector('#text-value').value.trim();
  selectedElement.textContent = value;
  const draft = readJson(DRAFT_KEY);
  draft.text = { ...(draft.text || {}), [selectedKey]: value };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  markDraftChanged();
});

document.querySelector('#replacement-image').addEventListener('change', (event) => {
  replacementFile = event.target.files[0] || null;
  if (replacementFile) document.querySelector('#image-preview').src = URL.createObjectURL(replacementFile);
  updateInspectorCrop();
});

function updateInspectorCrop() {
  const preview = document.querySelector('#image-preview');
  preview.style.objectPosition = `${document.querySelector('#image-x').value}% ${document.querySelector('#image-y').value}%`;
  preview.style.transform = `scale(${Number(document.querySelector('#image-zoom').value) / 100})`;
}

['image-x', 'image-y', 'image-zoom'].forEach((id) => document.querySelector(`#${id}`).addEventListener('input', updateInspectorCrop));

async function blobFromElement(element) {
  const background = getComputedStyle(element).backgroundImage;
  const source = element.tagName === 'IMG' ? element.src : background.match(/url\(["']?(.*?)["']?\)/)?.[1];
  if (!source) throw new Error('Сначала выберите фотографию');
  const response = await fetch(source);
  return response.blob();
}

async function cropImage(file, crop, aspect = .8) {
  const source = await createImageBitmap(file);
  const width = 1600;
  const height = Math.round(width / Math.max(.35, Math.min(2.4, aspect)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.min(height, 2400);
  const zoom = crop.zoom / 100;
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height) * zoom;
  const sourceWidth = canvas.width / scale;
  const sourceHeight = canvas.height / scale;
  const sourceX = (source.width - sourceWidth) * (crop.x / 100);
  const sourceY = (source.height - sourceHeight) * (crop.y / 100);
  canvas.getContext('2d', { alpha: false }).drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  source.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('crop failed')), 'image/jpeg', .95));
}

function applyImageToElement(element, source) {
  if (element.tagName === 'IMG') element.src = source;
  else {
    element.classList.add('cms-has-image');
    element.style.backgroundImage = `url("${source}")`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
    element.querySelector('span')?.setAttribute('hidden', '');
  }
}

imageInspector.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedElement || selectedType !== 'image') return;
  try {
    const existing = await getMedia(selectedKey);
    const original = replacementFile || existing?.original || await blobFromElement(selectedElement);
    const crop = { x: Number(document.querySelector('#image-x').value), y: Number(document.querySelector('#image-y').value), zoom: Number(document.querySelector('#image-zoom').value) };
    const rect = selectedElement.getBoundingClientRect();
    const cropped = await cropImage(original, crop, rect.width / Math.max(1, rect.height));
    await putMedia({ key: selectedKey, original, cropped, publishedBlob: existing?.publishedBlob || null, crop });
    applyImageToElement(selectedElement, URL.createObjectURL(cropped));
    markDraftChanged();
  } catch (error) {
    document.querySelector('#publish-message').textContent = error.message || 'Не удалось обработать фотографию';
  }
});

async function publishSite() {
  localStorage.setItem(PUBLISHED_KEY, localStorage.getItem(DRAFT_KEY) || '{}');
  const media = await getAllMedia();
  await Promise.all(media.map((record) => putMedia({ ...record, publishedBlob: record.cropped || record.publishedBlob })));
  const works = await getAllWorks();
  await Promise.all(works.map((work) => updateWork({ ...work, published: true })));
  document.querySelector('#draft-status').textContent = 'Изменения отправлены на сайт';
  document.querySelector('#publish-message').textContent = 'Изменения отправлены на сайт';
  sitePreview.contentWindow.location.reload();
}

document.querySelector('#publish-site').addEventListener('click', publishSite);
document.querySelector('#publish-site-mobile').addEventListener('click', publishSite);
document.querySelector('#discard-draft').addEventListener('click', async () => {
  localStorage.setItem(DRAFT_KEY, localStorage.getItem(PUBLISHED_KEY) || '{}');
  const media = await getAllMedia();
  await Promise.all(media.map((record) => putMedia({ ...record, cropped: record.publishedBlob || record.cropped })));
  sitePreview.contentWindow.location.reload();
  document.querySelector('#draft-status').textContent = 'Черновик отменён';
});

document.querySelector('#manage-works').addEventListener('click', () => worksManager.showModal());
document.querySelector('#close-works').addEventListener('click', () => worksManager.close());
worksManager.addEventListener('click', (event) => { if (event.target === worksManager) worksManager.close(); });

async function renderLibrary() {
  const rows = await getAllWorks();
  const list = document.querySelector('#work-list');
  document.querySelector('#work-count').textContent = `${rows.length} ${rows.length === 1 ? 'работа' : 'работ'}`;
  document.querySelector('#empty-library').hidden = rows.length > 0;
  list.replaceChildren(...rows.map((row) => {
    const article = document.createElement('article');
    article.className = 'admin-work';
    const image = document.createElement('img');
    image.src = URL.createObjectURL(row.cover || row.images[0]);
    image.alt = row.title;
    const copy = document.createElement('div');
    copy.className = 'admin-work-copy';
    const text = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = row.title;
    const meta = document.createElement('p');
    meta.textContent = [row.year, row.status, row.published ? 'На сайте' : 'Черновик'].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'admin-work-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-work';
    edit.textContent = 'Изменить';
    edit.addEventListener('click', () => openArtworkEditor(row));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-work';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      if (!confirm(`Удалить «${row.title}»?`)) return;
      await removeWork(row.id);
      markDraftChanged();
      renderLibrary();
    });
    text.append(title, meta);
    actions.append(edit, remove);
    copy.append(text, actions);
    article.append(image, copy);
    return article;
  }));
}

function openArtworkEditor(row = null) {
  if (worksManager.open) worksManager.close();
  editingArtworkId = row?.id || null;
  editingArtworkRecord = row;
  artworkForm.reset();
  artworkForm.elements.year.value = row?.year || '2026';
  artworkForm.elements.title.value = row?.title || '';
  artworkForm.elements.status.value = row?.status || 'В портфолио';
  artworkForm.elements.materials.value = row?.materials || '';
  artworkForm.elements.description.value = row?.description || '';
  artworkForm.elements.size.value = row?.size || '';
  artworkForm.elements.price.value = row?.price || '';
  artworkForm.elements.cropX.value = row?.crop?.x || 50;
  artworkForm.elements.cropY.value = row?.crop?.y || 50;
  artworkForm.elements.zoom.value = row?.crop?.zoom || 100;
  artworkForm.elements.images.required = !row;
  document.querySelector('#editor .editor-head h2').textContent = row ? 'Редактировать картину' : 'Добавить картину';
  if (row) {
    artworkPreviewImage.src = URL.createObjectURL(row.cover || row.images[0]);
    artworkPreviewImage.style.display = 'block';
    artworkPreview.querySelector('span').hidden = true;
  } else {
    artworkPreviewImage.removeAttribute('src');
    artworkPreviewImage.style.display = 'none';
    artworkPreview.querySelector('span').hidden = false;
  }
  editor.showModal();
}

document.querySelector('#new-work').addEventListener('click', () => openArtworkEditor());
document.querySelector('#close-editor').addEventListener('click', () => editor.close());
editor.addEventListener('click', (event) => { if (event.target === editor) editor.close(); });

document.querySelector('#artwork-images').addEventListener('change', (event) => {
  const files = [...event.target.files].slice(0, 4);
  if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
  if (!files.length) return;
  artworkPreviewUrl = URL.createObjectURL(files[0]);
  artworkPreviewImage.src = artworkPreviewUrl;
  artworkPreviewImage.style.display = 'block';
  artworkPreview.querySelector('span').hidden = true;
  updateArtworkCrop();
});

function updateArtworkCrop() {
  const x = artworkForm.elements.cropX.value;
  const y = artworkForm.elements.cropY.value;
  const zoom = Number(artworkForm.elements.zoom.value) / 100;
  artworkPreviewImage.style.objectPosition = `${x}% ${y}%`;
  artworkPreviewImage.style.transform = `scale(${zoom})`;
}

['cropX', 'cropY', 'zoom'].forEach((name) => artworkForm.elements[name].addEventListener('input', updateArtworkCrop));

artworkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#save-message');
  const newFiles = [...artworkForm.elements.images.files].slice(0, 4);
  const images = newFiles.length ? newFiles : editingArtworkRecord?.images;
  if (!images?.length) return;
  message.textContent = 'Сохраняем…';
  try {
    const crop = { x: Number(artworkForm.elements.cropX.value), y: Number(artworkForm.elements.cropY.value), zoom: Number(artworkForm.elements.zoom.value) };
    const cover = await cropImage(images[0], crop, .8);
    const work = {
      ...(editingArtworkRecord || {}),
      title: artworkForm.elements.title.value.trim(),
      year: artworkForm.elements.year.value.trim() || '2026',
      status: artworkForm.elements.status.value,
      materials: artworkForm.elements.materials.value.trim(),
      description: artworkForm.elements.description.value.trim(),
      size: artworkForm.elements.size.value.trim(),
      price: artworkForm.elements.price.value.trim(),
      crop, cover, images, published: false, updatedAt: Date.now()
    };
    if (editingArtworkId) await updateWork({ ...work, id: editingArtworkId });
    else await addWork(work);
    editor.close();
    message.textContent = '';
    markDraftChanged();
    await renderLibrary();
    worksManager.showModal();
  } catch (error) {
    message.textContent = error?.name === 'QuotaExceededError' ? 'В браузере недостаточно места для этих файлов.' : 'Не удалось сохранить картину.';
  }
});

setAuthenticated(sessionStorage.getItem(SESSION_KEY) === '1');
