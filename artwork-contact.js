(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'contact-choice';
  dialog.setAttribute('aria-labelledby', 'contact-choice-title');
  dialog.innerHTML = `
    <form method="dialog"><button class="contact-choice-close" aria-label="Закрыть">×</button></form>
    <h2 id="contact-choice-title">Как вам удобнее связаться?</h2>
    <p class="contact-choice-work" hidden></p>
    <a href="https://t.me/Art_Daria1" target="_blank" rel="noopener">Telegram <span>@Art_Daria1</span></a>
    <a href="https://www.instagram.com/Art__daria/" target="_blank" rel="noopener">Instagram <span>@Art__daria</span></a>
    <a href="tel:+79817558203">Позвонить <span>+7 981 755-82-03</span></a>
  `;
  document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  window.addArtworkContact = details => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artwork-contact-button';
    button.dataset.artworkContact = '';
    button.textContent = 'Написать о картине';
    details.querySelector('.artwork-description-button')?.after(button);
    if (!button.parentElement) details.append(button);
  };

  document.querySelectorAll('.artwork-page-details').forEach(window.addArtworkContact);
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-artwork-contact]');
    if (!trigger) return;
    event.preventDefault();
    const card = trigger.closest('.artwork-page, .dialog-copy');
    const title = card?.querySelector('h1,h2')?.textContent?.trim();
    const caption = dialog.querySelector('.contact-choice-work');
    caption.textContent = title || '';
    caption.hidden = !title;
    dialog.showModal();
  });
})();
