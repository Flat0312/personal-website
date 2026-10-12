const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- 普通板块的滚动浮现 ---- */
const revealItems = document.querySelectorAll('.reveal');

if (reducedMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      // 使用 RAF 确保流畅
      requestAnimationFrame(() => {
        entry.target.classList.add('visible');
      });
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.15,  // 提高到15%避免过早触发
    rootMargin: '-50px 0px'  // 添加边距精确控制触发时机
  });

  revealItems.forEach((item) => observer.observe(item));
}

/* ---- 文本拆分：中文按字、西文按词（逐词亮起与词级 hover 共用） ---- */
function splitTextNode(textNode, className, collector) {
  const frag = document.createDocumentFragment();
  textNode.textContent.split(/(\s+)/).forEach((token) => {
    if (!token) return;
    // 空格也拆成单元：扫过时字与字之间的空白同样亮起，形成连续色带
    if (/^\s+$/.test(token)) {
      const space = document.createElement('span');
      space.className = className;
      space.textContent = ' ';
      if (collector) collector.push(space);
      frag.appendChild(space);
      return;
    }
    // 中文没有空格：连续 CJK 串按单字拆分，英文/数字保持整词
    const parts = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(token) ? [...token] : [token];
    parts.forEach((part) => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = part;
      if (collector) collector.push(span);
      frag.appendChild(span);
    });
  });
  textNode.replaceWith(frag);
}

/* ---- 引言逐词亮起：跟滚动进度联动，mark 整块高亮扫入 ---- */
const wordGroups = [];

document.querySelectorAll('.reveal-words').forEach((node) => {
  const units = [];

  const walk = (parent) => {
    [...parent.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        splitTextNode(child, 'w', units);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'MARK') {
          child.classList.add('w');
          units.push(child);
        } else {
          walk(child);
        }
      }
    });
  };

  walk(node);

  if (reducedMotion) {
    units.forEach((unit) => unit.classList.add('on'));
    return;
  }
  wordGroups.push({ node, units, onCount: 0 });
});

/* ---- 全站词级 hover：链接/按钮等自身已有反色效果的元素跳过 ----
   注意：先把元素收集成数组再拆分。边遍历 TreeWalker 边改 DOM 会让
   nextNode() 的指针无法前进，陷入死循环卡死主线程。
   性能优化：移动端跳过文本拆分（hover 效果不适用） */

// 移动端跳过文本拆分以提升性能
if (window.innerWidth > 860) {
  const hoverSkipSelector = 'a, button, header, .skip-link, .scroll-tracker, .toast, .mobile-menu, .reveal-words, .row-links, [data-scramble]';
  const hoverWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (el) => (el.closest(hoverSkipSelector) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });

  const hoverTargets = [];
  let hoverEl;
  while ((hoverEl = hoverWalker.nextNode())) hoverTargets.push(hoverEl);

  hoverTargets.forEach((el) => {
    [...el.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        splitTextNode(child, 'h', null);
      }
    });
  });
}

/* ---- 轨迹残影：扫过的字/词点亮，约 0.3s 后熄灭，由 CSS 过渡延迟完成衰减。
   衰减顺序天然等于扫过顺序（每个单元的计时从被扫到那一刻起算）。
   事件委托：整页只挂一个 mouseover，不给上千个 span 单独绑事件。 ---- */
const LIT_MS = 300;

document.addEventListener('mouseover', (event) => {
  const unit = event.target.closest('.h, .w');
  if (!unit) return;
  unit.classList.add('lit');
  clearTimeout(unit._litTimer);
  unit._litTimer = setTimeout(() => unit.classList.remove('lit'), LIT_MS);
});

function updateWordGroups() {
  const viewportH = window.innerHeight;

  wordGroups.forEach((group) => {
    const rect = group.node.getBoundingClientRect();
    const total = group.units.length;
    const startLine = viewportH * 0.85;
    const distance = rect.height + viewportH * 0.25;
    const progress = Math.min(Math.max((startLine - rect.top) / distance, 0), 1);
    const count = Math.round(progress * total);

    if (count === group.onCount) return;
    if (count > group.onCount) {
      for (let i = group.onCount; i < count; i += 1) group.units[i].classList.add('on');
    } else {
      for (let i = count; i < group.onCount; i += 1) group.units[i].classList.remove('on');
    }
    group.onCount = count;
  });
}

/* ---- 编号/标题乱码解码：进入视口时字符从随机符号逐位还原 ---- */
const SCRAMBLE_GLYPHS = '01▮▯/\\|<>+-*#×%—';

function scrambleIn(el, duration = 650) {
  const original = el.dataset.original || el.textContent;
  el.dataset.original = original;
  const chars = [...original];
  const start = performance.now();

  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const revealCount = Math.floor(p * chars.length);
    el.textContent = chars.map((c, i) => {
      if (i < revealCount || c === ' ' || c === '●' || c === '/') return c;
      return SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
    }).join('');
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = original;
    }
  }
  requestAnimationFrame(frame);
}

const scrambleEls = document.querySelectorAll('[data-scramble]');
if (reducedMotion || !('IntersectionObserver' in window)) {
  // 直接显示原文，不做动效
} else {
  const scrambleObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      scrambleIn(entry.target);
      scrambleObserver.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  scrambleEls.forEach((el) => scrambleObserver.observe(el));
}

/* ---- 导航字标 / 左下角追踪卡片 ---- */
const tracker = document.getElementById('scrollTracker');
const trackedSections = [...document.querySelectorAll('[data-track]')];
const heroMarquee = document.querySelector('.hero .marquee');
const footerMark = document.querySelector('.footer-mark');
let currentTrack = '';

function updateChrome() {
  // === 读取阶段 - 批量收集所有布局信息 ===
  const reads = {
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    footerRect: footerMark?.getBoundingClientRect(),
    sectionRects: trackedSections.map(s => ({
      element: s,
      rect: s.getBoundingClientRect(),
      track: s.dataset.track,
      tone: s.dataset.tone
    }))
  };

  const vh = reads.viewportHeight;

  // === 写入阶段 - 批量更新 DOM ===
  // Body 状态
  document.body.classList.toggle('scrolled', reads.scrollY > vh * 0.55);
  tracker?.classList.toggle('show', reads.scrollY > vh * 0.8);

  // 跑马灯随首屏滚动淡出
  if (heroMarquee) {
    const fade = Math.min(Math.max(reads.scrollY / (vh * 0.85), 0), 1);
    heroMarquee.style.setProperty('--fade', fade.toFixed(3));
  }

  // 页脚巨型字标拖尾进度
  if (footerMark && reads.footerRect) {
    const p = Math.min(Math.max((vh - reads.footerRect.top) / (vh + reads.footerRect.height), 0), 1);
    footerMark.style.setProperty('--trail', p.toFixed(3));
  }

  // 区块追踪
  let active = null;
  for (const {element, rect, track, tone} of reads.sectionRects) {
    if (rect.top <= vh * 0.45) {
      active = {element, track, tone};
    }
  }

  if (!active || !tracker || active.track === currentTrack) return;
  currentTrack = active.track;
  const [no, ...rest] = currentTrack.split('/');
  tracker.querySelector('.tracker-no').textContent = no.trim();
  tracker.querySelector('.tracker-label').textContent = '/ ' + rest.join('/').trim();
  const screenNo = tracker.querySelector('.tracker-screen-no');
  if (screenNo) {
    const digits = currentTrack.match(/\d{3}/);
    screenNo.textContent = digits ? digits[0] : '000';
  }
  tracker.classList.remove('tone-grey', 'tone-dark', 'tone-blue');
  tracker.classList.add('tone-' + (active.tone || 'grey'));
}

let ticking = false;

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    updateWordGroups();
    updateChrome();
    ticking = false;
  });
}

if (!reducedMotion) {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}
updateWordGroups();
updateChrome();

/* ---- 复制邮箱 + Toast ---- */
const toast = document.querySelector('#toast');
let toastTimer;

async function copyEmail(button) {
  const email = button.dataset.email;
  try {
    await navigator.clipboard.writeText(email);
    toast.textContent = '邮箱已复制';
  } catch {
    toast.textContent = email;
  }
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

document.querySelector('#copyEmail')?.addEventListener('click', (event) => copyEmail(event.currentTarget));

/* ---- 年份 ---- */
document.querySelector('#currentYear').textContent = new Date().getFullYear();

/* ---- 移动端菜单 ---- */
const menuToggle = document.querySelector('#menuToggle');
const mobileMenu = document.querySelector('#mobileMenu');
const menuBackdrop = document.getElementById('menuBackdrop');

// 焦点陷阱
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleTab = (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey && document.activeElement === firstElement) {
      lastElement.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      firstElement.focus();
      e.preventDefault();
    }
  };

  element.addEventListener('keydown', handleTab);
  return () => element.removeEventListener('keydown', handleTab);
}

let cleanupFocusTrap = null;

function setMenu(open) {
  menuToggle?.classList.toggle('open', open);
  mobileMenu?.classList.toggle('open', open);
  menuToggle?.setAttribute('aria-expanded', String(open));
  menuToggle?.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  mobileMenu?.setAttribute('aria-hidden', String(!open));
  menuBackdrop?.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('menu-open', open);
  document.body.style.overflow = open ? 'hidden' : '';

  // 焦点管理
  if (open && mobileMenu) {
    cleanupFocusTrap = trapFocus(mobileMenu);
    setTimeout(() => {
      const firstLink = mobileMenu.querySelector('a');
      firstLink?.focus();
    }, 100); // 等待动画完成
  } else if (cleanupFocusTrap) {
    cleanupFocusTrap();
    cleanupFocusTrap = null;
  }
}

menuToggle?.addEventListener('click', () => {
  setMenu(!menuToggle.classList.contains('open'));
});

menuBackdrop?.addEventListener('click', () => setMenu(false));

mobileMenu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMenu(false));
});

// 触摸手势关闭菜单
let touchStartX = 0;
let touchEndX = 0;

mobileMenu?.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

mobileMenu?.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  if (touchStartX - touchEndX > 100) { // 向左滑动超过100px
    setMenu(false);
  }
}, { passive: true });

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMenu(false);
});

/* ---- 页面可见性控制 CRT 动画 ---- */
document.addEventListener('visibilitychange', () => {
  const crtBand = document.querySelector('.crt-band');
  const crtNoise = document.querySelector('.crt-noise');

  if (document.hidden) {
    crtBand?.style.setProperty('animation-play-state', 'paused');
    crtNoise?.style.setProperty('animation-play-state', 'paused');
  } else {
    crtBand?.style.setProperty('animation-play-state', 'running');
    crtNoise?.style.setProperty('animation-play-state', 'running');
  }
});
