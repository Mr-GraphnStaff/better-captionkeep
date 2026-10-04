// Reuse one settings form and policy implementation in both popup and full-page views.
location.replace(chrome.runtime.getURL('popup.html?view=settings'));
