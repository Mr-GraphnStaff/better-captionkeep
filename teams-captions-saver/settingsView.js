(() => {
    if (new URL(location.href).searchParams.get('view') !== 'settings') return;
    document.documentElement.dataset.view = 'settings';
    document.title = 'Better CaptionKeep — All settings';
    const openSectionFromHash = ({scroll = true} = {}) => {
        const requestedId = location.hash === '#microsoft365' ? 'graphTranscriptSection' : decodeURIComponent(location.hash.slice(1));
        const target = requestedId ? document.getElementById(requestedId) : null;
        if (target instanceof HTMLDetailsElement) target.open = true;
        if (scroll && target) target.scrollIntoView({block:'start'});
    };
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.settings-cockpit-nav a[href^="#"]').forEach(link => {
            link.addEventListener('click', () => requestAnimationFrame(() => openSectionFromHash()));
        });
        window.addEventListener('hashchange', () => openSectionFromHash());
        if (location.hash) requestAnimationFrame(() => openSectionFromHash());
    });
})();
