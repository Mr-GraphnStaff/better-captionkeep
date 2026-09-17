const UPCOMING_PLATFORMS = Object.freeze({
    zoom: 'Zoom',
    meet: 'Google Meet'
});

function getUpcomingPlatform() {
    const key = new URLSearchParams(window.location.search).get('platform');
    return UPCOMING_PLATFORMS[key] || 'More meeting platforms';
}

function initializeComingSoonPage() {
    const platform = getUpcomingPlatform();
    document.title = `${platform} · Coming soon · Better CaptionKeep`;
    document.getElementById('platform-name').textContent = `${platform} is coming in 5.0`;
    document.getElementById('platform-message').textContent =
        `${platform} capture is on the roadmap. Microsoft Teams capture remains available today.`;
    document.getElementById('close-button').addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', initializeComingSoonPage);
