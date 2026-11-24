function createCamera(scene) {
  const tools = document.querySelector('#camera-tools');
  const pointers = new Map();
  const museum = scene.closest('.museum');
  let frame = null;
  let scale = 1, panX = 0, panY = 0;
  let drawRequest = 0;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function paint() {
    drawRequest = 0;
    if (!frame) return;
    const maxX = Math.max(0, (frame.offsetWidth * scale - scene.clientWidth * .75) / 2);
    const maxY = Math.max(0, (frame.offsetHeight * scale - scene.clientHeight * .65) / 2);
    panX = clamp(panX, -maxX, maxX);
    panY = clamp(panY, -maxY, maxY);
    const x = Math.round(panX * 10) / 10;
    const y = Math.round(panY * 10) / 10;
    const zoom = Math.round(scale * 1000) / 1000;
    frame.style.transform = 'translate3d('+x+'px,'+y+'px,0) scale('+zoom+')';
  }
  function draw() {
    if (!drawRequest) drawRequest = requestAnimationFrame(paint);
  }
  function zoom(ratio) {
    scale = clamp(scale * ratio, 1, 4);
    draw();
  }
  function enter(target) {
    frame = target;
    const image = frame.querySelector('img');
    if (image.dataset.original) {
      // Decode first so the framed thumbnail remains visible during the approach.
      const original = new Image();
      original.src = image.dataset.original;
      original.decode().then(() => {
        image.src = original.src;
        delete image.dataset.original;
      }).catch(() => {});
    }
    scale = Math.min(1.55, scene.clientWidth * .94 / frame.offsetWidth, scene.clientHeight * .76 / frame.offsetHeight);
    panX = panY = 0;
    museum.classList.add('inspecting');
    tools.hidden = false;
    document.querySelector('#back').focus({preventScroll:true});
    draw();
  }
  function leave() {
    if (!frame) return;
    const target = frame;
    if (drawRequest) cancelAnimationFrame(drawRequest);
    drawRequest = 0;
    pointers.clear();
    target.classList.remove('dragging');
    target.style.transform = '';
    museum.classList.remove('inspecting');
    tools.hidden = true;
    frame = null;
    target.focus({preventScroll:true});
  }
  function distance() {
    const [a,b] = pointers.values();
    return Math.hypot(a.x-b.x, a.y-b.y);
  }
  scene.addEventListener('pointerdown', event => {
    if (!frame) return;
    scene.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    frame.classList.add('dragging');
  });
  scene.addEventListener('pointermove', event => {
    const old = pointers.get(event.pointerId);
    if (!old || !frame) return;
    const dx = event.clientX-old.x, dy = event.clientY-old.y;
    const pinching = pointers.size === 2;
    const before = pinching ? distance() : 0;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (pinching && before > 1) {
      panX += dx/2; panY += dy/2;
      zoom(distance()/before);
    } else if (pointers.size === 1) {
      panX += dx;
      panY += dy;
      draw();
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size && frame) frame.classList.remove('dragging');
  }
  scene.addEventListener('lostpointercapture',release);
  scene.addEventListener('pointercancel',release);
  scene.addEventListener('wheel',event=>{
    if (!frame) return;
    event.preventDefault();
    zoom(Math.exp(-clamp(event.deltaY,-120,120)*.002));
  },{passive:false});
  document.querySelector('#far').onclick = () => zoom(1/1.25);
  document.querySelector('#near').onclick = () => zoom(1.25);
  document.querySelector('#back').onclick = leave;
  document.addEventListener('keydown',event=>{
    if (!frame) return;
    if(event.key==='Escape') leave();
    if(event.key==='+') zoom(1.25);
    if(event.key==='-') zoom(1/1.25);
  });
  return {enter,get active(){return Boolean(frame)}};
}
