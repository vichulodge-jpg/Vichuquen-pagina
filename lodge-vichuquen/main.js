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
    safe(initSplash,     "splash");
    safe(initNav,        "nav");
    safe(initMobileMenu, "mobileMenu");
    safe(initHero,       "hero");
    safe(initCarousels,  "carousels");
    safe(initExtras,     "extras");
    safe(initReveals,    "reveals");
    safe(initCounters,   "counters");
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
      [".cabanas-grid", ".exp-grid", ".galeria-grid"].forEach(function (sel) {
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

})();;
