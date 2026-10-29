/* Portal Futuro · carregado antes de tudo, para não perder o aviso do navegador de que o app pode ser instalado */
window.__pfBIP = null;
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.__pfBIP = e; document.dispatchEvent(new Event("pf-installable")); });
window.addEventListener("appinstalled", function () { window.__pfBIP = null; window.__pfInstalled = true; document.dispatchEvent(new Event("pf-installed")); });
