(() => {
    'use strict';

    const HOST_NAME = 'com.daftech.bettercaptionkeep.adminsetup';
    // The versioned release asset was downloaded anonymously and its SHA-256,
    // public-trust publisher signature and timestamp were verified before enabling.
    const INSTALLER_RELEASE = Object.freeze({
        available: true,
        updateAvailable: true,
        url: 'https://github.com/Mr-GraphnStaff/better-captionkeep/releases/download/admin-setup-v6.0.3/BetterCaptionKeep-AdministratorSetup-6.0.3-win-x64.exe'
    });
    const NATIVE_TIMEOUT_MS = 15000;

    function setupError(code, message) {
        return Object.assign(new Error(message), {code});
    }

    function missingHost(error) {
        return error?.code === 'setup-not-installed' ||
            /native messaging host.*not found|specified native messaging host/i.test(String(error?.message || ''));
    }

    function api() {
        return globalThis.chrome;
    }

    function safeMessage(error) {
        const text = String(error?.message || '');
        if (/Close the existing Better CaptionKeep Administrator Setup window/i.test(text)) return text;
        if (/permission/i.test(text)) return 'Browser permission was not approved. No organization changes were made.';
        if (error?.code === 'native-timeout') return 'Administrator Setup did not respond. Check for an open setup window before trying again.';
        return 'Organization setup could not be opened. No organization changes were made.';
    }

    async function requestNativeMessaging() {
        const browserApi = api();
        if (!browserApi?.permissions?.request) {
            throw new Error('Browser permissions API unavailable.');
        }
        const request = {permissions: ['nativeMessaging']};
        // Call directly within the click gesture. Awaiting contains() first can
        // lose user activation before a browser presents its permission prompt.
        return await new Promise((resolve, reject) => {
            browserApi.permissions.request(request, granted => {
                const error = browserApi.runtime.lastError;
                if (error) reject(new Error('Browser permission could not be approved.'));
                else resolve(granted === true);
            });
        });
    }

    async function launchSetup(status, isCurrent = () => true) {
        const browserApi = api();
        status.textContent = 'Opening Administrator Setup. Approve the browser permission if prompted…';
        const granted = await requestNativeMessaging();
        if (!isCurrent()) return;
        if (!granted) throw new Error('Native messaging permission was not approved.');
        const message = {
            protocolVersion: 1,
            operation: 'launch',
            source: 'extension-settings',
            mode: 'real',
            extensionId: browserApi.runtime.id,
            extensionVersion: browserApi.runtime.getManifest().version
        };
        const response = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(setupError('native-timeout', 'Native host timed out.')), NATIVE_TIMEOUT_MS);
            try {
                browserApi.runtime.sendNativeMessage(HOST_NAME, message, result => {
                    const error = browserApi.runtime.lastError;
                    clearTimeout(timer);
                    if (error) reject(new Error(error.message || 'Native messaging failed.'));
                    else resolve(result);
                });
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
        if (!isCurrent()) return;
        if (response?.protocolVersion !== 1 || response.operation !== 'launch') {
            throw new Error('Organization setup returned an invalid response.');
        }
        if (response?.error === 'setup-not-installed') {
            throw setupError('setup-not-installed', 'Administrator Setup is not installed.');
        }
        if (response?.error === 'setup-instance-conflict') {
            throw new Error('Close the existing Better CaptionKeep Administrator Setup window, then try again.');
        }
        if (!response.ok) {
            throw new Error('Organization setup returned an invalid response.');
        }
        status.textContent = 'Organization setup opened. Continue in the setup window.';
    }

    function initialize() {
        const button = document.getElementById('launchOrganizationSetup');
        const status = document.getElementById('organizationSetupStatus');
        const cancel = document.getElementById('cancelOrganizationSetup');
        const update = document.getElementById('updateOrganizationSetup');
        if (!button || !status || !cancel || !update) return;
        let state = 'ready';
        let generation = 0;
        let updating = false;

        function showUpdateAction() {
            update.hidden = state !== 'ready' || !INSTALLER_RELEASE.available || !INSTALLER_RELEASE.updateAvailable;
            update.disabled = update.hidden;
        }

        function installationRequired(afterDownload = false) {
            state = afterDownload ? 'waiting-install' : 'install-required';
            button.textContent = afterDownload ? 'Continue setup' : 'Download and install';
            button.disabled = !afterDownload && !INSTALLER_RELEASE.available;
            cancel.hidden = false;
            showUpdateAction();
            status.textContent = afterDownload
                ? updating
                    ? 'The update download has started. When it finishes, close Administrator Setup, open the installer and complete installation, then choose Continue setup. Windows may ask you to approve installation.'
                    : 'The installer download has started. When it finishes, open the installer and complete installation, then choose Continue setup. Windows may ask you to approve installation.'
                : INSTALLER_RELEASE.available
                    ? 'Administrator Setup needs a one-time installation on this Windows PC. Choose Download and install, then open the installer. Choose Cancel to stop.'
                    : 'Administrator Setup is not installed. The signed installer has not been released yet, so installation cannot start. Choose Cancel to return.';
            if (afterDownload || INSTALLER_RELEASE.available) button.focus();
            else cancel.focus();
        }

        cancel.addEventListener('click', () => {
            generation += 1;
            state = 'ready';
            updating = false;
            button.disabled = false;
            button.textContent = 'Open administrator setup';
            cancel.hidden = true;
            showUpdateAction();
            status.textContent = 'Administrator setup cancelled. You can start again when ready.';
            button.focus();
        });

        async function performAction(action = state) {
            if (button.disabled) return;
            if (action === 'update' && (!INSTALLER_RELEASE.available || !INSTALLER_RELEASE.updateAvailable)) return;
            const attempt = ++generation;
            const isCurrent = () => generation === attempt;
            button.disabled = true;
            cancel.hidden = false;
            state = 'checking';
            updating = action === 'update' || updating;
            showUpdateAction();
            try {
                if (action === 'install-required' || action === 'update') {
                    if (!INSTALLER_RELEASE.available) return;
                    status.textContent = updating ? 'Starting the setup update download…' : 'Starting the installer download…';
                    await new Promise((resolve, reject) => {
                        api().downloads.download({url: INSTALLER_RELEASE.url, saveAs: false}, downloadId => {
                            const error = api().runtime.lastError;
                            if (error || !Number.isInteger(downloadId)) reject(setupError('download-failed', 'The installer download could not start.'));
                            else resolve(downloadId);
                        });
                    });
                    if (isCurrent()) installationRequired(true);
                    return;
                }
                await launchSetup(status, isCurrent);
                if (isCurrent()) {
                    state = 'ready';
                    updating = false;
                    button.textContent = 'Open administrator setup';
                    cancel.hidden = true;
                }
            } catch (error) {
                if (!isCurrent()) return;
                if (missingHost(error)) {
                    installationRequired(action === 'waiting-install');
                    return;
                }
                state = error?.code === 'download-failed' ? 'install-required' : 'ready';
                button.textContent = state === 'install-required' ? 'Download and install' : 'Open administrator setup';
                cancel.hidden = state !== 'install-required';
                if (error?.code === 'download-failed') {
                    status.textContent = 'The installer download could not start. Choose Download and install to try again, or Cancel.';
                    return;
                }
                status.textContent = safeMessage(error);
            } finally {
                if (isCurrent()) button.disabled = state === 'install-required' && !INSTALLER_RELEASE.available;
                if (isCurrent()) showUpdateAction();
            }
        }
        button.addEventListener('click', () => performAction());
        update.addEventListener('click', () => {
            if (!update.hidden && !update.disabled) return performAction('update');
        });
        showUpdateAction();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once: true});
    else initialize();

    globalThis.CaptionKeepAdminSetup = Object.freeze({HOST_NAME, INSTALLER_RELEASE, requestNativeMessaging, launchSetup});
})();
