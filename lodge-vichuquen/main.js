(function () {
  "use strict";

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }
  function qs(sel, ctx)  { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function boot() {
    safe(initSplash,                "splash");
    safe(initNav,                   "nav");
    safe(initMobileMenu,            "mobileMenu");
    safe(initHero,                  "hero");
    safe(initCarousels,             "carousels");
    safe(initGalleryCarousel,       "galleryCarousel");
    safe(initGruposCoverflow,       "gruposCoverflow");
    safe(initCabanasMobileCarousel, "cabanasMobileCarousel");
    safe(initExtras,                "extras");
    safe(initReveals,               "reveals");
    safe(initCounters,              "counters");
    safe(initTyC,                   "tyc");
    safe(initCabanaLinks,           "cabanaLinks");
  }

  /* ── SPLASH ─────────────────────────────────────────────── */
  function initSplash() {
    var splash = qs("[data-splash]");
    if (!splash) return;
    var hide = function () { splash.classList.add("is-out"); };
    if (document.readyState === "complete") setTimeout(hide, 700);
    else window.addEventListener("load", function () { setTimeout(hide, 500); });
    setTimeout(hide, 3800);
  }

  /* ── NAV ─────────────────────────────────────────────────── */
  function initNav() {
    var nav = qs(".nav");
    if (!nav) return;

    function onScroll() { nav.classList.toggle("is-scrolled", window.scrollY > 60); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id === "#") return;
      var target = qs(id);
      if (!target) return;
      e.preventDefault();
      var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 80,
        behavior: reduced ? "auto" : "smooth"
      });
      var mm = qs(".mobile-menu");
      var burger = qs(".nav-burger");
      if (mm) { mm.classList.remove("is-open"); }
      if (burger) { burger.classList.remove("is-open"); burger.setAttribute("aria-expanded","false"); }
    });
  }

  /* ── MOBILE MENU ─────────────────────────────────────────── */
  function initMobileMenu() {
    var burger = qs(".nav-burger");
    var menu   = qs("#mobileMenu");
    if (!burger || !menu) return;
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
  }

  /* ── HERO ─────────────────────────────────────────────────── */
  function initHero() {
    var hero = qs(".hero");
    var img  = qs(".hero-img");
    if (!hero || !img) return;
    if (img.complete) hero.classList.add("is-loaded");
    else img.addEventListener("load", function () { hero.classList.add("is-loaded"); });

    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      gsap.to(img, {
        yPercent: 20, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
      });
    }
  }

  /* ── EXTRAS EXPANDIBLES ─────────────────────────────────────── */
  function initExtras() {
    qsa("[data-extras-toggle]").forEach(function (btn) {
      var panel = btn.previousElementSibling;
      if (!panel || !panel.hasAttribute("data-extras")) return;
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        if (open) {
          panel.setAttribute("hidden", "");
        } else {
          panel.removeAttribute("hidden");
        }
      });
    });
  }

  /* ── CARRUSELES ─────────────────────────────────────────────── */
  function initCarousels() {
    var carousels = qsa("[data-carousel]");
    if (!carousels.length) return;

    carousels.forEach(function (carousel) {
      var slides    = qs(".cabana-slides", carousel);
      var dotsWrap  = qs(".carousel-dots", carousel);
      var btnPrev   = qs(".carousel-prev", carousel);
      var btnNext   = qs(".carousel-next", carousel);
      var slideEls  = qsa(".cabana-slide", carousel);
      var total     = slideEls.length;
      if (!slides || total < 2) return;

      // Build dots
      for (var i = 0; i < total; i++) {
        var dot = document.createElement("button");
        dot.className = "carousel-dot" + (i === 0 ? " is-active" : "");
        dot.setAttribute("aria-label", "Foto " + (i + 1));
        dot.dataset.idx = i;
        dotsWrap.appendChild(dot);
      }
      var dots = qsa(".carousel-dot", dotsWrap);

      function goTo(idx) {
        slides.scrollTo({ left: idx * slides.offsetWidth, behavior: "smooth" });
      }

      function updateState() {
        var idx = Math.round(slides.scrollLeft / slides.offsetWidth);
        dots.forEach(function (d, i) { d.classList.toggle("is-active", i === idx); });
        if (btnPrev) btnPrev.disabled = idx === 0;
        if (btnNext) btnNext.disabled = idx === total - 1;
      }

      // Buttons
      if (btnPrev) {
        btnPrev.disabled = true;
        btnPrev.addEventListener("click", function (e) {
          e.stopPropagation();
          var idx = Math.round(slides.scrollLeft / slides.offsetWidth);
          if (idx > 0) goTo(idx - 1);
        });
      }
      if (btnNext) {
        btnNext.addEventListener("click", function (e) {
          e.stopPropagation();
          var idx = Math.round(slides.scrollLeft / slides.offsetWidth);
          if (idx < total - 1) goTo(idx + 1);
        });
      }

      // Dot clicks
      dots.forEach(function (dot) {
        dot.addEventListener("click", function (e) {
          e.stopPropagation();
          goTo(parseInt(dot.dataset.idx, 10));
        });
      });

      // Sync on scroll (handles both mouse drag and touch swipe)
      var scrollTimer;
      slides.addEventListener("scroll", function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateState, 60);
      }, { passive: true });

      updateState();
    });
  }

  /* ── REVEALS ─────────────────────────────────────────────── */
  function initReveals() {
    var items = qsa(".reveal");
    if (!items.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.04, rootMargin: "0px 0px -4% 0px" });

    items.forEach(function (el) { io.observe(el); });

    // Safety net: reveal anything still hidden at 6s
    setTimeout(function () {
      qsa(".reveal:not(.is-visible)").forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("is-visible");
        }
      });
    }, 6000);

    // GSAP stagger for grids
    if (window.gsap && window.ScrollTrigger) {
      [".cabanas-grid", ".exp-grid"].forEach(function (sel) {
        var parent = qs(sel);
        if (!parent) return;
        var children = qsa(":scope > *", parent);
        if (!children.length) return;
        children.forEach(function (c) {
          c.style.opacity = "0";
          c.style.transform = "translateY(22px)";
        });
        ScrollTrigger.create({
          trigger: parent, start: "top 88%", once: true,
          onEnter: function () {
            gsap.to(children, { opacity: 1, y: 0, duration: 0.55, stagger: 0.06, ease: "power2.out" });
          }
        });
      });
    }
  }

  /* ── COUNTERS ─────────────────────────────────────────────── */
  function initCounters() {
    var nums = qsa("[data-count]");
    if (!nums.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var el     = e.target;
        var target = parseInt(el.getAttribute("data-count"), 10);
        var start  = null;
        var dur    = 1200;
        function step(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var ease = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * ease);
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = target;
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* ── CARRUSEL GALERÍA ────────────────────────────────────── */
  function initGalleryCarousel() {
    var carousel = document.getElementById("galCarousel");
    if (!carousel) return;

    var track   = document.getElementById("galTrack");
    var counter = document.getElementById("galCounter");
    var btnPrev = document.getElementById("galPrev");
    var btnNext = document.getElementById("galNext");
    var thumbs  = qsa(".gal-thumb", carousel);
    var total   = qsa(".gal-slide", carousel).length;
    var current = 0;
    var autoTimer = null;

    function goTo(idx) {
      idx = Math.max(0, Math.min(idx, total - 1));
      current = idx;
      track.style.transform = "translateX(-" + (idx * 100) + "%)";
      if (counter) counter.textContent = (idx + 1) + " / " + total;
      if (btnPrev) btnPrev.disabled = idx === 0;
      if (btnNext) btnNext.disabled = idx === total - 1;
      thumbs.forEach(function (t, i) { t.classList.toggle("is-active", i === idx); });
      var active = thumbs[idx];
      if (active && active.parentElement) {
        var p = active.parentElement;
        p.scrollTo({ left: active.offsetLeft - p.offsetWidth / 2 + active.offsetWidth / 2, behavior: "smooth" });
      }
    }

    function startAuto() {
      stopAuto();
      autoTimer = setInterval(function () { goTo(current + 1 >= total ? 0 : current + 1); }, 5000);
    }
    function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

    if (btnPrev) btnPrev.addEventListener("click", function () { stopAuto(); goTo(current - 1); });
    if (btnNext) btnNext.addEventListener("click", function () { stopAuto(); goTo(current + 1); });
    thumbs.forEach(function (t, i) { t.addEventListener("click", function () { stopAuto(); goTo(i); }); });

    // Swipe touch
    var stage = qs(".gal-stage", carousel);
    var tx = 0;
    if (stage) {
      stage.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; stopAuto(); }, { passive: true });
      stage.addEventListener("touchend",   function (e) {
        var diff = tx - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 45) goTo(diff > 0 ? current + 1 : current - 1);
      }, { passive: true });
    }

    // Pausa en hover
    carousel.addEventListener("mouseenter", stopAuto);
    carousel.addEventListener("mouseleave", startAuto);

    goTo(0);
    startAuto();
  }

  /* ── PRESELECCIÓN DE CABAÑA DESDE TARJETA ───────────────── */
  function initCabanaLinks() {
    var cabMap = {
      c1: 'c1-tagua',
      c2: 'c2-cisne-coscoroba',
      c3: 'c3-siete-colores',
      c4: 'c4-cisne-cuello-negro',
      c5: 'c5-huala',
      c6: 'c6-run-run',
      c7: 'c7-pitio'
    };
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-cabana');
      if (!btn) return;
      var article = btn.closest('article[id]');
      if (!article) return;
      var cabId = cabMap[article.id];
      if (!cabId) return;
      var sel = document.getElementById('bwCabana');
      if (!sel) return;
      sel.value = cabId;
      sel.dispatchEvent(new Event('change'));
    });
  }

  /* ── MODAL TÉRMINOS Y CONDICIONES ────────────────────────── */
  function initTyC() {
    var modal    = document.getElementById("tycModal");
    var overlay  = document.getElementById("tycOverlay");
    var closeBtn = document.getElementById("tycCloseBtn");
    var openBtn  = document.getElementById("bwVerTyC");
    var aceptar  = document.getElementById("tycAceptarBtn");
    var checkbox = document.getElementById("bwAceptaTyC");
    if (!modal) return;

    function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }
    function closeModal() { modal.hidden = true; document.body.style.overflow = ""; }

    if (openBtn)  openBtn.addEventListener("click",  openModal);
    if (overlay)  overlay.addEventListener("click",  closeModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (aceptar)  aceptar.addEventListener("click",  function () {
      if (checkbox) checkbox.checked = true;
      closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
  }

  /* ── CABAÑAS — CARRUSEL MOBILE + FULLSCREEN ─────────────────── */
  function initCabanasMobileCarousel() {
    if (window.innerWidth > 640) return;

    var grid    = qs('.cabanas-grid');
    var cards   = qsa('.cabana-card');
    if (!grid || !cards.length) return;

    // Contador "1 / 8" bajo el carrusel
    var counter = document.createElement('p');
    counter.className = 'cabanas-counter';
    grid.parentNode.insertBefore(counter, grid.nextSibling);

    function updateCounter() {
      var idx = Math.round(grid.scrollLeft / grid.offsetWidth) + 1;
      counter.textContent = idx + ' / ' + cards.length;
    }
    grid.addEventListener('scroll', function() { updateCounter(); }, { passive: true });
    updateCounter();

    // ── Lightbox (solo imagen) ──────────────────────────────────
    var lightbox = null;
    var lbImgs   = [];
    var lbIdx    = 0;

    function getLightbox() {
      if (lightbox) return lightbox;
      var lb = document.createElement('div');
      lb.className = 'cabana-lightbox';
      lb.innerHTML =
        '<button class="cabana-lb-close" aria-label="Cerrar">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<button class="cabana-lb-prev" aria-label="Foto anterior">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<img class="cabana-lb-img" />' +
        '<button class="cabana-lb-next" aria-label="Foto siguiente">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
        '<div class="cabana-lb-counter"></div>';

      lb.querySelector('.cabana-lb-close').addEventListener('click', closeLightbox);
      lb.querySelector('.cabana-lb-prev').addEventListener('click', function(e) {
        e.stopPropagation(); goLightbox(lbIdx - 1);
      });
      lb.querySelector('.cabana-lb-next').addEventListener('click', function(e) {
        e.stopPropagation(); goLightbox(lbIdx + 1);
      });
      lb.addEventListener('click', function(e) { if (e.target === lb) closeLightbox(); });

      // Swipe táctil
      var tsX = 0;
      lb.addEventListener('touchstart', function(e) { tsX = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', function(e) {
        var dx = e.changedTouches[0].clientX - tsX;
        if (Math.abs(dx) > 50) goLightbox(dx > 0 ? lbIdx - 1 : lbIdx + 1);
      }, { passive: true });

      document.body.appendChild(lb);
      lightbox = lb;
      return lb;
    }

    function openLightbox(card, startIdx) {
      var imgs = qsa('.cabana-slide img', card);
      lbImgs = Array.prototype.map.call(imgs, function(img) { return img.src; });
      lbIdx = startIdx || 0;
      getLightbox();
      lightbox.classList.add('is-open');
      document.body.classList.add('cabana-fs-open');
      renderLightbox();
    }

    function renderLightbox() {
      lightbox.querySelector('.cabana-lb-img').src = lbImgs[lbIdx];
      lightbox.querySelector('.cabana-lb-counter').textContent = (lbIdx + 1) + ' / ' + lbImgs.length;
    }

    function goLightbox(idx) {
      lbIdx = ((idx % lbImgs.length) + lbImgs.length) % lbImgs.length;
      renderLightbox();
    }

    function closeLightbox() {
      if (lightbox) lightbox.classList.remove('is-open');
      document.body.classList.remove('cabana-fs-open');
    }

    cards.forEach(function(card) {
      var carouselEl = qs('.cabana-carousel', card);
      if (carouselEl) {
        carouselEl.addEventListener('click', function(e) {
          if (e.target.closest('.carousel-btn')) return;
          var slidesEl = qs('.cabana-slides', card);
          var slideIdx = slidesEl ? Math.round(slidesEl.scrollLeft / slidesEl.offsetWidth) : 0;
          openLightbox(card, slideIdx);
        });
      }
    });

    // Cerrar con Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && lightbox && lightbox.classList.contains('is-open')) closeLightbox();
    });
  }

  /* ── GRUPOS Y EVENTOS — COVERFLOW 3D ────────────────────────── */
  function initGruposCoverflow() {
    var wrapper = qs('#gruposCoverflow');
    if (!wrapper) return;

    var slides   = qsa('.coverflow-slide', wrapper);
    var dotsWrap = qs('#gruposDots');
    var total    = slides.length;
    if (total === 0) return;

    var current = 0;
    var autoTimer = null;

    // Posiciones relativas según distancia al centro
    var POSITIONS = [
      { x: 0,    rotY: 0,   scale: 1,    opacity: 1,    z: 10 },
      { x: 290,  rotY: -42, scale: 0.80, opacity: 0.85, z: 9  },
      { x: -290, rotY:  42, scale: 0.80, opacity: 0.85, z: 9  },
      { x: 490,  rotY: -52, scale: 0.65, opacity: 0.5,  z: 8  },
      { x: -490, rotY:  52, scale: 0.65, opacity: 0.5,  z: 8  }
    ];

    function applyPositions() {
      slides.forEach(function(slide, i) {
        var offset = i - current;
        // Ajustar para loop circular
        if (offset > total / 2)  offset -= total;
        if (offset < -total / 2) offset += total;

        var absOff = Math.abs(offset);
        var sign   = offset >= 0 ? 1 : -1;

        var pos;
        if (absOff === 0) {
          pos = POSITIONS[0];
        } else if (absOff === 1) {
          pos = offset > 0 ? POSITIONS[1] : POSITIONS[2];
        } else if (absOff === 2) {
          pos = offset > 0 ? POSITIONS[3] : POSITIONS[4];
        } else {
          // Ocultar slides muy lejanos
          slide.style.opacity = '0';
          slide.style.zIndex  = '1';
          slide.style.transform = 'translateX(calc(-50% + ' + (sign * 700) + 'px)) translateY(-50%) rotateY(' + (-sign * 55) + 'deg) scale(0.5)';
          slide.classList.remove('is-active');
          return;
        }

        slide.style.transform = 'translateX(calc(-50% + ' + pos.x + 'px)) translateY(-50%) rotateY(' + pos.rotY + 'deg) scale(' + pos.scale + ')';
        slide.style.opacity   = pos.opacity;
        slide.style.zIndex    = pos.z;
        slide.classList.toggle('is-active', absOff === 0);
      });

      // Dots
      qsa('.coverflow-dot', dotsWrap).forEach(function(d, i) {
        d.classList.toggle('is-active', i === current);
      });
    }

    function goTo(idx) {
      current = ((idx % total) + total) % total;
      applyPositions();
    }
    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    // Crear dots
    slides.forEach(function(_, i) {
      var dot = document.createElement('button');
      dot.className = 'coverflow-dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Foto ' + (i + 1));
      dot.addEventListener('click', function() { goTo(i); resetAuto(); });
      dotsWrap.appendChild(dot);
    });

    // Botones
    var btnPrev = qs('.coverflow-prev', wrapper);
    var btnNext = qs('.coverflow-next', wrapper);
    if (btnPrev) btnPrev.addEventListener('click', function() { prev(); resetAuto(); });
    if (btnNext) btnNext.addEventListener('click', function() { next(); resetAuto(); });

    // Clic en slide lateral → ir a ese slide
    slides.forEach(function(slide, i) {
      slide.addEventListener('click', function() {
        if (i !== current) { goTo(i); resetAuto(); }
      });
    });

    // Teclado
    wrapper.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowLeft')  { prev(); resetAuto(); }
      if (e.key === 'ArrowRight') { next(); resetAuto(); }
    });

    // Touch / swipe
    var touchStartX = 0;
    wrapper.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrapper.addEventListener('touchend', function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); resetAuto(); }
    });

    // Autoplay
    function startAuto() { autoTimer = setInterval(next, 4000); }
    function resetAuto()  { clearInterval(autoTimer); startAuto(); }

    applyPositions();
    startAuto();
  }

})();;
