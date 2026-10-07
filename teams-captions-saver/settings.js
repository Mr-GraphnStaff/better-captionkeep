// Reuse one settings form and policy implementation in both popup and full-page views.
const destination = new URL(chrome.runtime.getURL('popup.html?view=settings'));
destination.hash = location.hash;
location.replace(destination.href);
