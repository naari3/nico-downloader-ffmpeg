import browser from "webextension-polyfill";

navigator.serviceWorker.ready.then((swr) => swr.active?.postMessage("sendBlob"));
navigator.serviceWorker.addEventListener("message", async (e) => {
  if (e.data.blob) {
    console.log("📥 get blob");
    await browser.downloads.download({
      url: URL.createObjectURL(e.data.blob),
      filename: e.data.name,
    });
  }
  if (e.data.close) {
    window.close();
  }
  return true;
});
