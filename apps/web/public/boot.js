// Pre-paint bootstrap. This is the only script the document runs before the
// app bundle, and it lives in its own file so the page can ship
// `script-src 'self'` with no 'unsafe-inline' (see public/_headers). It is a
// classic blocking script on purpose: a module script is deferred, and the
// whole point is to run before first paint.
//
// 1. Resolve the theme BEFORE first paint. This is a client-rendered SPA, so
//    next-themes can only add the `dark` class once React has mounted; every
//    full page load otherwise painted one frame with the light tokens and then
//    flipped — most visibly on any active segment pill (`bg-foreground
//    text-background`), which read as a flash of white text turning black on
//    every tab strip at once. Kept in sync with next-themes' defaults:
//    storageKey "theme", attribute "class", defaultTheme "system".
//
// 2. Suppress transitions until the stylesheet has actually landed. In dev,
//    Vite injects the app CSS from JavaScript, so elements can paint before
//    Tailwind applies and the correction is then *animated* by the controls'
//    `transition-*`. Production ships a blocking <link> and never has the gap,
//    but the guard costs nothing once removed. Paired with the `.tt-preload`
//    rule in index.html's <style>.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored && stored !== "system"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = theme;

    var de = document.documentElement;
    de.classList.add("tt-preload");
    var release = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { de.classList.remove("tt-preload"); });
      });
    };
    if (document.readyState === "complete") release();
    else window.addEventListener("load", release, { once: true });
  } catch (e) {}
})();
