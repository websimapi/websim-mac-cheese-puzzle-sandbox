/* app.js — moved from index.html
   Tombstone notes: inline script removed from index.html and relocated here.
   (If you need to trace removals: // removed inline script: main game logic moved to app.js)
*/
(() => {
  const { Engine, Render, World, Bodies, Body, Composite, Composites, Constraint, Events, Mouse, MouseConstraint, Runner, Vertices } = Matter;

  // DOM
  const canvas = document.getElementById('canvas');
  const startBtn = document.getElementById('btnStart');
  const stopBtn = document.getElementById('btnStop');
  const resetBtn = document.getElementById('btnReset');
  const clearBtn = document.getElementById('btnClear');
  const status = document.getElementById('status');
  const message = document.getElementById('message');
  const paletteItems = document.querySelectorAll('.pal-item');
  const bottomPalette = document.getElementById('bottomPalette');
  const propsPanel = document.getElementById('props');
  const selName = document.getElementById('selName');
  const propStatic = document.getElementById('propStatic');
  const propRot = document.getElementById('propRot');
  const btnDelete = document.getElementById('btnDelete');
  const btnDup = document.getElementById('btnDup');

  // Engine & renderer
  const engine = Engine.create();
  // start with gravity off so placed objects don't fall until the player starts the round
  engine.gravity.y = 0;
  const world = engine.world;
  const runner = Runner.create();

  // Canvas scaling/responsive — ensure CSS size matches pixel size to avoid coordinate mismatches
  function resizeCanvas(){
    if (window.innerWidth < 768){
      const w = Math.min(window.innerWidth - 28, 420);
      canvas.width = w * (window.devicePixelRatio || 1);
      canvas.height = Math.round(w * 3 / 4) * (window.devicePixelRatio || 1);
      // keep displayed size in CSS pixels equal to intended logical size
      canvas.style.width = `${w}px`;
      canvas.style.height = `${Math.round(w * 3 / 4)}px`;
    } else {
      const w = 800;
      const h = 600;
      canvas.width = w * (window.devicePixelRatio || 1);
      canvas.height = h * (window.devicePixelRatio || 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    // sync renderer options and canvas reference
    render.canvas.width = canvas.width;
    render.canvas.height = canvas.height;
    render.options.width = canvas.width;
    render.options.height = canvas.height;
    render.options.pixelRatio = window.devicePixelRatio || 1;
    // update displayed bounds so matter maps pointer positions correctly
    Render.lookAt(render, { min: { x:0, y:0 }, max: { x: canvas.width, y: canvas.height }});
  }

  const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
      width: canvas.width,
      height: canvas.height,
      wireframes: false,
      background: 'transparent',
      pixelRatio: window.devicePixelRatio || 1
    }
  });

  Render.run(render);
  Runner.run(runner, engine);

  // Ground bounds and walls
  function addBounds(){
    const W = canvas.width, H = canvas.height;
    const thickness = 60;
    const floor = Bodies.rectangle(W/2, H + thickness/2 - 6, W + 200, thickness, { isStatic:true, render:{fillStyle:'#7a5b38'}});
    const left = Bodies.rectangle(-thickness/2, H/2, thickness, H*2, { isStatic:true, render:{visible:false} });
    const right = Bodies.rectangle(W + thickness/2, H/2, thickness, H*2, { isStatic:true, render:{visible:false} });
    World.add(world, [floor, left, right]);
  }

  // Object factory
  const objects = []; // track placed items {id, body, meta}
  let idCounter = 1;
  let selectedType = null;
  let selectedBody = null;
  let isRunning = false;

  const DEFAULTS = {
    plankSmall: {w:120,h:16,fill:'#caa97f'},
    plankMed: {w:220,h:16,fill:'#d3b785'},
    crate: {w:56,h:56,fill:'#b07a4a'},
    ballBouncy: {r:18,fill:'#ff6b6b',restitution:0.9,density:0.002},
    ballHeavy: {r:20,fill:'#7f8c8d',restitution:0.2,density:0.01},
    spring: {w:40,h:16,fill:'#9de0ad'},
    seesaw: {w:220,h:12,fill:'#caa97f'},
    mac: {r:18,fill:'#8B4513'},
    cheese: {w:48,h:36,fill:'#FFD700'}
  };

  // Simple helper for rendering bodies with cartoon style
  function styleBody(body, meta){
    body.render.fillStyle = meta.fill || '#ccc';
    body.render.strokeStyle = '#6b4a2f';
    body.render.lineWidth = 2;
  }

  // Add initial tutorial puzzle: mac at left ground, cheese on right small platform, ramp
  function loadTutorial(){
    World.clear(world, false);
    objects.length = 0;
    addBounds();
    const W = canvas.width, H = canvas.height;
    // ground platform near right for cheese
    const platform = Bodies.rectangle(W - 140, H - 120, 160, 12, { isStatic:true, render:{fillStyle:'#b07a4a'}});
    World.add(world, platform);
    // ramp
    const ramp = Bodies.rectangle(W/2 - 40, H - 80, 300, 18, { isStatic:true, angle:-0.18, render:{fillStyle:'#d3b785'}});
    World.add(world, ramp);
    // Mac
    const mac = Bodies.circle(80, H - 140, DEFAULTS.mac.r, { restitution:0, friction:0.8, frictionAir:0.02, label:'mac' });
    styleBody(mac, DEFAULTS.mac);
    // Cheese
    const cheese = Bodies.rectangle(W - 140, H - 160, DEFAULTS.cheese.w, DEFAULTS.cheese.h, { isStatic:true, label:'cheese', render:{fillStyle:DEFAULTS.cheese.fill}});
    World.add(world, [mac, cheese]);
    objects.push({id: idCounter++, body:mac, meta:{type:'mac'}});
    objects.push({id: idCounter++, body:cheese, meta:{type:'cheese'}});
    // ramp and platform record
    objects.push({id:idCounter++, body:ramp, meta:{type:'plank-med', static:true}});
    objects.push({id:idCounter++, body:platform, meta:{type:'platform', static:true}});
    selectedBody = null;
    updatePropsPanel(null);
    saveState();
  }

  // Place object at canvas coords (x,y are canvas pixels and are clamped to the visible area)
  function placeObject(type, x, y){
    // clamp spawn position so items align with the visible canvas and don't spawn outside due to CSS scaling
    const pad = 12;
    x = Math.max(pad, Math.min(canvas.width - pad, x));
    y = Math.max(pad, Math.min(canvas.height - pad, y));
    const scale = 1;
    let body, meta = {type};
    if (type === 'plank-small' || type === 'plank-med'){
      const key = type === 'plank-small' ? 'plankSmall' : 'plankMed';
      const d = DEFAULTS[key];
      body = Bodies.rectangle(x, y, d.w, d.h, { density:0.002, friction:0.6 });
      styleBody(body, d);
    } else if (type === 'crate'){
      const d = DEFAULTS.crate;
      body = Bodies.rectangle(x, y, d.w, d.h, { density:0.01, friction:0.6 });
      styleBody(body, d);
    } else if (type === 'ball-bouncy'){
      const d = DEFAULTS.ballBouncy;
      body = Bodies.circle(x, y, d.r, { restitution:d.restitution, density:d.density, friction:0.02 });
      styleBody(body, d);
    } else if (type === 'ball-heavy'){
      const d = DEFAULTS.ballHeavy;
      body = Bodies.circle(x, y, d.r, { restitution:d.restitution, density:d.density, friction:0.05 });
      styleBody(body, d);
    } else if (type === 'spring'){
      const d = DEFAULTS.spring;
      body = Bodies.rectangle(x, y, d.w, d.h, { restitution:0.6, density:0.001 });
      styleBody(body, d);
    } else if (type === 'seesaw'){
      const d = DEFAULTS.seesaw;
      // create fulcrum (static) + plank dynamic with constraint
      const plank = Bodies.rectangle(x, y - 6, d.w, d.h, { density:0.001, friction:0.6 });
      styleBody(plank, d);
      const fulcrum = Bodies.rectangle(x, y + 6, 24, 12, { isStatic:true, render:{fillStyle:'#7a5b38'}});
      World.add(world, [plank, fulcrum]);
      const cons = Constraint.create({ bodyA: plank, pointB: { x:x, y:y+6 }, length:0, stiffness:1 });
      World.add(world, cons);
      objects.push({id:idCounter++, body:plank, meta:{type:'seesaw'}});
      return;
    } else if (type === 'mac'){
      const d = DEFAULTS.mac;
      body = Bodies.circle(x, y, d.r, { restitution:0, friction:0.8, frictionAir:0.02, label:'mac' });
      styleBody(body, d);
      meta.isCharacter = true;
    } else if (type === 'cheese'){
      const d = DEFAULTS.cheese;
      body = Bodies.rectangle(x, y, d.w, d.h, { isStatic:true, label:'cheese' });
      styleBody(body, d);
      meta.isGoal = true;
    } else if (type === 'rope' || type === 'fan' || type === 'balloon' || type === 'domino'){
      // simple placeholders: small dynamic objects
      body = Bodies.rectangle(x, y, 28, 12, { density:0.002 });
      styleBody(body, {fill:'#cfc'});
    } else {
      body = Bodies.rectangle(x, y, 60, 20, { density:0.002 });
      styleBody(body, {fill:'#ccc'});
    }
    if (body){
      World.add(world, body);
      objects.push({ id: idCounter++, body: body, meta: meta });
    }
  }

  // Input: palette select and place on canvas
  paletteItems.forEach(p => {
    p.addEventListener('click', ()=> {
      const t = p.dataset.type;
      // highlight selection
      document.querySelectorAll('.pal-item').forEach(n=>n.classList.remove('selected'));
      p.classList.add('selected');
      selectedType = t;
      status.textContent = `Selected ${t.replace(/[-]/g,' ')}`;
      propsPanel.style.opacity = 0.98;
      propsPanel.setAttribute('aria-hidden','false');
      selName.textContent = t;
    });
  });

  // helper: get precise canvas coordinates from pointer/touch event (uses client coordinates and accounts for CSS scaling/DPI)
  function getCanvasPos(ev){
    const rect = canvas.getBoundingClientRect();
    // support PointerEvent and TouchEvent
    const clientX = (ev.clientX != null) ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX);
    const clientY = (ev.clientY != null) ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY);
    // fallback to 0 if nothing available
    const cx = clientX || 0;
    const cy = clientY || 0;
    const x = (cx - rect.left) * (canvas.width / rect.width);
    const y = (cy - rect.top) * (canvas.height / rect.height);
    // clamp to canvas interior to avoid spawning offscreen when clicking near edges
    const pad = 12; // small padding so items don't intersect bounds immediately
    return {
      x: Math.max(pad, Math.min(canvas.width - pad, x)),
      y: Math.max(pad, Math.min(canvas.height - pad, y))
    };
  }

  // place when clicking/tapping canvas
  canvas.addEventListener('pointerdown', (ev) => {
    if (!selectedType) return;
    const pos = getCanvasPos(ev);
    placeObject(selectedType, pos.x, pos.y);
    saveState();
  });

  // Mouse constraint for dragging bodies
  const mouse = Mouse.create(canvas);
  const mConstraint = MouseConstraint.create(engine, { mouse: mouse, constraint:{ stiffness:0.2, render:{visible:false} }});
  World.add(world, mConstraint);

  // selection by clicking bodies
  Events.on(mConstraint, 'mousedown', (e) => {
    const p = e.mouse.position;
    const found = Composite.allBodies(world).find(b => Matter.Bounds.contains(b.bounds, p) && Matter.Vertices.contains(b.vertices, p));
    if (found){
      // find our tracked object
      const wrapped = objects.find(o=>o.body === found);
      if (wrapped){
        selectedBody = wrapped;
        updatePropsPanel(wrapped);
      }
    } else {
      selectedBody = null;
      updatePropsPanel(null);
    }
  });

  // Props panel handlers
  function updatePropsPanel(wrapped){
    if (!wrapped){
      propsPanel.style.opacity = 0.6;
      propsPanel.setAttribute('aria-hidden','true');
      selName.textContent = '—';
      propStatic.checked = false;
      propRot.value = 0;
      return;
    }
    selName.textContent = wrapped.meta.type || 'object';
    propStatic.checked = wrapped.body.isStatic;
    const angle = Math.round((wrapped.body.angle || 0) * 180 / Math.PI) % 360;
    propRot.value = (angle + 360) % 360;
    propsPanel.style.opacity = 0.98;
    propsPanel.setAttribute('aria-hidden','false');
  }

  propStatic.addEventListener('change', ()=> {
    if (!selectedBody) return;
    Body.setStatic(selectedBody.body, propStatic.checked);
    selectedBody.meta.static = propStatic.checked;
    saveState();
  });
  propRot.addEventListener('input', ()=> {
    if (!selectedBody) return;
    const deg = parseFloat(propRot.value);
    Body.setAngle(selectedBody.body, deg * Math.PI / 180);
    Body.setAngularVelocity(selectedBody.body, 0);
    saveState();
  });

  btnDelete.addEventListener('click', ()=> {
    if (!selectedBody) return;
    World.remove(world, selectedBody.body);
    const idx = objects.findIndex(o=>o===selectedBody);
    if (idx>=0) objects.splice(idx,1);
    selectedBody = null;
    updatePropsPanel(null);
    saveState();
  });

  btnDup.addEventListener('click', ()=> {
    if (!selectedBody) return;
    const b = selectedBody.body;
    const pos = { x: b.position.x + 30, y: b.position.y - 20 };
    const t = selectedBody.meta.type || 'dup';
    placeObject(t, pos.x, pos.y);
    saveState();
  });

  // Start/Stop/Reset/Clear
  startBtn.addEventListener('click', ()=> {
    isRunning = true;
    startBtn.disabled = true;
    // enable gravity when the round starts
    engine.gravity.y = 1;
    status.textContent = 'Running';
    startBtn.setAttribute('aria-pressed','true');
  });
  stopBtn.addEventListener('click', ()=> {
    isRunning = false;
    startBtn.disabled = false;
    // pause gravity when pausing
    engine.gravity.y = 0;
    status.textContent = 'Paused';
    startBtn.setAttribute('aria-pressed','false');
  });
  resetBtn.addEventListener('click', ()=> {
    loadTutorial();
    isRunning = false;
    startBtn.disabled = false;
    // reset keeps gravity off until player starts again
    engine.gravity.y = 0;
    status.textContent = 'Reset';
    message.style.display = 'none';
  });
  clearBtn.addEventListener('click', ()=> {
    // remove all except bounds
    World.clear(world, false);
    objects.length = 0;
    addBounds();
    selectedBody = null;
    updatePropsPanel(null);
    // keep gravity off after clearing so player can place without objects falling
    engine.gravity.y = 0;
    status.textContent = 'Cleared';
    saveState();
  });

  // Win detection (mac hits cheese)
  Events.on(engine, 'collisionStart', (ev) => {
    ev.pairs.forEach(pair => {
      const a = pair.bodyA, b = pair.bodyB;
      if ((a.label === 'mac' && b.label === 'cheese') || (b.label === 'mac' && a.label === 'cheese')){
        // trigger win
        message.textContent = 'Mac reached the cheese! 🎉';
        message.style.display = 'block';
        isRunning = false;
        startBtn.disabled = false;
        status.textContent = 'Success';
        setTimeout(()=> message.style.display='none', 3000);
      }
    });
  });

  // Simple Mac "AI" applying rightward force when running
  Events.on(runner, 'tick', ()=> {
    if (!isRunning) return;
    // find mac body
    const macObj = objects.find(o=>o.meta && o.meta.type === 'mac' || (o.body && o.body.label === 'mac'));
    const cheeseObj = objects.find(o=>(o.meta && o.meta.type === 'cheese') || (o.body && o.body.label === 'cheese'));
    if (macObj){
      // apply modest rightward force toward cheese x
      const mac = macObj.body;
      const targetX = cheeseObj ? cheeseObj.body.position.x : canvas.width - 60;
      const dir = Math.sign(targetX - mac.position.x || 1);
      // only apply if grounded-ish
      const onGround = mac.position.y >= canvas.height - 110 || mac.velocity.y < 0.5 && mac.velocity.y > -0.5;
      if (onGround){
        Body.applyForce(mac, mac.position, { x: 0.0009 * dir, y: 0 });
        // small step forward rotation reset
        Body.setAngularVelocity(mac, 0);
      }
    }
  });

  // Save/load to localStorage
  function saveState(){
    try {
      const serial = objects.map(o=>{
        const b = o.body;
        return { id:o.id, type:o.meta.type, x:b.position.x, y:b.position.y, angle:b.angle, isStatic: b.isStatic || false };
      });
      localStorage.setItem('macAndCheese_save_v1', JSON.stringify(serial));
    } catch(e){}
  }
  function loadState(){
    const raw = localStorage.getItem('macAndCheese_save_v1');
    if (!raw) return false;
    try {
      const arr = JSON.parse(raw);
      World.clear(world, false);
      objects.length = 0;
      addBounds();
      arr.forEach(it=>{
        placeObject(it.type, it.x, it.y);
        // set angle and static
        const last = objects[objects.length-1];
        if (last){
          Body.setAngle(last.body, it.angle || 0);
          if (it.isStatic) Body.setStatic(last.body, true);
        }
      });
      return true;
    } catch(e){ return false; }
  }

  // Setup initial scene
  addBounds();
  if (!loadState()) loadTutorial();
  resizeCanvas();

  // Save on unload
  window.addEventListener('beforeunload', ()=> saveState());
  window.addEventListener('resize', ()=> { resizeCanvas(); Render.lookAt(render, {min:{x:0,y:0}, max:{x:canvas.width,y:canvas.height}}); });

  // Basic accessibility: keyboard palette navigation
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape'){ selectedType = null; document.querySelectorAll('.pal-item').forEach(n=>n.classList.remove('selected')); status.textContent='Ready'; }
  });

  // Small UI polish: hide message after a while
  setInterval(()=> {
    // throttle saving occasionally
    saveState();
  }, 5000);

})();