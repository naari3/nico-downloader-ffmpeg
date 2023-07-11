import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// import browser from "webextension-polyfill";

const root = document.createElement("div");
root.id = "crx-root";
document.querySelector(".VideoTitle")?.append(root);

// const src = browser.runtime.getURL("sandbox.html");
// console.log([document.querySelector(".VideoTitle"), src]);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// const iframe = new DOMParser().parseFromString(
//   `<iframe id="sandbox" src="${src}"></iframe>`,
//   "text/html"
// ).body.firstElementChild as HTMLIFrameElement;
// console.log(iframe);
// document.querySelector(".VideoTitle")?.append(iframe);
