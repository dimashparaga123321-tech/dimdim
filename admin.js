const LOGIN = 'darya.art';
const PASSWORD_HASH = 'd8a69268ab0d1b9b833d3c189f1fdb94ea8233665f0bea5b0da480c0f430da3e';
const SESSION_KEY = 'daria-admin-preview';

const loginView = document.querySelector('#login-view');
const dashboard = document.querySelector('#dashboard');
const logout = document.querySelector('#logout');
const editor = document.querySelector('#editor');
const artworkForm = document.querySelector('#artwork-form');
const preview = document.querySelector('#crop-preview');
const previewImage = preview.querySelector('img');
let previewUrl = '';
let database;

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function setAuthenticated(authenticated) {
  loginView.hidden = authenticated;
  dashboard.hidden = !authenticated;
  logout.hidden = !authenticated;
  if (authenticated) openDatabase().then(renderLibrary);
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#login-message');
  const valid = form.elements.login.value.trim().toLowerCase() === LOGIN
    && await sha256(form.elements.password.value) === PASSWORD_HASH;
  if (!valid) {
    message.textContent = 'Неверный логин или пароль.';
    return;
  }
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
    const request = indexedDB.open('daria-portfolio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('artworks', { keyPath: 'id', autoIncrement: true });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { database = request.result; resolve(database); };
  });
}

function getAllWorks() {
  return new Promise((resolve, reject) => {
    const request = database.transaction('artworks').objectStore('artworks').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function addWork(work) {
  return new Promise((resolve, reject) => {
    const request = database.transaction('artworks', 'readwrite').objectStore('artworks').add(work);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function createCroppedCover(file, crop) {
  const source = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 2000;
  const zoom = crop.zoom / 100;
  const baseScale = Math.max(canvas.width / source.width, canvas.height / source.height) * zoom;
  const sourceWidth = canvas.width / baseScale;
  const sourceHeight = canvas.height / baseScale;
  const sourceX = (source.width - sourceWidth) * (crop.x / 100);
  const sourceY = (source.height - sourceHeight) * (crop.y / 100);
  canvas.getContext('2d', { alpha: false }).drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  source.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('crop failed')), 'image/jpeg', .95));
}

function removeWork(id) {
  return new Promise((resolve, reject) => {
    const request = database.transaction('artworks', 'readwrite').objectStore('artworks').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function renderLibrary() {
  const rows = await getAllWorks();
  const list = document.querySelector('#work-list');
  const empty = document.querySelector('#empty-library');
  document.querySelector('#work-count').textContent = `${rows.length} ${rows.length === 1 ? 'работа' : 'работ'}`;
  empty.hidden = rows.length > 0;
  list.replaceChildren(...rows.map((row) => {
    const article = document.createElement('article');
    article.className = 'admin-work';
    const image = document.createElement('img');
    image.src = URL.createObjectURL(row.cover || row.images[0]);
    image.alt = row.title;
    image.style.objectPosition = `${row.crop?.x || 50}% ${row.crop?.y || 50}%`;
    const copy = document.createElement('div');
    copy.className = 'admin-work-copy';
    const text = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = row.title;
    const meta = document.createElement('p');
    meta.textContent = [row.year, row.status].filter(Boolean).join(' · ');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-work';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      if (!confirm(`Удалить «${row.title}»?`)) return;
      await removeWork(row.id);
      renderLibrary();
    });
    text.append(title, meta);
    copy.append(text, remove);
    article.append(image, copy);
    return article;
  }));
}

document.querySelector('#new-work').addEventListener('click', () => editor.showModal());
document.querySelector('#close-editor').addEventListener('click', () => editor.close());
editor.addEventListener('click', (event) => { if (event.target === editor) editor.close(); });

document.querySelector('#artwork-images').addEventListener('change', (event) => {
  const files = [...event.target.files].slice(0, 4);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (!files.length) return;
  previewUrl = URL.createObjectURL(files[0]);
  previewImage.src = previewUrl;
  previewImage.style.display = 'block';
  preview.querySelector('span').hidden = true;
  updateCropPreview();
});

function updateCropPreview() {
  const x = artworkForm.elements.cropX.value;
  const y = artworkForm.elements.cropY.value;
  const zoom = Number(artworkForm.elements.zoom.value) / 100;
  previewImage.style.objectPosition = `${x}% ${y}%`;
  previewImage.style.transform = `scale(${zoom})`;
}

['cropX', 'cropY', 'zoom'].forEach((name) => artworkForm.elements[name].addEventListener('input', updateCropPreview));

artworkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#save-message');
  const files = [...artworkForm.elements.images.files].slice(0, 4);
  if (!files.length) return;
  message.textContent = 'Сохраняем…';
  try {
    const crop = { x: Number(artworkForm.elements.cropX.value), y: Number(artworkForm.elements.cropY.value), zoom: Number(artworkForm.elements.zoom.value) };
    const cover = await createCroppedCover(files[0], crop);
    await addWork({
      title: artworkForm.elements.title.value.trim(),
      year: artworkForm.elements.year.value.trim() || '2026',
      status: artworkForm.elements.status.value,
      materials: artworkForm.elements.materials.value.trim(),
      description: artworkForm.elements.description.value.trim(),
      size: artworkForm.elements.size.value.trim(),
      price: artworkForm.elements.price.value.trim(),
      crop,
      cover,
      images: files,
      createdAt: Date.now()
    });
    artworkForm.reset();
    artworkForm.elements.year.value = '2026';
    previewImage.removeAttribute('src');
    previewImage.style.display = 'none';
    preview.querySelector('span').hidden = false;
    message.textContent = '';
    editor.close();
    await renderLibrary();
  } catch (error) {
    message.textContent = error?.name === 'QuotaExceededError' ? 'В браузере недостаточно места для этих файлов.' : 'Не удалось сохранить картину.';
  }
});

setAuthenticated(sessionStorage.getItem(SESSION_KEY) === '1');
