(() => {
    if (new URL(location.href).searchParams.get('view') !== 'settings') return;
    document.documentElement.dataset.view = 'settings';
    document.title = 'Better CaptionKeep — All settings';
})();
