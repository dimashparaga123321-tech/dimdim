const LOGIN = 'darya.art';
const PASSWORD_HASH = 'd8a69268ab0d1b9b833d3c189f1fdb94ea8233665f0bea5b0da480c0f430da3e';
const SESSION_KEY = 'daria-admin-preview';

const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const editor = document.querySelector('#editor');
const artworkForm = document.querySelector('#artwork-form');
const artworkPreview = document.querySelector('#crop-preview');
const artworkPreviewImage = artworkPreview.querySelector('img');
let database;
const maxArtworkPhotos = 8;
const maxPhotoBytes = 280 * 1024;
let artworkPhotos = [];
let photoUrls = [];
let editingArtworkId = null;
let editingArtworkRecord = null;
let libraryPhotoUrls = [];
let sharedState;
let publishSelection = null;

function artworkImages(row) {
  const isPhoto = blob => blob instanceof Blob && blob.size > 0;
  const photos = Array.isArray(row.images) ? row.images.filter(isPhoto) : [];
  if (!photos.length && isPhoto(row.cover)) photos.push(row.cover);
  return photos;
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
  if (authenticated) initializeEditor().catch(() => markDraftChanged('Не удалось открыть каталог. Перезагрузите страницу.'));
  else document.querySelector('#admin-site-preview').removeAttribute('src');
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#login-message');
  const submit = event.submitter;
  if (submit) submit.disabled = true;
  try {
    if (sharedCatalog) await sharedCatalog.login(form.elements.login.value.trim(), form.elements.password.value, form.elements.remember.checked);
    else {
      const valid = form.elements.login.value.trim().toLowerCase() === LOGIN
        && await sha256(form.elements.password.value) === PASSWORD_HASH;
      if (!valid) throw Object.assign(new Error('Invalid login'), { status: 401 });
      sessionStorage.setItem(SESSION_KEY, '1');
      if (form.elements.remember.checked) localStorage.setItem(SESSION_KEY, '1');
    }
    form.reset();
    message.textContent = '';
    setAuthenticated(true);
  } catch (error) {
    message.textContent = [400, 401, 403].includes(error.status) ? 'Проверьте данные для входа и доступ к редактору.' : 'Не удалось войти. Попробуйте ещё раз.';
  } finally {
    if (submit) submit.disabled = false;
  }
});

logout.addEventListener('click', () => {
  sharedCatalog?.logout().catch(() => {});
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
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
    const transaction = database.transaction(store, mode);
    const request = transaction.objectStore(store)[action](value);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

const getDrafts = () => storeRequest('artworks', 'readonly', 'getAll');
async function getAllWorks() {
  const local = await getDrafts();
  const records = new Map(Object.entries(sharedState?.content.works || {}).map(([id, row]) => [id, { ...row, id, published: true }]));
  for (const row of local) records.set(row.id, row);
  return [...records.values()];
}
const addWork = (work) => storeRequest('artworks', 'readwrite', 'add', work);
const updateWork = (work) => storeRequest('artworks', 'readwrite', 'put', work);
const transferArtworks = document.querySelector('#transfer-artworks');

function markDraftChanged(message = 'Сохранено в этом браузере.') {
  const status = document.querySelector('#draft-status');
  status.textContent = message;
  status.classList.add('status-toast');
  clearTimeout(markDraftChanged.timeout);
  markDraftChanged.timeout = setTimeout(() => status.classList.remove('status-toast'), 4500);
}

async function previewBlob(file) {
  const url = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = url;
    await photo.decode();
    let scale = Math.min(1, 1600 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      for (const quality of [.86, .78, .7]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob?.type === 'image/webp' && blob.size <= maxPhotoBytes) return blob;
        if (!blob || blob.type !== 'image/webp') {
          const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (jpeg?.size <= maxPhotoBytes) return jpeg;
        }
      }
      scale *= .8;
    }
    throw new Error('Photo exceeds byte limit');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderLibrary() {
  renderBuiltInWorks();
  const records = await getAllWorks();
  renderChanges(records);
  const rows = records.filter(row => !row.removed).sort((a, b) => (b.createdAt || b.updatedAt || Number(b.id) || 0) - (a.createdAt || a.updatedAt || Number(a.id) || 0));
  const list = document.querySelector('#work-list');
  const endings = { one: 'работа', few: 'работы', many: 'работ' };
  document.querySelector('#work-count').textContent = `${rows.length} ${endings[new Intl.PluralRules('ru').select(rows.length)]}`;
  document.querySelector('#empty-library').hidden = rows.length > 0;
  document.querySelector('#transfer-options').hidden = !rows.some(row => typeof row.id === 'number' && artworkImages(row).length);
  transferArtworks.disabled = !sharedState;
  document.querySelector('#transfer-status').textContent = sharedState ? '' : 'Перенос станет доступен после подключения общего каталога.';
  libraryPhotoUrls.forEach(url => URL.revokeObjectURL(url));
  libraryPhotoUrls = [];
  list.replaceChildren(...rows.map((row) => {
    const article = document.createElement('article');
    article.className = 'admin-work';
    const image = document.createElement('img');
    const photos = artworkImages(row);
    if (photos.length) {
      image.src = URL.createObjectURL(photos[0]);
      libraryPhotoUrls.push(image.src);
    } else if (sharedCatalog && row.photos?.length) image.src = sharedCatalog.photoURL(row.photos[0]);
    image.alt = row.title;
    const copy = document.createElement('div');
    copy.className = 'admin-work-copy';
    const text = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = row.title;
    const meta = document.createElement('p');
    const needsPublish = Boolean(sharedCatalog && typeof row.id === 'number') || row.pending || row.published === false;
    const publication = needsPublish ? 'К публикации' : sharedCatalog ? 'Опубликована' : 'Видна в этом браузере';
    meta.textContent = [row.year, statusLabel(row.status), photos.length || row.photos?.length ? publication : 'Добавьте фото'].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'admin-work-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-work';
    edit.textContent = 'Изменить';
    edit.onclick = async () => {
      edit.disabled = true;
      try { await openArtworkEditor(row); }
      catch { markDraftChanged('Не удалось загрузить фотографии. Попробуйте ещё раз.'); }
      finally { edit.disabled = false; }
    };
    const markSold = document.createElement('button');
    markSold.type = 'button';
    markSold.textContent = row.status === 'Продана' ? 'Вернуть в наличие' : 'Отметить проданной';
    markSold.onclick = async () => {
      try {
        await updateWork({ ...row, status: row.status === 'Продана' ? 'В наличии' : 'Продана',
          pending: true, updatedAt: Date.now(), live: row.pending ? row.live : (row.published !== false ? row : null) });
        await renderLibrary();
        markDraftChanged('Статус сохранён в черновике.');
      } catch {
        markDraftChanged('Не удалось изменить статус.');
      }
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-work';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      if (!confirm(`Удалить «${row.title}»?`)) return;
      try {
        await updateWork({ ...row, removed: true, pending: true, updatedAt: Date.now(), live: row.pending ? row.live : (row.published !== false ? row : null) });
        markDraftChanged('Удаление сохранено в черновике.');
        await renderLibrary();
      } catch {
        markDraftChanged('Удалить картину не удалось.');
      }
    });
    text.append(title, meta);
    actions.append(edit, markSold, remove);
    if (needsPublish) {
      const publish = document.createElement('button');
      publish.type = 'button';
      publish.textContent = row.pending || row.published === false ? 'Опубликовать' : 'Переопубликовать';
      publish.onclick = () => openPublish(row.id, row.title);
      actions.prepend(publish);
    }
    copy.append(text, actions);
    article.append(image, copy);
    return article;
  }));
}

function statusLabel(status) {
  return status === 'Продана' ? 'Продана' : status === 'В наличии' ? 'В наличии' : 'В портфолио';
}

async function openArtworkEditor(row = null) {
  let photos = row ? artworkImages(row) : [];
  if (!photos.length && row?.photos?.length) {
    photos = await Promise.all(row.photos.map(async path => {
      const response = await fetch(sharedCatalog.photoURL(path));
      if (!response.ok) throw new Error('Photo unavailable');
      return response.blob();
    }));
  }
  editingArtworkId = row?.id || null;
  editingArtworkRecord = row;
  artworkForm.reset();
  artworkForm.elements.year.value = row?.year || '2026';
  artworkForm.elements.title.value = row?.title || '';
  artworkForm.elements.status.value = statusLabel(row?.status);
  artworkForm.elements.materials.value = row?.materials || '';
  artworkForm.elements.description.value = row?.description || '';
  setDescriptionVisible(Boolean(artworkForm.elements.description.value.trim()));
  artworkForm.elements.size.value = row?.size || '';
  artworkForm.elements.price.value = row?.price || '';
  artworkPhotos = photos.map(blob => ({ blob, stored: true }));
  document.querySelector('#save-message').textContent = '';
  renderArtworkPhotos();
  editor.showModal();
}

const addDescription = document.querySelector('#add-description');
function setDescriptionVisible(visible) {
  document.querySelector('#artwork-description-field').hidden = !visible;
  addDescription.setAttribute('aria-expanded', String(visible));
  addDescription.hidden = visible;
}
addDescription.addEventListener('click', () => {
  setDescriptionVisible(true);
  artworkForm.elements.description.focus();
});

document.querySelector('#new-work').addEventListener('click', () => openArtworkEditor());
document.querySelector('#close-editor').addEventListener('click', () => editor.close());
editor.addEventListener('click', (event) => { if (event.target === editor) editor.close(); });

function clearPhotoUrls() {
  photoUrls.forEach(url => URL.revokeObjectURL(url));
  photoUrls = [];
}

function renderArtworkPhotos() {
  clearPhotoUrls();
  photoUrls = artworkPhotos.map(({ blob }) => URL.createObjectURL(blob));
  artworkPreviewImage.style.display = photoUrls.length ? 'block' : 'none';
  if (photoUrls.length) artworkPreviewImage.src = photoUrls[0];
  else artworkPreviewImage.removeAttribute('src');
  artworkPreview.querySelector('span').hidden = Boolean(photoUrls.length);
  document.querySelector('#photo-count').textContent = `Фото: ${photoUrls.length} из ${maxArtworkPhotos}`;
  document.querySelector('#selected-photos').replaceChildren(...photoUrls.map((url, index) => {
    const item = document.createElement('li');
    const thumb = document.createElement('img');
    thumb.src = url;
    thumb.alt = '';
    const label = document.createElement('span');
    label.textContent = index === 0 ? 'Обложка' : `Фото ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Убрать';
    remove.setAttribute('aria-label', `Убрать фото ${index + 1}`);
    remove.onclick = () => {
      artworkPhotos.splice(index, 1);
      renderArtworkPhotos();
    };
    item.append(thumb, label);
    if (index > 0) {
      const cover = document.createElement('button');
      cover.type = 'button';
      cover.textContent = 'На обложку';
      cover.onclick = () => {
        artworkPhotos.unshift(...artworkPhotos.splice(index, 1));
        renderArtworkPhotos();
      };
      item.append(cover);
    }
    item.append(remove);
    return item;
  }));
}

editor.addEventListener('close', clearPhotoUrls);
document.querySelector('#artwork-images').addEventListener('change', event => {
  const files = [...event.target.files];
  const room = Math.max(0, maxArtworkPhotos - artworkPhotos.length);
  artworkPhotos.push(...files.slice(0, room).map(blob => ({ blob, stored: false })));
  event.target.value = '';
  document.querySelector('#save-message').textContent = files.length > room
    ? 'Можно добавить до восьми фото. Уберите лишние из списка.' : '';
  renderArtworkPhotos();
});

artworkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#save-message');
  if (!artworkPhotos.length) {
    message.textContent = 'Выберите хотя бы одно фото картины.';
    return;
  }
  const photosToSave = [...artworkPhotos];
  const save = event.submitter;
  save.disabled = true;
  message.textContent = 'Сохраняем…';
  try {
    const images = [];
    for (const photo of photosToSave) {
      images.push(photo.stored && photo.blob.size <= maxPhotoBytes ? photo.blob : await previewBlob(photo.blob));
    }
    const cover = images[0];
    const work = {
      ...(editingArtworkRecord || {}),
      title: artworkForm.elements.title.value.trim(),
      year: artworkForm.elements.year.value.trim() || '2026',
      status: artworkForm.elements.status.value,
      materials: artworkForm.elements.materials.value.trim(),
      description: artworkForm.elements.description.value.trim(),
      size: artworkForm.elements.size.value.trim(),
      price: artworkForm.elements.price.value.trim(),
      crop: null, cover, images, published: false, pending: true,
      live: editingArtworkRecord?.pending ? editingArtworkRecord.live : (editingArtworkRecord?.published !== false ? editingArtworkRecord : null),
      updatedAt: Date.now()
    };
    const id = editingArtworkId ? await updateWork({ ...work, id: editingArtworkId }) : await addWork(work);
    editor.close();
    message.textContent = '';
    openPublish(id, work.title);
    await renderLibrary();
  } catch (error) {
    message.textContent = error?.name === 'QuotaExceededError' ? 'В браузере недостаточно места для этих файлов.' : 'Не удалось открыть фото. Попробуйте выбрать файл JPEG или PNG.';
  } finally {
    save.disabled = false;
  }
});

const hiddenDraft = new Set(JSON.parse(localStorage.getItem('daria-hidden-artworks') || '[]'));
async function openBuiltInArtwork(file, records) {
  const rows = records || await getAllWorks();
  const existing = rows.find(row => row.sourcePage === file);
  if (existing?.removed) {
    markDraftChanged('Эта картина удалена. Чтобы добавить её заново, используйте «Добавить картину».');
    return;
  }
  if (existing) return openArtworkEditor(existing);
  if (!file || !artworkMarkup[file]) return;
  const page = new DOMParser().parseFromString(artworkMarkup[file], 'text/html');
  const metadata = page.querySelector('.artwork-page-details > p').textContent.split(',');
  const response = await fetch(page.querySelector('img').getAttribute('src'));
  if (!response.ok) throw new Error('Photo unavailable');
  return openArtworkEditor({
    sourcePage: file, published: false,
    title: page.querySelector('h1').textContent.replace(/^Авторская картина /, '').replace(/[«»]/g, ''),
    size: metadata[0].trim(), year: metadata[1]?.trim() || '2026',
    price: page.querySelector('.artwork-price').textContent.replace(/\D/g, ''),
    materials: page.querySelector('.artwork-price + p')?.textContent || '',
    description: page.querySelector('.artwork-description p')?.textContent || '',
    images: [await response.blob()]
  });
}

function renderBuiltInWorks() {
  const hidden = hiddenDraft;
  const list = document.querySelector('#built-in-list');
  list.replaceChildren(...Object.entries(artworkMarkup).map(([file, markup]) => {
    const page = new DOMParser().parseFromString(markup, 'text/html');
    const title = page.querySelector('h1').textContent;
    const row = document.createElement('article');
    row.className = 'built-in-row';
    const label = document.createElement('strong');
    label.textContent = title;
    const button = document.createElement('button');
    button.textContent = hidden.has(file) ? 'Вернуть' : 'Убрать';
    button.onclick = async () => {
      if (hidden.has(file)) hidden.delete(file);
      else if (confirm(`Убрать ${title} из портфолио?`)) hidden.add(file);
      renderBuiltInWorks();
      renderChanges(await getAllWorks());
    };
    const photos = document.createElement('button');
    photos.type = 'button';
    photos.textContent = 'Добавить фото';
    photos.setAttribute('aria-label', `Добавить фото к картине ${title}`);
    photos.onclick = async () => {
      photos.disabled = true;
      try {
        await openBuiltInArtwork(file);
      } catch {
        markDraftChanged('Не удалось загрузить фото картины. Попробуйте ещё раз.');
      } finally {
        photos.disabled = false;
      }
    };
    row.append(label, photos, button);
    return row;
  }));
}

const publishDialog = document.querySelector('#publish-confirm');
const publishButton = document.querySelector('#confirm-publish');
const cancelPublish = publishDialog.querySelector('button[type="submit"]');
publishDialog.addEventListener('cancel', event => { if (publishButton.disabled) event.preventDefault(); });
const publishAll = document.querySelector('#publish-local');
const textDraft = JSON.parse(localStorage.getItem('daria-site-text-draft-v2') || localStorage.getItem('daria-site-text-v2') || '{}');
function openPublish(id = null, title = '') {
  publishSelection = id;
  document.querySelector('#publish-title').textContent = id === 'device' ? 'Перенести работы с этого устройства?' : title ? `Опубликовать «${title.replace(/^«|»$/g, '')}»?` : 'Опубликовать изменения?';
  document.querySelector('#publish-hint').textContent = sharedCatalog
    ? 'После подтверждения изменения появятся на сайте для всех посетителей.'
    : 'Общее хранилище ещё не подключено. Изменения будут видны только в этом браузере.';
  publishDialog.showModal();
}
publishAll.onclick = () => openPublish();
transferArtworks.onclick = () => { if (sharedState) openPublish('device'); };

async function initializeEditor() {
  refreshSitePreview();
  await openDatabase();
  if (sharedCatalog) {
    sharedState = await sharedCatalog.read();
    const { texts, hidden } = sharedState.content;
    const drafts = JSON.parse(localStorage.getItem('daria-site-text-draft-v2') || '{}');
    const localTexts = sharedState.revision === 0 ? textDraft : {};
    const nextTexts = { ...texts, ...localTexts, ...drafts };
    for (const key of Object.keys(textDraft)) delete textDraft[key];
    Object.assign(textDraft, nextTexts);
    if (sharedState.revision > 0) hiddenDraft.clear();
    for (const file of hidden) hiddenDraft.add(file);
    refreshSitePreview();
  }
  await renderLibrary();
}

async function publishSharedChanges(selection) {
  if (!sharedState) throw new Error('Catalog is not ready');
  const rows = (await getDrafts()).filter(row => selection === 'device'
    ? typeof row.id === 'number' && !row.removed
    : selection === null || row.id === selection);
  const content = structuredClone(sharedState.content);
  const hidden = selection === null ? new Set(hiddenDraft) : new Set(content.hidden);
  let device = localStorage.getItem('daria-catalog-migration-device');
  if (!device) {
    device = crypto.randomUUID();
    localStorage.setItem('daria-catalog-migration-device', device);
  }
  const committed = [];
  const missingPhotos = [];
  for (const row of rows) {
    const id = row.sourcePage ? `page-${row.sourcePage}` : typeof row.id === 'number' ? `${device}-${row.id}` : row.id;
    if (row.removed) {
      delete content.works[id];
      if (row.sourcePage) hidden.add(row.sourcePage);
    } else {
      const images = artworkImages(row);
      const photos = [];
      if (images.length) {
        for (const photo of images) photos.push(await sharedCatalog.upload(photo.size > maxPhotoBytes ? await previewBlob(photo) : photo));
      } else photos.push(...(row.photos || []));
      if (!photos.length) {
        missingPhotos.push(row.title || 'Без названия');
        continue;
      }
      const { title, year, materials, description, size, price, status, sourcePage, crop } = row;
      content.works[id] = { title, year, materials, description, size, price, status: statusLabel(status), sourcePage, crop,
        createdAt: content.works[id]?.createdAt || row.createdAt || row.updatedAt || Date.now(), photos };
    }
    committed.push(row);
  }
  content.hidden = [...hidden];
  if (selection === null) content.texts = { ...textDraft };
  if (committed.length || selection === null) sharedState = await sharedCatalog.save(sharedState.revision, content);
  for (const row of committed) {
    await new Promise((resolve, reject) => {
      const tx = database.transaction('artworks', 'readwrite');
      const store = tx.objectStore('artworks');
      const request = store.get(row.id);
      request.onsuccess = () => {
        if (request.result && request.result.updatedAt === row.updatedAt) store.delete(row.id);
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
  }
  if (selection === null) localStorage.removeItem('daria-site-text-draft-v2');
  localStorage.setItem('daria-artwork-revision', crypto.randomUUID());
  return missingPhotos.length
    ? `Нужны фото: ${missingPhotos.join(', ')}.${committed.length || selection === null ? ' Остальные изменения опубликованы.' : ''}`
    : selection === 'device' ? `Работы опубликованы для всех (${committed.length}).` : 'Изменения опубликованы для всех.';
}

publishButton.onclick = async () => {
  const selection = publishSelection;
  publishButton.disabled = true;
  cancelPublish.disabled = true;
  try {
    if (sharedCatalog) {
      const result = await publishSharedChanges(selection);
      publishDialog.close();
      markDraftChanged(result);
      await renderLibrary();
      refreshSitePreview();
      return;
    }
    const published = { available: 0, sold: 0 };
    const missingPhotos = [];
    await new Promise((resolve, reject) => {
      const tx = database.transaction('artworks', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore('artworks');
      const request = store.getAll();
      request.onsuccess = () => {
        for (const row of request.result) {
          if (selection !== null && row.id !== selection) continue;
          if (row.removed && !row.sourcePage) store.delete(row.id);
          else if (row.removed) store.put({ id: row.id, sourcePage: row.sourcePage, removed: true });
          else if (row.pending || row.published === false) {
            if (!artworkImages(row).length) {
              missingPhotos.push(row.title || 'Без названия');
              continue;
            }
            const { pending, live, removed, ...record } = row;
            store.put({ ...record, published: true });
            published[row.status === 'Продана' ? 'sold' : 'available']++;
          }
        }
      };
    });
    if (selection === null) {
      localStorage.setItem('daria-site-text-v2', JSON.stringify(textDraft));
      localStorage.removeItem('daria-site-text-draft-v2');
      localStorage.setItem('daria-hidden-artworks', JSON.stringify([...hiddenDraft]));
    }
    localStorage.setItem('daria-artwork-revision', crypto.randomUUID());
    publishDialog.close();
    const result = `Применено в этом браузере. Портфолио — ${published.available}, проданные — ${published.sold}.`;
    markDraftChanged(missingPhotos.length ? `${result} Для этих черновиков нужно добавить фото: ${missingPhotos.join(', ')}.` : result);
    await renderLibrary();
    refreshSitePreview();
  } catch (error) {
    publishDialog.close();
    markDraftChanged(error.status === 409 ? 'Каталог изменился на другом устройстве. Черновик сохранён. Перезагрузите редактор перед повторной публикацией.'
      : [401, 403].includes(error.status) ? 'Войдите заново, чтобы опубликовать. Черновик сохранён.' : 'Не удалось применить изменения. Черновик сохранён, попробуйте снова.');
  } finally {
    publishButton.disabled = false;
    cancelPublish.disabled = false;
  }
};

const frame = document.querySelector('#admin-site-preview');
const previewMode = document.querySelector('#preview-mode');
previewMode.onclick = () => {
  const viewing = previewMode.getAttribute('aria-pressed') !== 'true';
  previewMode.setAttribute('aria-pressed', String(viewing));
  previewMode.textContent = viewing ? 'Вернуться к редактированию' : 'Смотреть как посетитель';
  frame.contentDocument?.querySelectorAll('.admin-inline-tools').forEach(element => { element.hidden = viewing; });
  frame.scrollIntoView({ block: 'start' });
};
const sectionPicker = document.querySelector('#edit-section');
const textEditor = document.querySelector('#text-editor');
const publishedTexts = () => sharedState?.content.texts || JSON.parse(localStorage.getItem('daria-site-text-v2') || '{}');

function renderChanges(records) {
  const previous = publishedTexts();
  const workChanges = records.filter(row => row.pending || row.published === false || (sharedCatalog && typeof row.id === 'number'));
  const changes = workChanges
    .map(row => `${row.removed ? 'Удаление' : 'Картина'} · ${row.title} · ${row.status === 'Продана' ? 'Проданные картины' : 'Портфолио'}`);
  const previouslyHidden = new Set(sharedState?.content.hidden || JSON.parse(localStorage.getItem('daria-hidden-artworks') || '[]'));
  for (const file of new Set([...previouslyHidden, ...hiddenDraft])) {
    if (previouslyHidden.has(file) === hiddenDraft.has(file)) continue;
    const title = new DOMParser().parseFromString(artworkMarkup[file] || '', 'text/html').querySelector('h1')?.textContent || file;
    changes.push(`${hiddenDraft.has(file) ? 'Скрыть' : 'Вернуть'} · ${title} · Портфолио`);
  }
  for (const key of Object.keys(textDraft)) {
    if (textDraft[key] === previous[key]) continue;
    const section = [...sectionPicker.options].find(option => option.value === key.split('-')[0]);
    const text = `Текст · ${section?.textContent || key}`;
    if (!changes.includes(text)) changes.push(text);
  }
  const list = document.querySelector('#changes-list');
  publishAll.hidden = changes.length <= 1 && !workChanges.some(row => row.removed) && changes.length === workChanges.length;
  list.replaceChildren(...(changes.length ? changes : ['Нет изменений к отправке']).map(value => {
    const item = document.createElement('li');
    item.textContent = value;
    return item;
  }));
}

function openSectionText(section) {
  const target = frame.contentDocument?.getElementById(section);
  if (!target) return;
  frame.scrollIntoView({ block: 'start' });
  const rect = target.getBoundingClientRect();
  window.scrollBy(0, rect.top);
  const title = [...sectionPicker.options].find(option => option.value === section)?.textContent;
  document.querySelector('#text-heading').textContent = `Изменить текст · ${title}`;
  const fields = document.querySelector('#text-fields');
  fields.replaceChildren(...[...target.querySelectorAll('[data-edit-text]')].map((element, index) => {
    const label = document.createElement('label');
    label.textContent = element.matches('h2,h3') ? 'Заголовок' : `Текст ${index + 1}`;
    const input = document.createElement('textarea');
    input.rows = 3;
    input.dataset.key = element.dataset.editText;
    input.value = textDraft[input.dataset.key] ?? element.textContent.trim();
    label.append(input);
    return label;
  }));
  textEditor.showModal();
}

document.querySelector('#edit-section-text').onclick = () => {
  if (sectionPicker.value) openSectionText(sectionPicker.value);
  else sectionPicker.focus();
};
document.querySelector('#text-form').addEventListener('submit', event => {
  if (event.submitter?.value !== 'save') return;
  document.querySelectorAll('#text-fields textarea').forEach(input => {
    const element = frame.contentDocument.querySelector(`[data-edit-text="${input.dataset.key}"]`);
    if (element && input.value.trim() !== element.textContent.trim()) {
      textDraft[input.dataset.key] = input.value.trim();
      element.textContent = input.value.trim();
    }
  });
  localStorage.setItem('daria-site-text-draft-v2', JSON.stringify(textDraft));
  getAllWorks().then(renderChanges);
  markDraftChanged('Текст сохранён в черновике.');
});

let previewResize;
let pendingPreviewSection;
function refreshSitePreview() {
  document.querySelector('#admin-site-preview').src = './';
}

function goToEditorSection(id) {
  const target = frame.contentDocument?.getElementById(id);
  if (!target) { pendingPreviewSection = id; return; }
  pendingPreviewSection = null;
  window.scrollBy({ top: frame.getBoundingClientRect().top + target.getBoundingClientRect().top,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
document.querySelector('#open-sold-editor').onclick = () => {
  if (previewMode.getAttribute('aria-pressed') === 'true') previewMode.click();
  goToEditorSection('sold');
};

document.querySelector('#admin-site-preview').addEventListener('load', event => {
  const doc = event.target.contentDocument;
  if (!doc?.querySelector('#portfolio')) return;
  const style = doc.createElement('style');
  style.textContent = '.hero { min-height:680px } .site-header { position:relative } .admin-inline-tools { grid-column:1/-1; width:100%; margin:0 0 14px }';
  doc.head.append(style);
  const applyDraftText = () => doc.querySelectorAll('[data-edit-text]').forEach(element => {
    const value = textDraft[element.dataset.editText];
    if (typeof value === 'string') element.textContent = value;
  });
  applyDraftText();
  doc.addEventListener('daria-catalog-update', applyDraftText);
  previewResize?.disconnect();
  const resize = () => {
    if (!doc.querySelector('dialog[open]')) frame.style.height = `${doc.body.offsetHeight}px`;
  };
  previewResize = new ResizeObserver(resize);
  previewResize.observe(doc.body);
  resize();
  for (const option of sectionPicker.options) {
    if (!option.value) continue;
    const section = doc.getElementById(option.value);
    if (!section) continue;
    const controls = doc.createElement('div');
    controls.className = 'catalog-tools admin-inline-tools';
    controls.hidden = previewMode.getAttribute('aria-pressed') === 'true';
    const edit = doc.createElement('button');
    edit.textContent = 'Изменить текст';
    edit.onclick = () => openSectionText(option.value);
    controls.append(edit);
    if (option.value === 'portfolio' || option.value === 'sold') {
      const add = doc.createElement('button');
      add.textContent = 'Добавить картину';
      add.onclick = () => {
        openArtworkEditor();
        artworkForm.elements.status.value = option.value === 'sold' ? 'Продана' : 'В портфолио';
      };
      controls.append(add);
    }
    section.prepend(controls);
  }
  for (const link of doc.querySelectorAll('a[href^="#"]')) {
    link.addEventListener('click', click => {
      const target = doc.getElementById(link.hash.slice(1));
      if (!target) return;
      click.preventDefault();
      goToEditorSection(target.id);
    });
  }
  doc?.addEventListener('click', async click => {
    const card = click.target.closest('#project-grid .art-card, #sold-grid .art-card');
    if (!card || previewMode.getAttribute('aria-pressed') === 'true') return;
    click.preventDefault();
    click.stopPropagation();
    try {
      const rows = await getAllWorks();
      const file = card.getAttribute('href');
      const key = card.dataset.work;
      const existing = rows.find(row => !row.removed && (file ? row.sourcePage === file : key === `local-${row.id}`));
      if (existing) await openArtworkEditor(existing);
      else if (file) await openBuiltInArtwork(file, rows);
    } catch {
      markDraftChanged('Не удалось открыть картину для редактирования.');
    }
  }, { capture: true });
  if (pendingPreviewSection) goToEditorSection(pendingPreviewSection);
});

if (sharedCatalog) {
  document.querySelector('#login-label').textContent = 'Электронная почта';
  document.querySelector('#login-form').elements.login.type = 'email';
  sharedCatalog.restore().then(setAuthenticated).catch(() => setAuthenticated(false));
} else setAuthenticated(sessionStorage.getItem(SESSION_KEY) === '1' || localStorage.getItem(SESSION_KEY) === '1');
