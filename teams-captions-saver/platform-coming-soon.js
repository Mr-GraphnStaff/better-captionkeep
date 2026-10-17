const SUPPORTED_PLATFORMS = Object.freeze({
    zoom: 'Zoom Web',
    meet: 'Google Meet'
});

function getPlatform() {
    const key = new URLSearchParams(window.location.search).get('platform');
    return SUPPORTED_PLATFORMS[key] || 'This meeting platform';
}

function initializeComingSoonPage() {
    const platform = getPlatform();
    const supported = Object.values(SUPPORTED_PLATFORMS).includes(platform);
    document.title = `${platform} · Better CaptionKeep 6.0`;
    document.getElementById('platform-name').textContent = supported
        ? `${platform} is supported in 6.0`
        : `${platform} is not supported yet`;
    document.getElementById('platform-message').textContent =
        supported
            ? `Open ${platform} from the Better CaptionKeep popup, join a meeting, and live transcript capture starts automatically.`
            : 'Use Microsoft Teams, Google Meet, or Zoom Web for live transcript capture.';
    document.getElementById('close-button').addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', initializeComingSoonPage);
