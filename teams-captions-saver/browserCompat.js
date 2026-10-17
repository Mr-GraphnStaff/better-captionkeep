(function initializeBrowserCompat(root) {
    'use strict';

    const api = root.browser || root.chrome;

    async function activeTab() {
        const [tab] = await api.tabs.query({active: true, currentWindow: true});
        return tab;
    }

    async function openWorkspace() {
        if (api.sidebarAction?.open) {
            await api.sidebarAction.open();
            return 'sidebar';
        }

        if (api.sidePanel?.open && api.sidePanel?.setOptions) {
            const tab = await activeTab();
            if (!tab?.windowId) throw new Error('No active browser window is available.');
            await api.sidePanel.setOptions({enabled: true, path: 'sidepanel.html'});
            await api.sidePanel.open({windowId: tab.windowId});
            return 'side-panel';
        }

        await api.tabs.create({url: api.runtime.getURL('sidepanel.html')});
        return 'tab';
    }

    async function closeWorkspace() {
        if (api.sidebarAction?.close) {
            await api.sidebarAction.close();
            return;
        }

        if (api.sidePanel?.close) {
            const tab = await activeTab();
            if (!tab?.windowId) throw new Error('No active browser window is available.');
            await api.sidePanel.close({windowId: tab.windowId});
            return;
        }

        if (api.sidePanel?.setOptions) {
            await api.sidePanel.setOptions({enabled: false});
        }
        root.close();
    }

    root.CaptionKeepBrowserCompat = Object.freeze({openWorkspace, closeWorkspace});
})(globalThis);
