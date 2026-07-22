/**
 * Web Book reader script（固定 IIFE 文字列のみ）。
 * title / heading / 本文文字列をこの module で連結しない。
 * session state は DOM attribute / CSS variable のみ（localStorage 不使用）。
 * chrome / Settings popover / Outline drawer はすべて overlay で、開閉が
 * pagination の metrics / pageIndex / transform を変えない。
 * WB-R5: ページ遷移（none / fade / slide / zoom、200〜1000ms・50ms刻み・
 * 既定 fade / 500ms）は演出専用で、隣接ページ移動だけが発火する。実行中の
 * 演出は generation token と一括 cleanup で管理し、print / reduced motion /
 * reflow / none 選択では即時 idle へ戻す。
 * WB-R13: tap / click / swipe による reader interaction。Pointer Events を
 * 単一経路にし、隣接ページ移動は既存 goBy(delta) だけを呼ぶ（pageIndex /
 * transform / pageCount / transition class / aria / button disabled の
 * 独自経路は追加しない）。中央 tap/click は compact chrome の表示状態だけを
 * トグルし、左右 tap/click/swipe は chrome の表示状態を変えない。
 */
export function buildWebBookReaderScript(): string {
  return `(function () {
  'use strict';

  var COLUMN_GAP = 40;
  var HIDE_DELAY_MS = 3500;
  var MIN_SCALE = 0.8;
  var MAX_SCALE = 1.5;
  var SCALE_STEP = 0.05;
  var MIN_INLINE_INSET = 12;
  var MIN_BLOCK_INSET = 16;
  var INSET_TOP_DEFAULT = 32;
  var INSET_BOTTOM_DEFAULT = 16;
  var INSET_INLINE_DEFAULT = 16;
  var TRANSITION_DEFAULT_MODE = 'fade';
  var TRANSITION_SPEED_MIN_MS = 200;
  var TRANSITION_SPEED_MAX_MS = 1000;
  var TRANSITION_SPEED_STEP_MS = 50;
  var TRANSITION_SPEED_DEFAULT_MS = 500;
  var TRANSITION_FADE_OUT_RATIO = 0.45;
  var TRANSITION_FADE_FALLBACK_BUFFER_MS = 80;
  var TRANSITION_CLASS_FADE_OUT = 'is-wb-transition-fade-out';
  var TRANSITION_CLASS_FADE_IN = 'is-wb-transition-fade-in';
  var TRANSITION_CLASS_ZOOM = 'is-wb-transition-zoom';
  var TRANSITION_CLASS_SLIDE = 'is-wb-transition-slide';

  // WB-R13: tap / swipe gesture thresholds (single source of truth — do not
  // scatter magic numbers across the handlers below).
  var GESTURE_TAP_MAX_MOVEMENT_PX = 10;
  var GESTURE_TAP_MAX_DURATION_MS = 500;
  var GESTURE_SWIPE_MIN_DISTANCE_PX = 48;
  var GESTURE_SWIPE_MIN_HORIZONTAL_RATIO = 1.5;
  var GESTURE_SWIPE_MAX_DURATION_MS = 800;
  var GESTURE_INTERACTIVE_ROLES = {
    button: 1, link: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1,
    checkbox: 1, radio: 1, switch: 1, slider: 1, spinbutton: 1, tab: 1,
    textbox: 1, combobox: 1, searchbox: 1, option: 1, treeitem: 1, gridcell: 1
  };

  // 用紙枠の既定値をモバイル環境では OFF にする閾値。coarse pointer
  // （タッチ）と組み合わせて判定するため、デスクトップブラウザのウィンドウを
  // 狭くしただけのケースは対象にならない（マウス操作の既存挙動は変えない）。
  // innerWidth 単体ではなく min(innerWidth, innerHeight) を見るのは、横持ち
  // スマートフォン（実効幅が閾値を超える）でも一貫して OFF にするため、かつ
  // ポートレートのタブレット（短辺がこの閾値より大きい）を誤って対象にしない
  // ため。
  var MOBILE_NARROW_VIEWPORT_MAX_DIMENSION_PX = 600;

  function isMobileNarrowViewport() {
    var coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var smallerDimension = Math.min(window.innerWidth, window.innerHeight);
    return coarsePointer && smallerDimension <= MOBILE_NARROW_VIEWPORT_MAX_DIMENSION_PX;
  }

  var FONT_FAMILIES = {
    mincho: '"Yu Mincho", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Noto Serif CJK JP", "Noto Serif JP", serif',
    gothic: '"Yu Gothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", sans-serif'
  };

  var root = document.body;
  if (!root || !root.classList.contains('nyoze-web-book-root')) return;
  var hasAuthorPalette = root.getAttribute('data-wb-author-palette') === 'true';
  var defaultTheme = hasAuthorPalette ? 'author' : 'classic';

  var viewport = document.querySelector('.nyoze-web-book-viewport');
  var flow = document.querySelector('.nyoze-web-book-flow');
  var prevBtn = document.querySelector('[data-wb-prev]');
  var nextBtn = document.querySelector('[data-wb-next]');
  var statusEl = document.querySelector('[data-wb-status]');
  var chrome = document.querySelector('.nyoze-web-book-chrome');
  var outline = document.getElementById('nyoze-web-book-outline');
  var outlineToggle = document.querySelector('[data-wb-outline-toggle]');
  var settings = document.getElementById('nyoze-web-book-settings');
  var settingsToggle = document.querySelector('[data-wb-settings-toggle]');
  var backdrop = document.querySelector('[data-wb-backdrop]');
  var scaleDecrease = document.querySelector('[data-wb-scale-decrease]');
  var scaleIncrease = document.querySelector('[data-wb-scale-increase]');
  var scaleStatus = document.querySelector('[data-wb-scale-status]');
  var themeSelect = document.querySelector('[data-wb-theme-select]');
  var pageInsetTopSelect = document.querySelector('select[data-wb-page-inset-top]');
  var pageInsetBottomSelect = document.querySelector('select[data-wb-page-inset-bottom]');
  var pageInsetInlineSelect = document.querySelector('select[data-wb-page-inset-inline]');
  var paperFrameButton = document.querySelector('button[data-wb-paper-frame]');
  var headerEnabledButton = document.querySelector('button[data-wb-header-enabled]');
  var headerAlignSelect = document.querySelector('select[data-wb-header-align]');
  var headerShowTitleButton = document.querySelector('button[data-wb-header-show-title]');
  var headerShowAuthorButton = document.querySelector('button[data-wb-header-show-author]');
  var footerEnabledButton = document.querySelector('button[data-wb-footer-enabled]');
  var footerAlignSelect = document.querySelector('select[data-wb-footer-align]');
  var footerPageStatus = document.querySelector('[data-wb-footer-pages]');
  var resetBtn = document.querySelector('[data-wb-reset]');
  var transitionSelect = document.querySelector('select[data-wb-transition-select]');
  var transitionSpeedRange = document.querySelector('input[data-wb-transition-speed-range]');
  var transitionSpeedStatus = document.querySelector('[data-wb-transition-speed-status]');
  var transitionMask = document.querySelector('[data-wb-transition-mask]');
  var transitionOverlay = document.querySelector('[data-wb-transition-overlay]');
  if (!viewport || !flow) return;

  var html = document.documentElement;
  function normalizeWritingMode(value) {
    return value === 'horizontal-tb' ? 'horizontal-tb' : 'vertical-rl';
  }

  function normalizePageInset(value, fallback) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return fallback;
    var stepped = Math.round(numeric / 8) * 8;
    return Math.min(80, Math.max(0, stepped));
  }

  function effectiveBlockInset(value) {
    return MIN_BLOCK_INSET + value;
  }

  function effectiveInlineInset(value) {
    return Math.max(MIN_INLINE_INSET, value);
  }

  var initialWritingMode = normalizeWritingMode(
    root.getAttribute('data-wb-writing-mode') ||
      (html && html.getAttribute('data-writing-mode')) ||
      (root.classList.contains('nyoze-writing-mode-horizontal-tb') ? 'horizontal-tb' : 'vertical-rl'),
  );
  var writingMode = initialWritingMode;
  var isVertical = writingMode === 'vertical-rl';

  var pageIndex = 0;
  var pageCount = 1;
  var pitch = 0;
  var gap = COLUMN_GAP;
  var measureQueued = false;
  var fontScale = 1;
  var fontKey = 'mincho';
  var headingFontAttr =
    root.getAttribute('data-wb-heading-font') ||
    root.getAttribute('data-wb-heading-font-initial') ||
    'same-as-body';
  var headingFontKey =
    headingFontAttr === 'mincho' || headingFontAttr === 'gothic' || headingFontAttr === 'same-as-body'
      ? headingFontAttr
      : 'same-as-body';
  var initialHeadingFontAttr = root.getAttribute('data-wb-heading-font-initial') || headingFontKey;
  var initialHeadingFont =
    initialHeadingFontAttr === 'mincho' ||
    initialHeadingFontAttr === 'gothic' ||
    initialHeadingFontAttr === 'same-as-body'
      ? initialHeadingFontAttr
      : 'same-as-body';
  var themeKey = defaultTheme;
  var pageInsetTop = normalizePageInset(root.getAttribute('data-wb-page-inset-top'), INSET_TOP_DEFAULT);
  var pageInsetBottom = normalizePageInset(root.getAttribute('data-wb-page-inset-bottom'), INSET_BOTTOM_DEFAULT);
  var pageInsetInline = normalizePageInset(root.getAttribute('data-wb-page-inset-inline'), INSET_INLINE_DEFAULT);
  var paperFrame = root.getAttribute('data-wb-paper-frame') !== 'off';
  var headerEnabled = root.getAttribute('data-wb-header-enabled') !== 'off';
  var headerAlign = root.getAttribute('data-wb-header-align') || 'left';
  var headerShowTitle = root.getAttribute('data-wb-header-show-title') !== 'off';
  var headerShowAuthor = root.getAttribute('data-wb-header-show-author') === 'on';
  var footerEnabled = root.getAttribute('data-wb-footer-enabled') !== 'off';
  var footerAlign = root.getAttribute('data-wb-footer-align') || 'right';
  var transitionMode = normalizeTransitionMode(root.getAttribute('data-wb-transition'));
  var transitionSpeedMs = normalizeTransitionSpeed(root.getAttribute('data-wb-transition-speed'));
  var transitionGeneration = 0;
  var transitionCleanup = null;
  var reducedMotionMedia = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  var pendingRestoreRatio = null;
  var destroyed = false;
  var outlineOpen = false;
  var settingsOpen = false;
  var hideTimer = null;
  var chromeHovered = false;
  var chromeFocused = false;
  var printMedia = window.matchMedia ? window.matchMedia('print') : null;
  var printing = !!(printMedia && printMedia.matches);

  // WB-R13: single in-flight gesture (primary pointer only). A second
  // concurrent pointer cancels it (pinch / multi-touch guard).
  var gesturePointerId = null;
  var gesturePointerType = null;
  var gestureStartX = 0;
  var gestureStartY = 0;
  var gestureStartTime = 0;
  var gestureCanceled = false;
  var gestureChromeHiddenAtStart = false;
  var gestureHadSelectionAtStart = false;
  var activePointerCount = 0;

  function isPrinting() {
    return printing || !!(printMedia && printMedia.matches);
  }

  function clampIndex(index, count) {
    if (!isFinite(index)) return 0;
    var max = Math.max(0, Math.floor(count) - 1);
    return Math.min(Math.max(Math.floor(index), 0), max);
  }

  function clampScale(value) {
    if (!isFinite(value)) return 1;
    var stepped = Math.round(value / SCALE_STEP) * SCALE_STEP;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(stepped * 100) / 100));
  }

  function normalizeFurnitureAlign(value) {
    return value === 'left' || value === 'right' ? value : 'center';
  }

  function progressPercent(index, count) {
    if (count <= 1) return 0;
    return Math.round((100 * clampIndex(index, count)) / (count - 1));
  }

  function setAria() {
    viewport.setAttribute('data-wb-page-index', String(pageIndex));
    viewport.setAttribute('data-wb-page-count', String(pageCount));
    root.setAttribute('data-wb-page-index', String(pageIndex));
    root.setAttribute('data-wb-page-count', String(pageCount));
    if (statusEl) {
      statusEl.textContent = progressPercent(pageIndex, pageCount) + '%';
    }
    if (footerPageStatus) {
      var footerText = String(pageIndex + 1) + ' / ' + String(pageCount);
      footerPageStatus.textContent = footerText;
      footerPageStatus.setAttribute('aria-label', '現在のページ ' + footerText);
    }
    if (prevBtn) prevBtn.disabled = pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= pageCount - 1;
  }

  function applyTransform() {
    if (destroyed || isPrinting()) return;
    var offset = pageIndex * pitch;
    root.style.setProperty('--wb-page-offset', String(-offset) + 'px');
  }

  function applyScreenGeometry(layout) {
    root.style.setProperty('--wb-frame-width', layout.frameWidth + 'px');
    root.style.setProperty('--wb-frame-height', layout.frameHeight + 'px');
    root.style.setProperty('--wb-page-pitch', layout.pitch + 'px');
    root.style.setProperty('--wb-column-width', layout.columnWidth + 'px');
    root.style.setProperty('--wb-column-gap', layout.gap + 'px');
    root.style.setProperty('--wb-inline-padding', layout.inlinePadding + 'px');
    root.style.setProperty('--wb-effective-page-inset-top', layout.effectiveTop + 'px');
    root.style.setProperty('--wb-effective-page-inset-bottom', layout.effectiveBottom + 'px');
    root.style.setProperty('--wb-effective-page-inset-inline', layout.effectiveInline + 'px');
  }

  function computeLayout() {
    var frameWidth = viewport.clientWidth;
    var frameHeight = viewport.clientHeight;
    if (!isFinite(frameWidth) || frameWidth <= 0) return null;
    if (!isFinite(frameHeight) || frameHeight <= 0) return null;
    var nextPitch = isVertical ? frameHeight : frameWidth;
    var effectiveTop = effectiveBlockInset(pageInsetTop);
    var effectiveBottom = effectiveBlockInset(pageInsetBottom);
    var effectiveInline = effectiveInlineInset(pageInsetInline);
    // physical inset はそのまま padding と column gap の両方へ使う。vertical-rl は
    // y 軸へ上下余白、horizontal-tb は x 軸へ左右余白だけを織り込み、実 fragment
    // stride と canonical transform pitch の不一致を作らない。
    var nextGap = isVertical
      ? effectiveTop + effectiveBottom
      : effectiveInline * 2;
    var columnWidth = Math.max(1, Math.trunc(nextPitch - nextGap));
    return {
      pitch: nextPitch,
      gap: nextGap,
      columnWidth: columnWidth,
      frameWidth: frameWidth,
      frameHeight: frameHeight,
      inlinePadding: 0,
      effectiveTop: effectiveTop,
      effectiveBottom: effectiveBottom,
      effectiveInline: effectiveInline,
    };
  }

  function measure() {
    if (destroyed || isPrinting()) return;
    // reflow / 再計測は演出を即時 cleanup してから行う（fade の保留切替は
    // ここで commit されるため、ratio は確定後の pageIndex から計算される）。
    cancelTransition();
    var layout = computeLayout();
    if (!layout) {
      pendingRestoreRatio = null;
      pageCount = 1;
      pitch = 0;
      gap = COLUMN_GAP;
      pageIndex = 0;
      root.style.setProperty('--wb-page-offset', '0px');
      setAria();
      return;
    }

    var oldMax = Math.max(1, pageCount - 1);
    var ratio = pendingRestoreRatio === null ? pageIndex / oldMax : pendingRestoreRatio;
    pendingRestoreRatio = null;

    pitch = layout.pitch;
    gap = layout.gap;
    applyScreenGeometry(layout);
    root.style.setProperty('--wb-page-offset', '0px');
    void flow.offsetHeight;

    var viewportScroll = isVertical ? viewport.scrollHeight : viewport.scrollWidth;
    var flowScroll = isVertical ? flow.scrollHeight : flow.scrollWidth;
    var setupScrollSize = Math.max(
      isFinite(viewportScroll) ? viewportScroll : 0,
      isFinite(flowScroll) ? flowScroll : 0,
    );
    if (!isFinite(setupScrollSize) || setupScrollSize <= 0) {
      setupScrollSize = pitch;
    }

    pageCount = pitch > 0 ? Math.max(1, Math.ceil(setupScrollSize / pitch)) : 1;
    pageIndex = clampIndex(Math.round(ratio * Math.max(0, pageCount - 1)), pageCount);
    applyTransform();
    setAria();
  }

  function queueMeasure() {
    if (destroyed || isPrinting()) return;
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(function () {
      measureQueued = false;
      if (destroyed || isPrinting()) return;
      measure();
    });
  }

  function currentPageRatio() {
    if (pageCount < 1 || pitch <= 0) return null;
    return pageIndex / Math.max(1, pageCount - 1);
  }

  function requestLayoutReflow() {
    if (destroyed || isPrinting()) return;
    // 比率 capture の前に演出を中断し、保留中の fade page 切替を確定させる。
    cancelTransition();
    if (pendingRestoreRatio === null) {
      var ratio = currentPageRatio();
      if (ratio === null) return;
      pendingRestoreRatio = Math.min(1, Math.max(0, ratio));
    }
    queueMeasure();
  }

  function goTo(index) {
    if (isPrinting()) return;
    pageIndex = clampIndex(index, pageCount);
    applyTransform();
    setAria();
  }

  /* ============================================================
     WB-R5 page transition — 演出専用。pageIndex + cached metrics +
     canonical transform の正本は変えず、viewport の opacity / 小さな
     visual transform と、viewport を覆う mask / overlay だけを animate
     する。state は root の data-wb-* / CSS custom property のみ。
     ============================================================ */

  function normalizeTransitionMode(value) {
    return value === 'none' || value === 'fade' || value === 'slide' || value === 'zoom'
      ? value
      : TRANSITION_DEFAULT_MODE;
  }

  function normalizeTransitionSpeed(value) {
    var numeric = Number(value);
    if (!isFinite(numeric)) return TRANSITION_SPEED_DEFAULT_MS;
    var stepped = Math.round(numeric / TRANSITION_SPEED_STEP_MS) * TRANSITION_SPEED_STEP_MS;
    return Math.min(TRANSITION_SPEED_MAX_MS, Math.max(TRANSITION_SPEED_MIN_MS, stepped));
  }

  function prefersReducedMotion() {
    return !!(reducedMotionMedia && reducedMotionMedia.matches);
  }

  /** print / reduced motion / destroy 中の実効遷移は方式にかかわらず none。 */
  function effectiveTransitionMode() {
    if (destroyed || isPrinting() || prefersReducedMotion()) return 'none';
    return transitionMode;
  }

  function setTransitionStateAttr(state) {
    root.setAttribute('data-wb-transition-state', state);
  }

  /**
   * 全 transition class / direction attribute / inline duration を外し idle
   * へ戻す（冪等）。演出用 visual cleanup の唯一の正本 — fade/slide/zoom の
   * 通常完了・中断・方式変更・none 選択・reflow・resize・Reset・print 開始・
   * pagehide・reduced-motion のすべてがこの関数を経由する。root の
   * --wb-transition-speed（session setting の正本）はここでは触らない。
   */
  function clearTransitionVisuals() {
    viewport.classList.remove(TRANSITION_CLASS_FADE_OUT, TRANSITION_CLASS_FADE_IN, TRANSITION_CLASS_ZOOM);
    viewport.style.removeProperty('--wb-transition-duration');
    if (transitionMask) {
      transitionMask.classList.remove(TRANSITION_CLASS_SLIDE);
      transitionMask.removeAttribute('data-wb-transition-direction');
      transitionMask.style.removeProperty('--wb-transition-duration');
    }
    if (transitionOverlay) {
      transitionOverlay.classList.remove(TRANSITION_CLASS_SLIDE);
      transitionOverlay.removeAttribute('data-wb-transition-direction');
      transitionOverlay.style.removeProperty('--wb-transition-duration');
    }
    setTransitionStateAttr('idle');
  }

  /**
   * 実行中の演出を中断して idle へ戻す。generation を進めるため、中断済み
   * 演出の animationend / timer が後から届いても class を復活させない。
   * fade 第1相（page index 未切替）の中断では、保留中のページ切替だけを
   * 即時 commit する — 演出は装飾であり、確定済みのページ移動要求を落とさない。
   */
  function cancelTransition() {
    transitionGeneration += 1;
    var cleanup = transitionCleanup;
    transitionCleanup = null;
    if (cleanup) cleanup();
    clearTransitionVisuals();
  }

  /** 演出経路のページ切替。print 中でも要求済みの index / aria は確定させる。 */
  function commitPageIndex(target) {
    pageIndex = clampIndex(target, pageCount);
    applyTransform();
    setAria();
  }

  function beginTransitionRun(stateName) {
    transitionGeneration += 1;
    root.setAttribute('data-wb-transition-generation', String(transitionGeneration));
    setTransitionStateAttr(stateName);
    return transitionGeneration;
  }

  /**
   * fade: 旧ページを fade-out → 完了検知（animationend 主 / 保護 fallback
   * timer 従）で canonical transform による page index 切替 → 同一 task 内で
   * fade-in class へ差し替える。fade-out は forwards で opacity 0 を保持した
   * まま handoff するため、旧ページが一瞬フル不透明へ戻るちらつきは出ない。
   */
  function startFadeTransition(target, totalMs) {
    var generation = beginTransitionRun('fade-out');
    var fadeOutMs = Math.round(totalMs * TRANSITION_FADE_OUT_RATIO);
    var fadeInMs = Math.max(0, totalMs - fadeOutMs);
    var settled = false;

    function handleAnimationEnd(event) {
      if (event.target !== viewport) return;
      finishFadeOut();
    }

    function detachFadeOut() {
      viewport.removeEventListener('animationend', handleAnimationEnd);
      clearTimeout(fallbackTimer);
    }

    function finishFadeOut() {
      if (settled) return;
      settled = true;
      detachFadeOut();
      if (generation !== transitionGeneration || destroyed) return;
      commitPageIndex(target);
      viewport.classList.remove(TRANSITION_CLASS_FADE_OUT);
      viewport.style.setProperty('--wb-transition-duration', String(fadeInMs) + 'ms');
      void viewport.offsetWidth;
      viewport.classList.add(TRANSITION_CLASS_FADE_IN);
      setTransitionStateAttr('fade-in');
      var fadeInTimer = setTimeout(function () {
        if (generation !== transitionGeneration) return;
        transitionCleanup = null;
        clearTransitionVisuals();
      }, fadeInMs);
      transitionCleanup = function () {
        clearTimeout(fadeInTimer);
      };
    }

    var fallbackTimer = setTimeout(
      finishFadeOut,
      fadeOutMs + TRANSITION_FADE_FALLBACK_BUFFER_MS,
    );
    viewport.addEventListener('animationend', handleAnimationEnd);
    viewport.style.setProperty('--wb-transition-duration', String(fadeOutMs) + 'ms');
    void viewport.offsetWidth;
    viewport.classList.add(TRANSITION_CLASS_FADE_OUT);

    transitionCleanup = function () {
      settled = true;
      detachFadeOut();
      commitPageIndex(target);
    };
  }

  /**
   * slide: page index は演出開始と同じ task で切り替え済み（最初に paint
   * される frame では新ページ + 全面 mask が同時に成立する）。opaque な
   * paper-color mask と半透明 overlay が同方向・同速度で物理 x 軸を退出して
   * 新ページを露出する。flow / stage の transform は一切動かさない。
   */
  function startSlideTransition(target, direction, durationMs) {
    commitPageIndex(target);
    if (!transitionMask || !transitionOverlay) return;
    var generation = beginTransitionRun('slide');
    transitionMask.style.setProperty('--wb-transition-duration', String(durationMs) + 'ms');
    transitionOverlay.style.setProperty('--wb-transition-duration', String(durationMs) + 'ms');
    void transitionMask.offsetWidth;
    transitionMask.setAttribute('data-wb-transition-direction', direction);
    transitionOverlay.setAttribute('data-wb-transition-direction', direction);
    transitionMask.classList.add(TRANSITION_CLASS_SLIDE);
    transitionOverlay.classList.add(TRANSITION_CLASS_SLIDE);
    var timer = setTimeout(function () {
      if (generation !== transitionGeneration) return;
      transitionCleanup = null;
      clearTransitionVisuals();
    }, durationMs);
    transitionCleanup = function () {
      clearTimeout(timer);
    };
  }

  /** zoom: 切替済みの新ページを opacity + 小さな scale で見せる。終了は identity。 */
  function startZoomTransition(target, durationMs) {
    commitPageIndex(target);
    var generation = beginTransitionRun('zoom');
    viewport.style.setProperty('--wb-transition-duration', String(durationMs) + 'ms');
    void viewport.offsetWidth;
    viewport.classList.add(TRANSITION_CLASS_ZOOM);
    var timer = setTimeout(function () {
      if (generation !== transitionGeneration) return;
      transitionCleanup = null;
      clearTransitionVisuals();
    }, durationMs);
    transitionCleanup = function () {
      clearTimeout(timer);
    };
  }

  /** Home / End / Outline / TOC jump など、遷移を発火しないページ移動。 */
  function navigateWithoutTransition(index) {
    cancelTransition();
    goTo(index);
  }

  /**
   * 隣接ページ移動（prev / next button、PageUp / PageDown、Arrow key）だけが
   * 遷移を発火する。前の演出は必ず中断・cleanup してから始める（fade の保留
   * page 切替はこの cancel で commit されるため、rapid navigation でも
   * 1 操作 = 1 ページを失わない）。同じ page index への要求では発火しない。
   */
  function goBy(delta) {
    if (isPrinting()) return;
    cancelTransition();
    var target = clampIndex(pageIndex + delta, pageCount);
    if (target === pageIndex) return;
    var mode = effectiveTransitionMode();
    if (mode === 'fade') {
      startFadeTransition(target, transitionSpeedMs);
    } else if (mode === 'slide') {
      startSlideTransition(target, delta > 0 ? 'next' : 'previous', transitionSpeedMs);
    } else if (mode === 'zoom') {
      startZoomTransition(target, transitionSpeedMs);
    } else {
      goTo(target);
    }
  }

  function syncTransitionControls() {
    if (transitionSelect && transitionSelect.value !== transitionMode) {
      transitionSelect.value = transitionMode;
    }
    if (transitionSpeedRange) {
      transitionSpeedRange.disabled = transitionMode === 'none';
      if (transitionSpeedRange.value !== String(transitionSpeedMs)) {
        transitionSpeedRange.value = String(transitionSpeedMs);
      }
    }
    if (transitionSpeedStatus) {
      transitionSpeedStatus.textContent = String(transitionSpeedMs) + 'ms';
    }
  }

  function applyTransitionMode(next) {
    var normalized = normalizeTransitionMode(next);
    var changed = transitionMode !== normalized;
    transitionMode = normalized;
    root.setAttribute('data-wb-transition', transitionMode);
    syncTransitionControls();
    // 方式切替（none 選択を含む）は実行中の演出を即時中断する。
    if (changed) cancelTransition();
  }

  function applyTransitionSpeed(next) {
    transitionSpeedMs = normalizeTransitionSpeed(next);
    root.setAttribute('data-wb-transition-speed', String(transitionSpeedMs));
    root.style.setProperty('--wb-transition-speed', String(transitionSpeedMs) + 'ms');
    syncTransitionControls();
    // 実行中の animation は再起動しない。次のページ移動から新しい速度を使う。
  }

  function pageIndexForElement(el) {
    if (!el || !(el instanceof Element) || pitch <= 0) return 0;
    var flowRect = flow.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    var offset = isVertical ? elRect.top - flowRect.top : elRect.left - flowRect.left;
    if (!isFinite(offset)) return pageIndex;
    return clampIndex(Math.floor(offset / pitch), pageCount);
  }

  function jumpToHeadingId(id) {
    if (!id) return;
    var target = null;
    try {
      if (window.CSS && CSS.escape) {
        target = flow.querySelector('#' + CSS.escape(id));
      }
    } catch (e) {
      target = null;
    }
    if (!target) {
      try {
        target = document.getElementById(id);
      } catch (e2) {
        target = null;
      }
    }
    if (!target || !flow.contains(target)) return;
    navigateWithoutTransition(pageIndexForElement(target));
  }

  function focusElement(el) {
    if (!el || typeof el.focus !== 'function') return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      el.focus();
    }
  }

  function setBackdropVisible(visible) {
    if (!backdrop) return;
    backdrop.hidden = !visible;
  }

  /**
   * Outline drawer（physical right / backdrop / focus 復帰）。
   * options.restoreFocus: 閉じるとき trigger へ focus を戻す（Escape / backdrop / jump）。
   */
  function setOutlineOpen(open, options) {
    var next = !!open && !!(outline && outlineToggle && !outlineToggle.disabled);
    if (next) setSettingsOpen(false);
    var restoreFocus = !!(options && options.restoreFocus);
    var wasOpen = outlineOpen;
    outlineOpen = next;
    if (!outline || !outlineToggle) return;
    if (outlineOpen) {
      outline.hidden = false;
      setBackdropVisible(true);
      outlineToggle.setAttribute('aria-expanded', 'true');
      showChrome(true);
      var firstItem = outline.querySelector('.nyoze-web-book-outline__item button');
      focusElement(firstItem || outline);
    } else {
      outline.hidden = true;
      setBackdropVisible(false);
      outlineToggle.setAttribute('aria-expanded', 'false');
      if (wasOpen && restoreFocus) focusElement(outlineToggle);
      scheduleHide();
    }
  }

  /** Settings popover（session-only、Outline とは排他）。 */
  function setSettingsOpen(open, options) {
    var next = !!open && !!(settings && settingsToggle);
    if (next && outlineOpen) setOutlineOpen(false);
    var restoreFocus = !!(options && options.restoreFocus);
    var wasOpen = settingsOpen;
    settingsOpen = next;
    if (!settings || !settingsToggle) return;
    if (settingsOpen) {
      settings.hidden = false;
      settingsToggle.setAttribute('aria-expanded', 'true');
      showChrome(true);
      var firstControl = settings.querySelector('button, select');
      focusElement(firstControl || settings);
    } else {
      settings.hidden = true;
      settingsToggle.setAttribute('aria-expanded', 'false');
      if (wasOpen && restoreFocus) focusElement(settingsToggle);
      scheduleHide();
    }
  }

  function isEditableTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    var el = target;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
      return true;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function isInChrome(el) {
    if (!el || el.nodeType !== 1) return false;
    if (chrome && chrome.contains(el)) return true;
    if (settings && settings.contains(el)) return true;
    if (outline && outline.contains(el)) return true;
    return false;
  }

  function focusIsInReaderBody() {
    var active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      return true;
    }
    if (isInChrome(active)) return false;
    if (active === root || active === viewport || active === flow) return true;
    if (viewport.contains(active)) return true;
    return false;
  }

  /* ============================================================
     WB-R13: tap / click / swipe page navigation + center chrome
     toggle. Pointer Events only, primary pointer only, single
     resolution point at pointerup. Adjacent navigation always goes
     through goBy(delta) — no separate pageIndex / transform / aria
     path. No transparent overlay DOM: delegation + coordinate math
     against the existing .nyoze-web-book-viewport rect.
     ============================================================ */

  /** chrome / Settings / Outline / backdrop / interactive controls / links / editable never start a gesture. */
  function isGestureExcludedTarget(el) {
    if (!el || el.nodeType !== 1) return true;
    if (isInChrome(el)) return true;
    if (backdrop && backdrop.contains(el)) return true;
    var node = el;
    while (node && node.nodeType === 1) {
      var tag = (node.tagName || '').toLowerCase();
      if (
        tag === 'button' || tag === 'input' || tag === 'select' ||
        tag === 'textarea' || tag === 'label' || tag === 'summary' || tag === 'a'
      ) {
        return true;
      }
      if (node.isContentEditable) return true;
      var role = node.getAttribute ? node.getAttribute('role') : null;
      if (role && GESTURE_INTERACTIVE_ROLES[role]) return true;
      node = node.parentElement;
    }
    return false;
  }

  /** mouse: primary button, no modifier keys (preserve context menu / modified click / text selection). */
  function isEligibleMouseGesture(event) {
    if (event.pointerType !== 'mouse') return true;
    if (event.button !== 0) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    return true;
  }

  function resetGestureTracking() {
    gesturePointerId = null;
    gesturePointerType = null;
    gestureCanceled = false;
  }

  /**
   * center third: toggle chrome without moving focus in, and without leaving
   * focus trapped when hiding. 'wasHidden' is a snapshot taken at gesture
   * start (pointerdown), not a live re-read here -- an incidental mousemove
   * that lands between pointerdown and pointerup (e.g. a synthetic click
   * that re-issues a move to the same coordinates) can otherwise reveal
   * chrome mid-gesture and flip this decision out from under the tap.
   */
  function toggleChromeFromGesture(wasHidden) {
    if (wasHidden) {
      showChrome(false);
      return;
    }
    clearHideTimer();
    if (isInChrome(document.activeElement)) {
      focusElement(viewport);
    }
    chromeHovered = false;
    chromeFocused = false;
    root.classList.add('nyoze-web-book-chrome-hidden');
  }

  /** left / center / right thirds of the reader viewport's physical width. Left/right reuse goBy(delta) only. */
  function handleZoneTap(clientX, chromeWasHiddenAtStart) {
    var rect = viewport.getBoundingClientRect();
    if (!rect || !(rect.width > 0)) return;
    var relativeX = clientX - rect.left;
    var third = rect.width / 3;
    if (relativeX < third) {
      goBy(isVertical ? 1 : -1);
      return;
    }
    if (relativeX > third * 2) {
      goBy(isVertical ? -1 : 1);
      return;
    }
    toggleChromeFromGesture(chromeWasHiddenAtStart);
  }

  /** swipe direction is zone-independent; horizontal is next/prev per writing mode. */
  function handleSwipeNavigation(dx) {
    var isLeftSwipe = dx < 0;
    if (isVertical) {
      goBy(isLeftSwipe ? -1 : 1);
    } else {
      goBy(isLeftSwipe ? 1 : -1);
    }
  }

  function onReaderPointerDown(event) {
    if (event.pointerId !== undefined) activePointerCount += 1;
    if (destroyed || isPrinting() || settingsOpen || outlineOpen) return;
    if (!event.isPrimary || activePointerCount > 1) {
      // A second concurrent pointer joined: cancel whatever gesture was tracked (pinch / multi-touch guard).
      if (gesturePointerId !== null) gestureCanceled = true;
      return;
    }
    if (!isEligibleMouseGesture(event)) return;
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (isGestureExcludedTarget(target)) return;
    if (target !== viewport && !viewport.contains(target)) return;

    gesturePointerId = event.pointerId;
    gesturePointerType = event.pointerType;
    gestureStartX = event.clientX;
    gestureStartY = event.clientY;
    gestureStartTime = event.timeStamp || Date.now();
    gestureCanceled = false;
    // Snapshot chrome visibility now — see toggleChromeFromGesture() for why
    // this must not be re-read live at pointerup.
    gestureChromeHiddenAtStart = root.classList.contains('nyoze-web-book-chrome-hidden');
    // Snapshot selection state now, not just at pointerup: a real mouse click
    // on Chromium collapses an existing (non-collapsed) selection as part of
    // its default pointerdown handling, so by pointerup the selection already
    // reads collapsed and a live-only check there would miss it entirely.
    var selectionAtStart = window.getSelection ? window.getSelection() : null;
    gestureHadSelectionAtStart = !!(selectionAtStart && !selectionAtStart.isCollapsed);
  }

  function onReaderPointerMove(event) {
    if (destroyed) return;
    if (gesturePointerId === null || event.pointerId !== gesturePointerId) return;
    if (gestureCanceled) return;
    // Never intercept mouse movement: preserve native text-selection drag.
    if (gesturePointerType === 'mouse') return;
    var dx = event.clientX - gestureStartX;
    var dy = event.clientY - gestureStartY;
    if (
      Math.abs(dx) >= GESTURE_SWIPE_MIN_DISTANCE_PX &&
      Math.abs(dx) > Math.abs(dy) * GESTURE_SWIPE_MIN_HORIZONTAL_RATIO
    ) {
      // Committed horizontal swipe: stop native scroll / edge-navigation from
      // fighting the gesture. Vertical-dominant movement is left alone so
      // scrolling, pinch zoom, and system edge gestures keep working.
      if (event.cancelable) event.preventDefault();
    }
  }

  function onReaderPointerUp(event) {
    if (event.pointerId !== undefined) activePointerCount = Math.max(0, activePointerCount - 1);
    if (gesturePointerId === null || event.pointerId !== gesturePointerId) return;
    var pointerType = gesturePointerType;
    var canceled = gestureCanceled;
    var startX = gestureStartX;
    var startY = gestureStartY;
    var chromeWasHiddenAtStart = gestureChromeHiddenAtStart;
    var hadSelectionAtStart = gestureHadSelectionAtStart;
    var endX = event.clientX;
    var endY = event.clientY;
    var elapsed = (event.timeStamp || Date.now()) - gestureStartTime;
    resetGestureTracking();
    if (destroyed || canceled) return;
    if (isPrinting() || settingsOpen || outlineOpen) return;

    // Never navigate away from an active text selection. Check both the
    // snapshot taken at pointerdown (a real click's default handling can
    // collapse the selection before pointerup fires — see onReaderPointerDown)
    // and the live state (covers a selection made mid-gesture).
    var selection = window.getSelection ? window.getSelection() : null;
    if (hadSelectionAtStart || (selection && !selection.isCollapsed)) return;

    var dx = endX - startX;
    var dy = endY - startY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (absDx < GESTURE_TAP_MAX_MOVEMENT_PX && absDy < GESTURE_TAP_MAX_MOVEMENT_PX) {
      // Small wiggle counts as a tap; a long press (held past the duration) does not.
      if (elapsed <= GESTURE_TAP_MAX_DURATION_MS) handleZoneTap(startX, chromeWasHiddenAtStart);
      return;
    }

    // Mouse drags never swipe-navigate (keeps desktop text selection intact).
    if (pointerType === 'mouse') return;

    if (
      absDx >= GESTURE_SWIPE_MIN_DISTANCE_PX &&
      absDx > absDy * GESTURE_SWIPE_MIN_HORIZONTAL_RATIO &&
      elapsed <= GESTURE_SWIPE_MAX_DURATION_MS
    ) {
      handleSwipeNavigation(dx);
    }
  }

  function onReaderPointerCancel(event) {
    if (event.pointerId !== undefined) activePointerCount = Math.max(0, activePointerCount - 1);
    if (gesturePointerId !== null && event.pointerId === gesturePointerId) {
      resetGestureTracking();
    }
  }

  document.addEventListener('pointerdown', onReaderPointerDown, { passive: true });
  document.addEventListener('pointermove', onReaderPointerMove, { passive: false });
  document.addEventListener('pointerup', onReaderPointerUp, { passive: true });
  document.addEventListener('pointercancel', onReaderPointerCancel, { passive: true });

  function applyScale(next) {
    fontScale = clampScale(next);
    root.style.setProperty('--wb-font-scale', String(fontScale));
    if (scaleStatus) {
      scaleStatus.textContent = Math.round(fontScale * 100) + '%';
    }
    if (scaleDecrease) scaleDecrease.disabled = fontScale <= MIN_SCALE;
    if (scaleIncrease) scaleIncrease.disabled = fontScale >= MAX_SCALE;
    queueMeasure();
  }

  function applyFont(key) {
    fontKey = key === 'gothic' ? 'gothic' : 'mincho';
    root.setAttribute('data-wb-font', fontKey);
    root.style.setProperty('--wb-font-family', FONT_FAMILIES[fontKey]);
    var buttons = document.querySelectorAll('button[data-wb-font]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = btn.getAttribute('data-wb-font') === fontKey;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    queueMeasure();
  }

  function normalizeHeadingFont(key) {
    if (key === 'mincho' || key === 'gothic' || key === 'same-as-body') return key;
    return 'same-as-body';
  }

  function applyHeadingFont(key) {
    headingFontKey = normalizeHeadingFont(key);
    root.setAttribute('data-wb-heading-font', headingFontKey);
    var buttons = document.querySelectorAll('button[data-wb-heading-font]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = btn.getAttribute('data-wb-heading-font') === headingFontKey;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    requestLayoutReflow();
  }

  function applyTheme(key) {
    var allowed = { light: 1, dark: 1, paper: 1, classic: 1 };
    if (hasAuthorPalette) allowed.author = 1;
    themeKey = allowed[key] ? key : defaultTheme;
    root.setAttribute('data-wb-theme', themeKey);
    if (themeSelect && themeSelect.value !== themeKey) {
      themeSelect.value = themeKey;
    }
  }

  function syncWritingModeControls() {
    var buttons = document.querySelectorAll('button[data-wb-writing-mode]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var active = button.getAttribute('data-wb-writing-mode') === writingMode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  /**
   * compact chrome は物理的な左右を読み進行に合わせる。
   * DOM 順も入れ替えるため、見た目と支援技術の操作順が食い違わない。
   */
  function syncPageNavigationControls() {
    if (!prevBtn || !nextBtn || !statusEl || !prevBtn.parentNode) return;
    var nav = prevBtn.parentNode;
    prevBtn.setAttribute('aria-label', '前のページ');
    prevBtn.setAttribute('title', '前のページ');
    nextBtn.setAttribute('aria-label', '次のページ');
    nextBtn.setAttribute('title', '次のページ');
    if (isVertical) {
      nextBtn.textContent = '◀';
      prevBtn.textContent = '▶';
      nav.insertBefore(nextBtn, nav.firstChild);
      nav.appendChild(prevBtn);
      return;
    }
    prevBtn.textContent = '◀';
    nextBtn.textContent = '▶';
    nav.insertBefore(prevBtn, nav.firstChild);
    nav.appendChild(nextBtn);
  }

  function applyWritingMode(next, deferReflow) {
    var normalized = normalizeWritingMode(next);
    if (writingMode === normalized) {
      syncWritingModeControls();
      syncPageNavigationControls();
      return false;
    }
    writingMode = normalized;
    isVertical = writingMode === 'vertical-rl';
    root.setAttribute('data-wb-writing-mode', writingMode);
    root.classList.remove('nyoze-writing-mode-vertical-rl', 'nyoze-writing-mode-horizontal-tb');
    root.classList.add('nyoze-writing-mode-' + writingMode);
    if (html) html.setAttribute('data-writing-mode', writingMode);
    syncWritingModeControls();
    syncPageNavigationControls();
    if (!deferReflow) requestLayoutReflow();
    return true;
  }

  function applyPageInsetTop(next, deferReflow) {
    var normalized = normalizePageInset(next, INSET_TOP_DEFAULT);
    if (pageInsetTop === normalized) {
      if (pageInsetTopSelect && pageInsetTopSelect.value !== String(normalized)) {
        pageInsetTopSelect.value = String(normalized);
      }
      return false;
    }
    pageInsetTop = normalized;
    root.setAttribute('data-wb-page-inset-top', String(pageInsetTop));
    root.style.setProperty('--wb-page-inset-top', String(pageInsetTop) + 'px');
    if (pageInsetTopSelect && pageInsetTopSelect.value !== String(pageInsetTop)) {
      pageInsetTopSelect.value = String(pageInsetTop);
    }
    if (!deferReflow) requestLayoutReflow();
    return true;
  }

  function applyPageInsetBottom(next, deferReflow) {
    var normalized = normalizePageInset(next, INSET_BOTTOM_DEFAULT);
    if (pageInsetBottom === normalized) {
      if (pageInsetBottomSelect && pageInsetBottomSelect.value !== String(normalized)) {
        pageInsetBottomSelect.value = String(normalized);
      }
      return false;
    }
    pageInsetBottom = normalized;
    root.setAttribute('data-wb-page-inset-bottom', String(pageInsetBottom));
    root.style.setProperty('--wb-page-inset-bottom', String(pageInsetBottom) + 'px');
    if (pageInsetBottomSelect && pageInsetBottomSelect.value !== String(pageInsetBottom)) {
      pageInsetBottomSelect.value = String(pageInsetBottom);
    }
    if (!deferReflow) requestLayoutReflow();
    return true;
  }

  function applyPageInsetInline(next, deferReflow) {
    var normalized = normalizePageInset(next, INSET_INLINE_DEFAULT);
    if (pageInsetInline === normalized) {
      if (pageInsetInlineSelect && pageInsetInlineSelect.value !== String(normalized)) {
        pageInsetInlineSelect.value = String(normalized);
      }
      return false;
    }
    pageInsetInline = normalized;
    root.setAttribute('data-wb-page-inset-inline', String(pageInsetInline));
    root.style.setProperty('--wb-page-inset-inline', String(pageInsetInline) + 'px');
    if (pageInsetInlineSelect && pageInsetInlineSelect.value !== String(pageInsetInline)) {
      pageInsetInlineSelect.value = String(pageInsetInline);
    }
    if (!deferReflow) requestLayoutReflow();
    return true;
  }

  function applyPaperFrame(next, deferReflow) {
    var normalized = !!next;
    if (paperFrame === normalized) {
      if (paperFrameButton) paperFrameButton.setAttribute('aria-pressed', normalized ? 'true' : 'false');
      return false;
    }
    paperFrame = normalized;
    root.setAttribute('data-wb-paper-frame', paperFrame ? 'on' : 'off');
    if (paperFrameButton) paperFrameButton.setAttribute('aria-pressed', paperFrame ? 'true' : 'false');
    if (!deferReflow) requestLayoutReflow();
    return true;
  }

  function syncFurnitureControlAvailability() {
    if (headerAlignSelect) headerAlignSelect.disabled = !headerEnabled;
    if (headerShowTitleButton) headerShowTitleButton.disabled = !headerEnabled;
    if (headerShowAuthorButton) headerShowAuthorButton.disabled = !headerEnabled;
    if (footerAlignSelect) footerAlignSelect.disabled = !footerEnabled;
  }

  function applyHeaderEnabled(next) {
    var normalized = !!next;
    if (headerEnabled === normalized) {
      if (headerEnabledButton) headerEnabledButton.setAttribute('aria-pressed', normalized ? 'true' : 'false');
      syncFurnitureControlAvailability();
      return false;
    }
    headerEnabled = normalized;
    root.setAttribute('data-wb-header-enabled', normalized ? 'on' : 'off');
    if (headerEnabledButton) headerEnabledButton.setAttribute('aria-pressed', normalized ? 'true' : 'false');
    syncFurnitureControlAvailability();
    return true;
  }

  function applyHeaderAlign(next) {
    headerAlign = normalizeFurnitureAlign(next);
    root.setAttribute('data-wb-header-align', headerAlign);
    if (headerAlignSelect && headerAlignSelect.value !== headerAlign) headerAlignSelect.value = headerAlign;
  }

  function applyHeaderShowTitle(next) {
    headerShowTitle = !!next;
    root.setAttribute('data-wb-header-show-title', headerShowTitle ? 'on' : 'off');
    if (headerShowTitleButton) headerShowTitleButton.setAttribute('aria-pressed', headerShowTitle ? 'true' : 'false');
  }

  function applyHeaderShowAuthor(next) {
    headerShowAuthor = !!next;
    root.setAttribute('data-wb-header-show-author', headerShowAuthor ? 'on' : 'off');
    if (headerShowAuthorButton) headerShowAuthorButton.setAttribute('aria-pressed', headerShowAuthor ? 'true' : 'false');
  }

  function applyFooterEnabled(next) {
    var normalized = !!next;
    if (footerEnabled === normalized) {
      if (footerEnabledButton) footerEnabledButton.setAttribute('aria-pressed', normalized ? 'true' : 'false');
      syncFurnitureControlAvailability();
      return false;
    }
    footerEnabled = normalized;
    root.setAttribute('data-wb-footer-enabled', normalized ? 'on' : 'off');
    if (footerEnabledButton) footerEnabledButton.setAttribute('aria-pressed', normalized ? 'true' : 'false');
    syncFurnitureControlAvailability();
    return true;
  }

  function applyFooterAlign(next) {
    footerAlign = normalizeFurnitureAlign(next);
    root.setAttribute('data-wb-footer-align', footerAlign);
    if (footerAlignSelect && footerAlignSelect.value !== footerAlign) footerAlignSelect.value = footerAlign;
  }

  function readChapterTitles() {
    var map = {};
    var island = document.getElementById('nyoze-web-book-chapter-titles');
    if (!island) return map;
    var spans = island.querySelectorAll('[data-wb-chapter]');
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var n = Number(span.getAttribute('data-wb-chapter'));
      if (!isFinite(n) || n < 1) continue;
      map[n] = span.getAttribute('data-wb-title') || '';
    }
    return map;
  }

  function chapterFromHeadingId(id) {
    var match = /^wb-c(\\d+)-/.exec(id || '');
    if (!match) return 0;
    return Number(match[1]) || 0;
  }

  function buildOutline() {
    if (!outline || !outlineToggle) return;
    var headings = flow.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
    outline.innerHTML = '';
    if (!headings.length) {
      outlineToggle.disabled = true;
      outlineToggle.hidden = true;
      outline.hidden = true;
      outlineOpen = false;
      setBackdropVisible(false);
      return;
    }

    outlineToggle.disabled = false;
    outlineToggle.hidden = false;

    var title = document.createElement('h2');
    title.className = 'nyoze-web-book-outline__title';
    title.textContent = '目次';
    outline.appendChild(title);

    var list = document.createElement('ul');
    list.className = 'nyoze-web-book-outline__list';
    outline.appendChild(list);

    var chapterTitles = readChapterTitles();
    var lastChapter = 0;

    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];
      var id = heading.getAttribute('id') || '';
      if (!id) continue;
      var level = Number((heading.tagName || 'H1').replace(/H/i, '')) || 1;
      level = Math.min(6, Math.max(1, level));
      var chapter = chapterFromHeadingId(id);

      if (chapter > 0 && chapter !== lastChapter) {
        lastChapter = chapter;
        var chapterLi = document.createElement('li');
        chapterLi.className = 'nyoze-web-book-outline__chapter';
        chapterLi.textContent = chapterTitles[chapter] || ('Chapter ' + chapter);
        list.appendChild(chapterLi);
      }

      var li = document.createElement('li');
      li.className = 'nyoze-web-book-outline__item nyoze-web-book-outline__level-' + level;
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-wb-outline-target', id);
      button.textContent = (heading.textContent || '').replace(/\\s+/g, ' ').trim() || id;
      button.addEventListener('click', function (event) {
        var targetId = event.currentTarget.getAttribute('data-wb-outline-target');
        jumpToHeadingId(targetId);
        setOutlineOpen(false, { restoreFocus: true });
      });
      li.appendChild(button);
      list.appendChild(li);
    }
  }

  function clearHideTimer() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function showChrome(forceKeep) {
    root.classList.remove('nyoze-web-book-chrome-hidden');
    clearHideTimer();
    if (!forceKeep) scheduleHide();
  }

  function scheduleHide() {
    clearHideTimer();
    if (outlineOpen || settingsOpen || chromeHovered || chromeFocused) return;
    hideTimer = setTimeout(function () {
      hideTimer = null;
      if (outlineOpen || settingsOpen || chromeHovered || chromeFocused) return;
      root.classList.add('nyoze-web-book-chrome-hidden');
    }, HIDE_DELAY_MS);
  }

  function syncChromeFocusState() {
    var active = document.activeElement;
    chromeFocused = !!(active && isInChrome(active));
    if (chromeFocused || outlineOpen || settingsOpen) {
      showChrome(true);
    } else {
      scheduleHide();
    }
  }

  function resetReader() {
    applyScale(1);
    applyFont('mincho');
    applyHeadingFont(initialHeadingFont);
    applyTheme(defaultTheme);
    var layoutChanged = false;
    layoutChanged = applyWritingMode(initialWritingMode, true) || layoutChanged;
    layoutChanged = applyPageInsetTop(INSET_TOP_DEFAULT, true) || layoutChanged;
    layoutChanged = applyPageInsetBottom(INSET_BOTTOM_DEFAULT, true) || layoutChanged;
    layoutChanged = applyPageInsetInline(INSET_INLINE_DEFAULT, true) || layoutChanged;
    layoutChanged = applyPaperFrame(true, true) || layoutChanged;
    applyHeaderEnabled(true);
    applyHeaderAlign('left');
    applyHeaderShowTitle(true);
    applyHeaderShowAuthor(false);
    applyFooterEnabled(true);
    applyFooterAlign('right');
    applyTransitionMode(TRANSITION_DEFAULT_MODE);
    applyTransitionSpeed(TRANSITION_SPEED_DEFAULT_MS);
    if (layoutChanged) requestLayoutReflow();
    showChrome(true);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      goBy(-1);
      showChrome(false);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      goBy(1);
      showChrome(false);
    });
  }

  if (scaleDecrease) {
    scaleDecrease.addEventListener('click', function () {
      applyScale(fontScale - SCALE_STEP);
    });
  }
  if (scaleIncrease) {
    scaleIncrease.addEventListener('click', function () {
      applyScale(fontScale + SCALE_STEP);
    });
  }

  var fontButtons = document.querySelectorAll('button[data-wb-font]');
  for (var fi = 0; fi < fontButtons.length; fi++) {
    fontButtons[fi].addEventListener('click', function (event) {
      applyFont(event.currentTarget.getAttribute('data-wb-font'));
    });
  }

  var headingFontButtons = document.querySelectorAll('button[data-wb-heading-font]');
  for (var hfi = 0; hfi < headingFontButtons.length; hfi++) {
    headingFontButtons[hfi].addEventListener('click', function (event) {
      applyHeadingFont(event.currentTarget.getAttribute('data-wb-heading-font'));
    });
  }

  var writingModeButtons = document.querySelectorAll('button[data-wb-writing-mode]');
  for (var wi = 0; wi < writingModeButtons.length; wi++) {
    writingModeButtons[wi].addEventListener('click', function (event) {
      applyWritingMode(event.currentTarget.getAttribute('data-wb-writing-mode'));
    });
  }

  if (pageInsetTopSelect) {
    pageInsetTopSelect.addEventListener('change', function () {
      applyPageInsetTop(pageInsetTopSelect.value);
    });
  }

  if (pageInsetBottomSelect) {
    pageInsetBottomSelect.addEventListener('change', function () {
      applyPageInsetBottom(pageInsetBottomSelect.value);
    });
  }

  if (pageInsetInlineSelect) {
    pageInsetInlineSelect.addEventListener('change', function () {
      applyPageInsetInline(pageInsetInlineSelect.value);
    });
  }

  if (paperFrameButton) {
    paperFrameButton.addEventListener('click', function () {
      applyPaperFrame(!paperFrame);
    });
  }

  if (headerEnabledButton) {
    headerEnabledButton.addEventListener('click', function () {
      applyHeaderEnabled(!headerEnabled);
    });
  }
  if (headerAlignSelect) {
    headerAlignSelect.addEventListener('change', function () {
      applyHeaderAlign(headerAlignSelect.value);
    });
  }
  if (headerShowTitleButton) {
    headerShowTitleButton.addEventListener('click', function () {
      applyHeaderShowTitle(!headerShowTitle);
    });
  }
  if (headerShowAuthorButton) {
    headerShowAuthorButton.addEventListener('click', function () {
      applyHeaderShowAuthor(!headerShowAuthor);
    });
  }
  if (footerEnabledButton) {
    footerEnabledButton.addEventListener('click', function () {
      applyFooterEnabled(!footerEnabled);
    });
  }
  if (footerAlignSelect) {
    footerAlignSelect.addEventListener('change', function () {
      applyFooterAlign(footerAlignSelect.value);
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', function () {
      applyTheme(themeSelect.value);
    });
  }

  if (transitionSelect) {
    transitionSelect.addEventListener('change', function () {
      applyTransitionMode(transitionSelect.value);
    });
  }

  if (transitionSpeedRange) {
    transitionSpeedRange.addEventListener('input', function () {
      applyTransitionSpeed(transitionSpeedRange.value);
    });
    transitionSpeedRange.addEventListener('change', function () {
      applyTransitionSpeed(transitionSpeedRange.value);
    });
  }

  if (reducedMotionMedia) {
    var onReducedMotionChange = function (event) {
      if (event.matches) cancelTransition();
    };
    if (reducedMotionMedia.addEventListener) {
      reducedMotionMedia.addEventListener('change', onReducedMotionChange);
    } else if (reducedMotionMedia.addListener) {
      reducedMotionMedia.addListener(onReducedMotionChange);
    }
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      resetReader();
    });
  }

  if (outlineToggle) {
    outlineToggle.addEventListener('click', function () {
      setOutlineOpen(!outlineOpen, { restoreFocus: true });
    });
  }

  if (settingsToggle) {
    settingsToggle.addEventListener('click', function () {
      setSettingsOpen(!settingsOpen, { restoreFocus: true });
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', function () {
      if (outlineOpen) setOutlineOpen(false, { restoreFocus: true });
    });
  }

  // Settings popover: 外側 pointer 操作で閉じる（focus は pointer 先へ自然に移る）。
  document.addEventListener(
    'pointerdown',
    function (event) {
      if (!settingsOpen || !settings) return;
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (settings.contains(target)) return;
      if (settingsToggle && (settingsToggle === target || settingsToggle.contains(target))) return;
      setSettingsOpen(false);
    },
    true,
  );

  // Outline drawer: Tab を drawer 内で循環させる（modal drawer の focus trap）。
  if (outline) {
    outline.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !outlineOpen) return;
      var focusables = outline.querySelectorAll('button');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  flow.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href^="#"]') : null;
    if (!anchor || !flow.contains(anchor)) return;
    if (!anchor.classList.contains('nyoze-toc') && !anchor.closest('.nyoze-toc')) return;
    var href = anchor.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return;
    var id = href.slice(1);
    if (!id) return;
    event.preventDefault();
    jumpToHeadingId(decodeURIComponent(id));
    showChrome(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false, { restoreFocus: true });
        return;
      }
      if (outlineOpen) {
        event.preventDefault();
        setOutlineOpen(false, { restoreFocus: true });
        return;
      }
    }

    if (event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableTarget(event.target)) return;
    if (!focusIsInReaderBody()) return;

    var key = event.key;
    if (key === 'PageDown') {
      event.preventDefault();
      goBy(1);
      return;
    }
    if (key === 'PageUp') {
      event.preventDefault();
      goBy(-1);
      return;
    }
    if (key === 'Home') {
      event.preventDefault();
      navigateWithoutTransition(0);
      return;
    }
    if (key === 'End') {
      event.preventDefault();
      navigateWithoutTransition(pageCount - 1);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      goBy(isVertical ? 1 : -1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      goBy(isVertical ? -1 : 1);
      return;
    }
  });

  // WB-R13: pointerdown / touchstart no longer force-reveal chrome here —
  // that used to fight the explicit center tap/click toggle and the "side
  // tap/swipe must not change chrome visibility" contract. mousemove / scroll
  // keep the existing desktop reveal-on-activity behavior.
  ;['mousemove', 'scroll'].forEach(function (name) {
    document.addEventListener(
      name,
      function () {
        showChrome(false);
      },
      { passive: true },
    );
  });

  // ページ送り key は chrome を起こさない。他の keyboard activity は従来どおり
  // auto-hide を解除する（dialog / control の focus 契約は focusin 側が保持する）。
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (
      key === 'PageDown' ||
      key === 'PageUp' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'Home' ||
      key === 'End'
    ) return;
    showChrome(false);
  }, { passive: true });

  var chromeNodes = document.querySelectorAll('[data-wb-chrome], .nyoze-web-book-outline');
  for (var ci = 0; ci < chromeNodes.length; ci++) {
    chromeNodes[ci].addEventListener('mouseenter', function () {
      chromeHovered = true;
      showChrome(true);
    });
    chromeNodes[ci].addEventListener('mouseleave', function () {
      chromeHovered = false;
      scheduleHide();
    });
  }
  document.addEventListener('focusin', syncChromeFocusState);
  document.addEventListener('focusout', function () {
    setTimeout(syncChromeFocusState, 0);
  });

  function beginPrint() {
    // printing フラグを立てる前に演出を中断し、print へ animation / timer /
    // class を残さない（fade の保留切替はここで確定する）。
    cancelTransition();
    printing = true;
    clearHideTimer();
    root.classList.remove('nyoze-web-book-chrome-hidden');
  }

  function finishPrint() {
    printing = false;
    queueMeasure();
    scheduleHide();
  }

  window.addEventListener('beforeprint', beginPrint);
  window.addEventListener('afterprint', finishPrint);
  if (printMedia) {
    var onPrintMediaChange = function (event) {
      if (event.matches) {
        beginPrint();
      } else {
        finishPrint();
      }
    };
    if (printMedia.addEventListener) {
      printMedia.addEventListener('change', onPrintMediaChange);
    } else if (printMedia.addListener) {
      printMedia.addListener(onPrintMediaChange);
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function () {
      queueMeasure();
    });
    ro.observe(viewport);
  }
  window.addEventListener('pagehide', function () {
    destroyed = true;
    cancelTransition();
    clearHideTimer();
    resetGestureTracking();
    activePointerCount = 0;
    if (typeof ro !== 'undefined' && ro) ro.disconnect();
  });
  window.addEventListener('resize', queueMeasure);

  flow.querySelectorAll('img').forEach(function (img) {
    if (img.complete) return;
    img.addEventListener('load', queueMeasure);
    img.addEventListener('error', queueMeasure);
  });

  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(function () {
      queueMeasure();
    }).catch(function () {});
  }

  applyTheme(root.getAttribute('data-wb-theme') || defaultTheme);
  applyFont(root.getAttribute('data-wb-font') || 'mincho');
  applyHeadingFont(headingFontKey);
  syncWritingModeControls();
  syncPageNavigationControls();
  applyPageInsetTop(pageInsetTop, true);
  applyPageInsetBottom(pageInsetBottom, true);
  applyPageInsetInline(pageInsetInline, true);
  // モバイル環境（coarse pointer かつ短辺600px以下）では、書き出し時に埋め込まれた
  // 既定値（常に "on"）より優先して用紙枠を初期 OFF にする。applyPaperFrame
  // 経由で DOM attribute / aria-pressed も一緒に更新させるため、ここでは
  // 呼び出し引数だけを差し替える（paperFrame 変数を直接書き換えない）。
  applyPaperFrame(isMobileNarrowViewport() ? false : paperFrame, true);
  applyHeaderEnabled(headerEnabled);
  applyHeaderAlign(headerAlign);
  applyHeaderShowTitle(headerShowTitle);
  applyHeaderShowAuthor(headerShowAuthor);
  applyFooterEnabled(footerEnabled);
  applyFooterAlign(footerAlign);
  setTransitionStateAttr('idle');
  root.setAttribute('data-wb-transition-generation', '0');
  applyTransitionMode(transitionMode);
  applyTransitionSpeed(transitionSpeedMs);
  applyScale(1);
  buildOutline();
  setOutlineOpen(false);
  setSettingsOpen(false);

  viewport.setAttribute('tabindex', '0');
  measure();
  showChrome(false);
  try {
    viewport.focus({ preventScroll: true });
  } catch (e) {
    viewport.focus();
  }
})();`
}
