// Reuse one settings form and policy implementation in both popup and full-page views.
const target = new URL(chrome.runtime.getURL('popup.html?view=settings'));
target.hash = location.hash;
location.replace(target.href);
