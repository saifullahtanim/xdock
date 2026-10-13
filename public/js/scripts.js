/**
 * XDock - Seamless Navigation & Global Scripts
 * 1. SPA-like seamless page transitions: Nav never reloads on link click or back/forward!
 * 2. Floating Scroll-to-Top button on long pages.
 * 3. Clipboard paste handler for Homepage.
 */
(function () {
  'use strict';

  // Internal route matcher
  var internalPages = [
    '/',
    '/index.html',
    '/how-to-download-twitter-videos.html',
    '/about.html',
    '/contact.html',
    '/privacy.html',
    '/terms.html',
    '/disclaimer.html'
  ];

  function getCleanPath(url) {
    try {
      var u = new URL(url, window.location.origin);
      var pathname = u.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }
      return pathname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function isInternalLink(a) {
    if (!a || !a.href) return false;
    if (a.classList.contains('navbar-brand') || a.closest('.navbar-brand')) return false;
    if (a.getAttribute('target') === '_blank') return false;
    if (a.getAttribute('data-toggle') === 'dropdown' || a.getAttribute('data-toggle') === 'collapse') return false;
    if (a.href.startsWith('javascript:') || a.getAttribute('href') === '#') return false;

    try {
      var u = new URL(a.href, window.location.origin);
      if (u.origin !== window.location.origin) return false;

      var path = getCleanPath(u.href);
      return internalPages.some(function (p) {
        return path === p || path.endsWith(p);
      });
    } catch (e) {
      return false;
    }
  }

  // Seamless Page Loader
  var isNavigating = false;

  async function navigateTo(url, pushHistory) {
    if (isNavigating) return;

    var cleanTarget = getCleanPath(url);
    var cleanCurrent = getCleanPath(window.location.href);

    if (cleanTarget === cleanCurrent && pushHistory) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    isNavigating = true;

    try {
      var response = await fetch(url, { headers: { 'X-Requested-With': 'Fetch' } });
      if (!response.ok) {
        window.location.href = url;
        return;
      }

      var htmlText = await response.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(htmlText, 'text/html');

      // 1. Update Document Title
      if (doc.title) {
        document.title = doc.title;
      }

      // 1b. Sync page specific <style> tags
      var currentDynamicStyle = document.getElementById('dynamic-page-style');
      if (currentDynamicStyle) currentDynamicStyle.remove();
      var newStyles = doc.querySelectorAll('head style');
      if (newStyles.length > 0) {
        var mergedCss = '';
        newStyles.forEach(function (s) { mergedCss += s.textContent + '\n'; });
        var styleEl = document.createElement('style');
        styleEl.id = 'dynamic-page-style';
        styleEl.textContent = mergedCss;
        document.head.appendChild(styleEl);
      }

      // 1c. Sync Navbar (.navbar)
      var currentNav = document.querySelector('.navbar');
      var newNav = doc.querySelector('.navbar');
      if (currentNav && newNav) {
        currentNav.innerHTML = newNav.innerHTML;
      }

      // 2. Update Main Content (.jumbotron)
      var currentJumbo = document.querySelector('.jumbotron');
      var newJumbo = doc.querySelector('.jumbotron');
      if (currentJumbo && newJumbo) {
        currentJumbo.innerHTML = newJumbo.innerHTML;
        // Copy any inline styles on jumbotron if different
        if (newJumbo.getAttribute('style')) {
          currentJumbo.setAttribute('style', newJumbo.getAttribute('style'));
        }
      }

      // 3. Update Footer (.footer-wrap)
      var currentFooter = document.querySelector('.footer-wrap');
      var newFooter = doc.querySelector('.footer-wrap');
      if (currentFooter && newFooter) {
        currentFooter.innerHTML = newFooter.innerHTML;
      }

      // 4. Update URL History
      if (pushHistory) {
        window.history.pushState({ url: url }, doc.title, url);
      }

      // 5. Scroll to top
      window.scrollTo(0, 0);

      // 6. Close mobile navbar collapse and dropdowns if open
      if (window.jQuery) {
        if (window.jQuery('.navbar-collapse').hasClass('in')) {
          window.jQuery('.navbar-collapse').collapse('hide');
        }
        window.jQuery('.dropdown.open').removeClass('open');
        if (window.jQuery('#xdock_howto').length && window.jQuery('#xdock_howto').hasClass('in')) {
          window.jQuery('#xdock_howto').modal('hide');
        }
      }

      // 7. Page specific initializers
      initPageHooks();

    } catch (err) {
      console.warn('Navigation fallback:', err);
      window.location.href = url;
    } finally {
      isNavigating = false;
    }
  }

  // Intercept all link clicks across document
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a');
    if (!anchor) return;

    // Navbar logo behavior:
    // If already on homepage -> reload current page
    // If on another page -> navigate to homepage with full reload
    if (anchor.classList.contains('navbar-brand') || anchor.closest('.navbar-brand')) {
      e.preventDefault();
      var path = window.location.pathname.toLowerCase();
      var isHome = (path === '/' || path === '/index.html' || path.endsWith('/index.html') || path === '');
      if (isHome) {
        window.location.reload();
      } else {
        window.location.href = 'index.html';
      }
      return;
    }

    if (isInternalLink(anchor)) {
      e.preventDefault();
      if (window.jQuery && window.jQuery('#xdock_howto').length) {
        window.jQuery('#xdock_howto').modal('hide');
        window.jQuery('.modal-backdrop').remove();
        window.jQuery('body').removeClass('modal-open').css('padding-right', '');
      }
      navigateTo(anchor.href, true);
    }
  });

  // Handle Browser Back / Forward buttons without reloading nav
  window.addEventListener('popstate', function () {
    navigateTo(window.location.href, false);
  });

  // How to Use XDock Modal Step Navigation
  window.stepHowTo = function (type, dir) {
    if (!window.jQuery) return;
    var carouselId = '#carousel-' + type;
    var $carousel = window.jQuery(carouselId);
    var $items = $carousel.find('.carousel-inner .item');
    var total = $items.length || 3;
    var current = $carousel.find('.carousel-inner .item.active').index();
    if (current === -1) current = 0;

    var nextIndex;
    if (dir === 'next') {
      if (current === total - 1) {
        window.jQuery('#xdock_howto').modal('hide');
        return;
      }
      nextIndex = current + 1;
    } else if (dir === 'prev') {
      if (current === 0) return;
      nextIndex = current - 1;
    } else {
      nextIndex = parseInt(dir, 10);
    }

    $carousel.carousel(nextIndex);
  };

  window.updateHowToUI = function (type, index) {
    if (!window.jQuery) return;
    var total = 3;
    window.jQuery('#' + type + '-step-num').text(index + 1);

    // Update dots
    for (var i = 0; i < total; i++) {
      var $dot = window.jQuery('#' + type + '-dot-' + i);
      if (i === index) {
        $dot.addClass('active');
      } else {
        $dot.removeClass('active');
      }
    }

    // Update Prev button
    var $prevBtn = window.jQuery('#' + type + '-prev-btn');
    $prevBtn.prop('disabled', index === 0);

    // Update Next button
    var $nextBtn = window.jQuery('#' + type + '-next-btn');
    if (index === total - 1) {
      $nextBtn.html('Finish <span class="glyphicon glyphicon-ok" style="font-size:11px;margin-left:2px;"></span>');
      $nextBtn.removeClass('next-btn').addClass('finish-btn');
    } else {
      $nextBtn.html('Next <span class="glyphicon glyphicon-chevron-right" style="font-size:10px;margin-left:2px;"></span>');
      $nextBtn.removeClass('finish-btn').addClass('next-btn');
    }
  };

  function initHowToModal() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    $('#carousel-howto').off('slid.bs.carousel').on('slid.bs.carousel', function () {
      var idx = $(this).find('.carousel-inner .item.active').index();
      if (idx !== -1) window.updateHowToUI('howto', idx);
    });

    $('#xdock_howto').off('show.bs.modal').on('show.bs.modal', function () {
      $('#carousel-howto').carousel(0);
      window.updateHowToUI('howto', 0);
    });
  }

  // Global Contact Captcha definition fallback
  if (!window.initCaptcha) {
    window.expectedCaptchaSum = 20;
    window.initCaptcha = function () {
      var num1 = Math.floor(Math.random() * 12) + 4;
      var num2 = Math.floor(Math.random() * 10) + 2;
      window.expectedCaptchaSum = num1 + num2;
      var q = document.getElementById('captcha-question');
      var inp = document.getElementById('captchax');
      if (q) q.textContent = 'What is ' + num1 + ' + ' + num2 + ' = ?';
      if (inp) inp.value = '';
    };
  }

  // Page Specific Hooks
  function initPageHooks() {
    // A. Contact Page: Init Captcha if present
    if (document.getElementById('captcha-question')) {
      if (typeof window.initCaptcha === 'function') {
        window.initCaptcha();
      }
    }

    // B. Homepage: Init How-to Modal
    initHowToModal();

    // C. Homepage: Init Download Form Handler
    initDownloadForm();

    // D. Homepage: Init Clipboard Paste button
    var pasteBtn = document.getElementById('pasteBtn');
    var inputEl = document.getElementById('videoUrlInput');
    if (pasteBtn && inputEl && !pasteBtn.dataset.bound) {
      pasteBtn.dataset.bound = 'true';
      pasteBtn.addEventListener('click', async function () {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            var text = await navigator.clipboard.readText();
            if (text) {
              inputEl.value = text.trim();
              inputEl.focus();
            }
          } else {
            inputEl.focus();
          }
        } catch (e) {
          inputEl.focus();
        }
      });
    }
  }

  function initDownloadForm() {
    var form = document.getElementById('downloadForm');
    var input = document.getElementById('videoUrlInput');
    var submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', function (e) {
      var url = (input ? input.value : '').trim();
      if (!url) {
        e.preventDefault();
        if (input) input.focus();
        return;
      }

      if (submitBtn) {
        // Show spinner while browser submits to /download.php
        submitBtn.innerHTML = '<span class="glyphicon glyphicon-refresh" style="display:inline-block;animation:spin 0.9s infinite linear; margin-right:4px;"></span> Fetching...';
      }
    });
  }

  // Floating Back-to-Top Button
  function initScrollToTop() {
    if (document.getElementById('xdock-scroll-top')) return;

    var btn = document.createElement('button');
    btn.id = 'xdock-scroll-top';
    btn.className = 'fbdock-scroll-top-btn';
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', 'Scroll to top');
    btn.setAttribute('aria-label', 'Scroll to top');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"></path></svg>';
    document.body.appendChild(btn);

    var scrollThreshold = 220;
    var ticking = false;

    function handleScroll() {
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollY > scrollThreshold) {
        if (!btn.classList.contains('is-visible')) {
          btn.classList.add('is-visible');
        }
      } else {
        if (btn.classList.contains('is-visible')) {
          btn.classList.remove('is-visible');
        }
      }
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(handleScroll);
        ticking = true;
      }
    }, { passive: true });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        window.scrollTo(0, 0);
      }
    });
  }

  // Run on initial page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initPageHooks();
      initScrollToTop();
    });
  } else {
    initPageHooks();
    initScrollToTop();
  }
})();
