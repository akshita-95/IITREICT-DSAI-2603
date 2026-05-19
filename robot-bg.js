(function () {
  if ('ontouchstart' in window) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'robot-bg-canvas';
  document.body.insertBefore(canvas, document.body.firstChild);

  canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:0.8;';
  const ctx = canvas.getContext('2d');

  const colors = ['#4F8EFF', '#00D4AA', '#9B7FFF'];
  const N = 38;
  const particles = [];

  function initParticles() {
    particles.length = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < N; i++) {
      const speed = 0.1 + Math.random() * 0.2;
      const ang = Math.random() * Math.PI * 2;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: 1.5 + Math.random() * 1.5,
        opacity: 0.2 + Math.random() * 0.3,
        color: colors[i % colors.length],
      });
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initParticles();
  }
  resize();
  window.addEventListener('resize', resize);

  function drawNetwork() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxD = 110;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxD) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(79,142,255,0.07)';
          ctx.lineWidth = 0.5;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  let t = 0;
  let hidden = false;
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
  });

  function animate() {
    if (hidden) {
      requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    t += 0.016;

    drawNetwork();
    requestAnimationFrame(animate);
  }
  animate();
})();

