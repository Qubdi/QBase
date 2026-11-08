// Runs before the app. When the browser is too old for QBase (Safari before 16.4,
// Chrome or Edge before 111, Firefox before 114) it shows a short notice instead of
// a blank page. Plain old-style JavaScript on purpose: this file has to run in the
// browsers it is warning. It uses no eval, so the page's script policy allows it.
(function () {
    var supported;
    try {
        supported =
            typeof structuredClone === 'function' &&
            typeof Array.prototype.at === 'function' &&
            typeof Array.prototype.findLast === 'function' &&
            typeof Object.hasOwn === 'function' &&
            typeof ResizeObserver === 'function';
        // look-behind in regular expressions arrived in Safari 16.4
        new RegExp('(?<=a)b');
    } catch (problem) {
        void problem;
        supported = false;
    }
    if (supported) return;

    window.__qbaseUnsupported = true;

    var messages = {
        en: 'QBase needs a newer browser. Please update to Safari 16.4 or newer, or use a current version of Chrome, Edge or Firefox.',
        ru: 'Для QBase нужен более новый браузер. Обновите Safari до версии 16.4 или новее либо используйте актуальную версию Chrome, Edge или Firefox.',
        de: 'QBase benötigt einen neueren Browser. Bitte aktualisieren Sie auf Safari 16.4 oder neuer oder verwenden Sie eine aktuelle Version von Chrome, Edge oder Firefox.',
        it: 'QBase richiede un browser più recente. Aggiornare a Safari 16.4 o successivo oppure usare una versione aggiornata di Chrome, Edge o Firefox.',
        fr: 'QBase nécessite un navigateur plus récent. Veuillez passer à Safari 16.4 ou plus récent, ou utiliser une version à jour de Chrome, Edge ou Firefox.',
    };

    function show() {
        var language = String(
            (navigator.languages && navigator.languages[0]) ||
                navigator.language ||
                'en'
        )
            .toLowerCase()
            .split(/[-_]/)[0];
        var text = messages[language] || messages.en;
        var root = document.getElementById('root') || document.body;
        var box = document.createElement('div');
        box.setAttribute('role', 'alert');
        box.style.cssText =
            'max-width:32rem;margin:20vh auto 0;padding:1.5rem;font:16px/1.5 system-ui,sans-serif;text-align:center';
        box.textContent = text;
        root.textContent = '';
        root.appendChild(box);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', show);
    } else {
        show();
    }
})();
