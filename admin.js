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
let artworkPreviewUrl = '';
let editingArtworkId = null;
let editingArtworkRecord = null;

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
  if (authenticated) openDatabase().then(renderLibrary).then(refreshSitePreview).catch(() => markDraftChanged('Хранилище браузера недоступно.'));
  else document.querySelector('#admin-site-preview').removeAttribute('src');
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#login-message');
  const valid = form.elements.login.value.trim().toLowerCase() === LOGIN
    && await sha256(form.elements.password.value) === PASSWORD_HASH;
  if (!valid) return void (message.textContent = 'Неверный логин или пароль.');
  sessionStorage.setItem(SESSION_KEY, '1');
  if (form.elements.remember.checked) localStorage.setItem(SESSION_KEY, '1');
  form.reset();
  message.textContent = '';
  setAuthenticated(true);
});

logout.addEventListener('click', () => {
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

const getAllWorks = () => storeRequest('artworks', 'readonly', 'getAll');
const addWork = (work) => storeRequest('artworks', 'readwrite', 'add', work);
const updateWork = (work) => storeRequest('artworks', 'readwrite', 'put', work);

function markDraftChanged(message = 'Сохранено в этом браузере.') {
  document.querySelector('#draft-status').textContent = message;
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

async function renderLibrary() {
  renderBuiltInWorks();
  const rows = (await getAllWorks()).filter(row => !row.removed).reverse();
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
    meta.textContent = [row.year, row.status, row.pending || row.published === false ? 'Черновик' : 'На сайте'].filter(Boolean).join(' · ');
    const actions = document.createElement('div');
    actions.className = 'admin-work-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'edit-work';
    edit.textContent = 'Изменить';
    edit.addEventListener('click', () => openArtworkEditor(row));
    const markSold = document.createElement('button');
    markSold.type = 'button';
    markSold.textContent = row.status === 'Продана' ? 'Вернуть в наличие' : 'Отметить проданной';
    markSold.onclick = async () => {
      try {
        await updateWork({ ...row, status: row.status === 'Продана' ? 'В наличии' : 'Продана',
          pending: true, live: row.pending ? row.live : (row.published !== false ? row : null) });
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
        await updateWork({ ...row, removed: true, pending: true, live: row.pending ? row.live : (row.published !== false ? row : null) });
        markDraftChanged('Удаление сохранено в черновике.');
        await renderLibrary();
      } catch {
        markDraftChanged('Удалить картину не удалось.');
      }
    });
    text.append(title, meta);
    actions.append(edit, markSold, remove);
    copy.append(text, actions);
    article.append(image, copy);
    return article;
  }));
}

function openArtworkEditor(row = null) {
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
  artworkForm.elements.cropX.value = row?.crop?.x ?? 50;
  artworkForm.elements.cropY.value = row?.crop?.y ?? 50;
  artworkForm.elements.zoom.value = row?.crop?.zoom || 100;
  artworkForm.elements.images.required = !row;
  document.querySelector('#editor .editor-head h2').textContent = row ? 'Редактировать картину' : 'Добавить картину';
  if (row) {
    artworkPreviewImage.src = URL.createObjectURL(row.images[0]);
    updateArtworkCrop();
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
      crop, cover, images, published: false, pending: true,
      live: editingArtworkRecord?.pending ? editingArtworkRecord.live : (editingArtworkRecord?.published !== false ? editingArtworkRecord : null),
      updatedAt: Date.now()
    };
    if (editingArtworkId) await updateWork({ ...work, id: editingArtworkId });
    else await addWork(work);
    editor.close();
    message.textContent = '';
    markDraftChanged();
    await renderLibrary();
  } catch (error) {
    message.textContent = error?.name === 'QuotaExceededError' ? 'В браузере недостаточно места для этих файлов.' : 'Не удалось сохранить картину.';
  }
});

function renderBuiltInWorks() {
  const hidden = new Set(JSON.parse(localStorage.getItem('daria-hidden-artworks') || '[]'));
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
    button.onclick = () => {
      if (hidden.has(file)) hidden.delete(file);
      else if (confirm(`Убрать ${title} из портфолио в этом браузере?`)) hidden.add(file);
      localStorage.setItem('daria-hidden-artworks', JSON.stringify([...hidden]));
      renderBuiltInWorks();
    };
    row.append(label, button);
    return row;
  }));
}

const publishDialog = document.querySelector('#publish-confirm');
const publishButton = document.querySelector('#confirm-publish');
const contactLabel = document.querySelector('#contact-label');
const textDraft = JSON.parse(localStorage.getItem('daria-site-text-v2') || '{}');
contactLabel.value = localStorage.getItem('daria-contact-label') || 'Связаться';
document.querySelector('#publish-local').onclick = () => publishDialog.showModal();
publishButton.onclick = async () => {
  publishButton.disabled = true;
  try {
    const rows = await getAllWorks();
    await new Promise((resolve, reject) => {
      const tx = database.transaction('artworks', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore('artworks');
      for (const row of rows) {
        if (row.removed && !row.sourcePage) store.delete(row.id);
        else if (row.removed) store.put({ id: row.id, sourcePage: row.sourcePage, removed: true });
        else if (row.pending || row.published === false) {
          const { pending, live, removed, ...record } = row;
          store.put({ ...record, published: true });
        }
      }
    });
    localStorage.setItem('daria-contact-label', contactLabel.value.trim() || 'Связаться');
    localStorage.setItem('daria-site-text-v2', JSON.stringify(textDraft));
    publishDialog.close();
    markDraftChanged('Изменения применены в этом браузере.');
    await renderLibrary();
    refreshSitePreview();
  } catch {
    publishDialog.close();
    markDraftChanged('Не удалось применить изменения. Попробуйте снова.');
  } finally {
    publishButton.disabled = false;
  }
};

function refreshSitePreview() {
  document.querySelector('#admin-site-preview').src = 'index.html';
}

document.querySelector('#admin-site-preview').addEventListener('load', event => {
  const doc = event.target.contentDocument;
  doc?.addEventListener('click', async click => {
    const card = click.target.closest('#project-grid .art-card, #sold-grid .art-card');
    if (!card) {
      const label = click.target.closest('.hero .circle-link');
      if (label) {
        click.preventDefault();
        const value = prompt('Текст кнопки на главной', contactLabel.value);
        if (value?.trim()) {
          contactLabel.value = value.trim().slice(0, 32);
          label.textContent = contactLabel.value;
        }
      } else {
        const element = click.target.closest('[data-edit-text]');
        if (!element) return;
        click.preventDefault();
        const value = prompt('Изменить текст', element.textContent.trim());
        if (value?.trim()) {
          textDraft[element.dataset.editText] = value.trim();
          element.textContent = value.trim();
          markDraftChanged('Текст сохранён в черновике.');
        }
      }
      return;
    }
    click.preventDefault();
    click.stopPropagation();
    try {
      const rows = await getAllWorks();
      const file = card.getAttribute('href');
      const key = card.dataset.work;
      const existing = rows.find(row => !row.removed && (file ? row.sourcePage === file : key === `local-${row.id}`));
      if (existing) return openArtworkEditor(existing);
      if (!file || !artworkMarkup[file]) return;
      const page = new DOMParser().parseFromString(artworkMarkup[file], 'text/html');
      const metadata = page.querySelector('.artwork-page-details > p').textContent.split(',');
      const response = await fetch(page.querySelector('img').getAttribute('src'));
      if (!response.ok) throw new Error('Photo unavailable');
      openArtworkEditor({
        sourcePage: file, published: false,
        title: page.querySelector('h1').textContent.replace(/^Авторская картина /, '').replace(/[«»]/g, ''),
        size: metadata[0].trim(), year: metadata[1]?.trim() || '2026',
        price: page.querySelector('.artwork-price').textContent.replace(/\D/g, ''),
        materials: page.querySelector('.artwork-price + p')?.textContent || '',
        description: page.querySelector('.artwork-description p')?.textContent || '',
        images: [await response.blob()]
      });
    } catch {
      markDraftChanged('Не удалось открыть картину для редактирования.');
    }
  }, { capture: true });
});

setAuthenticated(sessionStorage.getItem(SESSION_KEY) === '1' || localStorage.getItem(SESSION_KEY) === '1');
