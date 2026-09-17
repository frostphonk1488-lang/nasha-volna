const memories = [
  {title:"Ты и я",date:"09.04.2021",desc:"Наша история продолжается…",video:"videos/01.mp4",photo:"photos/01.jpg",hue:10},
  {title:"Как мы познакомились",date:"Апрель 2021",desc:"С этого всё началось.",video:"videos/02.mp4",photo:"photos/02.jpg",hue:335},
  {title:"Наше первое свидание",date:"2021",desc:"Волнение, улыбки, ты.",video:"videos/03.mp4",photo:"photos/03.jpg",hue:25},
  {title:"Зимние прогулки",date:"Зима",desc:"Ты и я, и этот снег.",video:"videos/04.mp4",photo:"photos/04.jpg",hue:205},
  {title:"Поездка в Питер",date:"2022",desc:"Лучшее путешествие.",video:"videos/05.mp4",photo:"photos/05.jpg",hue:285},
  {title:"Тот самый вечер",date:"2023",desc:"Когда всё стало по-другому.",video:"videos/06.mp4",photo:"photos/06.jpg",hue:350},
  {title:"Спасибо, что ты есть",date:"2024",desc:"Видео только для тебя.",video:"videos/07.mp4",photo:"photos/07.jpg",hue:40},
  {title:"Впереди ещё столько всего",date:"Сегодня",desc:"Это только начало…",video:"videos/08.mp4",photo:"photos/08.jpg",hue:15}
];

function init() {
  const $ = id => document.getElementById(id);
  const orbit = $("memoryOrbit");
  const mobileItems = $("mobileItems");
  const video = $("video");
  const canvas = $("waveCanvas");
  if (!orbit || !mobileItems || !canvas) return;

  let active = -1;
  let watched = [];
  try { watched = JSON.parse(localStorage.getItem("nashaVolnaWatched") || "[]"); } catch(e) { watched = []; }
  let hue = 12, targetHue = 12, waveT = 0;

  function makeImg(src, i) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.onerror = () => {
      img.style.background = `radial-gradient(circle at 35% 30%, hsl(${(i*43)%360} 70% 42%), hsl(${(i*43+45)%360} 45% 12%))`;
      img.removeAttribute("src");
    };
    return img;
  }

  function render() {
    orbit.innerHTML = "";
    mobileItems.innerHTML = "";
    memories.forEach((m, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "memory" + (watched.includes(i) ? " watched" : "");
      b.title = m.title;
      b.setAttribute("aria-label", `${i+1}. ${m.title}`);
      b.append(makeImg(m.photo, i));
      const n = document.createElement("span");
      n.className = "number";
      n.textContent = i + 1;
      b.append(n);
      if (watched.includes(i)) {
        const d = document.createElement("span");
        d.className = "dot";
        b.append(d);
      }
      b.onclick = () => openMemory(i);
      orbit.append(b);

      const row = document.createElement("div");
      row.className = "mobile-item";
      row.append(makeImg(m.photo, i));
      const text = document.createElement("div");
      text.innerHTML = `<strong>${m.title}</strong><small>${m.date} · ${m.desc}</small>`;
      row.append(text);
      if (watched.includes(i)) {
        const c = document.createElement("span");
        c.className = "check";
        c.textContent = "✓";
        row.append(c);
      }
      row.onclick = () => openMemory(i);
      mobileItems.append(row);
    });
    const count = $("countLabel");
    if (count) count.textContent = `${memories.length} видео`;
  }

  function openMemory(i) {
    active = i;
    const m = memories[i];
    targetHue = m.hue;
    $("playerTitle").textContent = m.title;
    $("playerDate").textContent = m.date;
    $("playerDescription").textContent = m.desc;
    $("playerPanel").classList.add("open");
    $("playerPanel").setAttribute("aria-hidden", "false");
    document.querySelectorAll(".memory").forEach((el,k) => el.classList.toggle("active", k === i));
    video.src = m.video;
    video.load();
    video.play().catch(() => {});
  }

  function closePlayer() {
    $("playerPanel").classList.remove("open");
    $("playerPanel").setAttribute("aria-hidden", "true");
    video.pause();
    document.querySelectorAll(".memory").forEach(x => x.classList.remove("active"));
    active = -1;
  }

  function markWatched(i) {
    if (!watched.includes(i)) {
      watched.push(i);
      try { localStorage.setItem("nashaVolnaWatched", JSON.stringify(watched)); } catch(e) {}
      render();
    }
    if (watched.length === memories.length) setTimeout(showSecret, 900);
  }

  function showSecret() {
    const secret = $("secret");
    if (!secret) return;
    secret.classList.add("show");
    secret.setAttribute("aria-hidden", "false");
    updateCounter();
  }

  function updateCounter() {
    const start = new Date("2021-04-09T00:00:00");
    const ms = Math.max(0, Date.now() - start.getTime());
    $("days").textContent = Math.floor(ms / 864e5).toLocaleString("ru-RU");
    $("hours").textContent = Math.floor(ms / 36e5).toLocaleString("ru-RU");
    $("minutes").textContent = Math.floor(ms / 6e4).toLocaleString("ru-RU");
  }

  function fmt(s) {
    s = Math.floor(s || 0);
    return String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0");
  }

  $("closePlayer").onclick = closePlayer;
  $("hint").onclick = () => openMemory(0);
  $("playBtn").onclick = () => video.paused ? video.play() : video.pause();
  video.addEventListener("play", () => $("playBtn").textContent = "Ⅱ");
  video.addEventListener("pause", () => $("playBtn").textContent = "▶");
  video.addEventListener("timeupdate", () => {
    const p = video.duration ? video.currentTime / video.duration : 0;
    $("progressBar").style.width = p * 100 + "%";
    $("playerTime").textContent = fmt(video.currentTime);
    $("playerDuration").textContent = fmt(video.duration);
    if (p >= .97 && active >= 0) markWatched(active);
  });
  video.addEventListener("ended", () => active >= 0 && markWatched(active));
  video.addEventListener("error", () => {
    const f = $("videoFallback");
    if (f) f.style.display = "grid";
  });

  updateCounter();
  setInterval(updateCounter, 30000);
  render();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * d));
    canvas.height = Math.max(1, Math.round(r.height * d));
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  window.addEventListener("resize", resize, {passive:true});
  resize();

  function drawWave() {
    const r = canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (!w || !h) { requestAnimationFrame(drawWave); return; }
    ctx.clearRect(0, 0, w, h);
    waveT += 0.008;
    hue += (targetHue - hue) * 0.018;
    const mobile = w < 901;
    const centerX = w * 0.5;
    const amp = Math.min(w * (mobile ? 0.36 : 0.30), mobile ? 150 : 430);

    for (let layer = 0; layer < 7; layer++) {
      ctx.beginPath();
      for (let y = -20; y <= h + 20; y += 3) {
        const yy = y / h;
        const drift = Math.sin(yy*7.5 + waveT*.75 + layer*.45) * w * (mobile ? .025 : .035);
        const main = Math.sin(yy*9.2 - waveT*(1.05 + layer*.025)) * amp;
        const detail = Math.sin(yy*22 + waveT*1.3 + layer) * w * (mobile ? .012 : .018);
        const x = centerX + main + drift + detail;
        if (y === -20) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.lineWidth = layer === 0 ? 2.8 : layer < 3 ? 1.8 : 1;
      ctx.shadowBlur = layer === 0 ? 34 : layer < 3 ? 18 : 8;
      ctx.shadowColor = `hsla(${hue},95%,70%,${layer === 0 ? .72 : .32})`;
      ctx.strokeStyle = `hsla(${hue},92%,${layer < 2 ? 72 : 68}%,${layer === 0 ? .62 : layer < 3 ? .28 : .13})`;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(drawWave);
  }
  drawWave();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {once:true});
} else {
  init();
}
