// Sets the theme before the first paint so there is no flash. It lives in a
// file, not inline in index.html, so the Content-Security-Policy can say
// script-src 'self' without allowing inline scripts.
(function () {
    try {
        var t = localStorage.getItem('theme') || 'system';
        var dark =
            t === 'dark' ||
            (t === 'system' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark) document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    } catch {
        // storage or matchMedia unavailable: keep the default look
    }
})();
