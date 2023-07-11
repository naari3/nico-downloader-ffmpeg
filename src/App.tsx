import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { createFFmpeg } from "@ffmpeg/ffmpeg";

function App() {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const load = async () => {
      if (url.includes("dmc.nico")) {
        // console.log("load");
        // const ffmpeg = createFFmpeg({ log: true });
        // await ffmpeg.load();
        // console.log(url);
        // (
        //   document.querySelector("iframe#sandbox") as HTMLIFrameElement
        // ).contentWindow?.postMessage({ url }, "*");

        browser.runtime.sendMessage({ url });

        // const port = browser.runtime.connect();
        // port.postMessage({ url });
      }
    };
    load();
  }, [url]);

  return (
    <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
  );
}

export default App;
