const collectionReady = new Promise(resolve => {
  let request;
  try {request = indexedDB.open('daria-exhibition',1)} catch {resolve([]);return}
  request.onupgradeneeded = () => request.result.createObjectStore('works',{autoIncrement:true});
  request.onerror = () => resolve([]);
  request.onsuccess = () => {
    const db = request.result;
    const store = db.transaction('works').objectStore('works');
    const keys = store.getAllKeys();
    const records = store.getAll();
    records.onsuccess = () => resolve(records.result.map((item,i) => [null,item.title,'Даша',item.medium,item.story,URL.createObjectURL(item.photo), keys.result[i], item.frameStyle || 'gilded']));
    window.editCaption = key => {
      const row = records.result[keys.result.indexOf(key)];
      if (!row) return;
      const dialog = document.querySelector('#caption-editor');
      const form = dialog.querySelector('form');
      form.elements.title.value = row.title;
      form.elements.story.value = row.story;
      dialog.showModal();
      form.onsubmit = event => {
        event.preventDefault();
        const tx = db.transaction('works','readwrite');
        tx.objectStore('works').put({...row,title:form.elements.title.value.trim(),story:form.elements.story.value.trim()},key);
        tx.oncomplete = () => location.reload();
        tx.onabort = () => {form.querySelector('output').textContent='Не удалось сохранить изменения.'};
      };
    };
    records.onerror = () => resolve([]);
    document.querySelector('#upload').onsubmit = async event => {
      event.preventDefault();
      const form = event.target;
      const save = form.querySelector('button');
      save.disabled = true;
      const fields = new FormData(form);
      try {
        const photo = fields.get('photo');
        document.querySelector('#message').textContent='Сохраняем оригинал…';
        await previewImage.decode();
        const tx = db.transaction('works','readwrite');
        tx.objectStore('works').add({title:fields.get('title').trim(),photo,medium:fields.get('medium'),story:[fields.get('story'),fields.get('price') && fields.get('price')+' ₽'].filter(Boolean).join(' · '),frameStyle:fields.get('frameStyle') || 'gilded'});
        tx.oncomplete = () => location.reload();
        tx.onabort = () => {
          save.disabled=false;
          document.querySelector('#message').textContent=tx.error?.name === 'QuotaExceededError'
            ? 'В хранилище браузера недостаточно места для этого файла.'
            : 'Не удалось сохранить фотографию. Попробуйте ещё раз.';
        };
      } catch {save.disabled=false;document.querySelector('#message').textContent='Попробуйте фотографию в формате JPEG или PNG.'}
    };
  };
});
const editor = document.querySelector('#editor');
const upload = document.querySelector('#upload');
const preview = document.querySelector('#preview-frame');
preview.append(document.querySelector('#moulding').content.cloneNode(true));
const previewImage = preview.querySelector('img');
previewImage.alt = '';
let previewUrl;
function refreshPreview() {
  const fields = upload.elements;
  const frameStyle = fields.frameStyle.value || 'gilded';
  preview.className = 'frame frame-'+frameStyle+(previewUrl ? '' : ' sample');
  document.querySelector('#preview-title').textContent = fields.title.value.trim() || 'Без названия';
  document.querySelector('#preview-caption').textContent = [fields.medium.value, fields.story.value, fields.price.value && fields.price.value+' ₽'].filter(Boolean).join(' · ') || (previewUrl ? 'Даша' : 'Выберите фотографию');
}
upload.addEventListener('input',refreshPreview);
upload.elements.photo.addEventListener('change',() => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const file = upload.elements.photo.files[0];
  previewUrl = file && URL.createObjectURL(file);
  const resolution = document.querySelector('#resolution');
  resolution.textContent = '';
  preview.classList.toggle('sample',!file);
  previewImage.onload = () => {
    resolution.textContent = previewImage.naturalWidth+' × '+previewImage.naturalHeight+' px · '+(file.size/1048576).toFixed(1)+' МБ · Оригинал';
  };
  previewImage.onerror = () => {resolution.textContent='Не удалось открыть изображение.'};
  if(file) previewImage.src = previewUrl;
  else previewImage.removeAttribute('src');
  refreshPreview();
});
document.querySelector('#addWork').onclick = () => editor.showModal();
document.querySelector('#cancel').onclick = () => editor.close();
document.querySelector('#upload').onsubmit = event => {
  event.preventDefault();
  document.querySelector('#message').textContent='Локальное хранилище недоступно в этом браузере.';
};
