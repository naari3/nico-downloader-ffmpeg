import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { useCurrentPageHeartbeat } from "./hooks/useHeartbeat";
import { fetchApiData, fetchInfo } from "./lib/fetchInfo";
import { Message, URLMessage } from "./types/message";

function App() {
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(false);
  const [apiData, setApiData] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [heartbeatInfo, setHeartbeatInfo] = useState<any>(null);
  const [videoQuality, setVideoQuality] = useState("");
  const [audioQuality, setAudioQuality] = useState("");

  useCurrentPageHeartbeat({ active, info, heartbeatInfo });

  useEffect(() => {
    const load = async () => {
      const apiData = await fetchApiData();
      setApiData(apiData);
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (url.includes("dmc.nico")) {
        const message: URLMessage = {
          type: "url",
          url,
          watchId: apiData.video.id,
        };
        browser.runtime.sendMessage(message);
        console.log("📨 send message", { message });
      }
    };
    load();
  }, [url, apiData]);

  useEffect(() => {
    function listener(message: Message): true {
      if (message.type !== "complete") return true;
      console.log("📬 receive message", { message });
      setActive(false);
      setUrl("");
      const load = async () => {
        setApiData(null);
        const apiData = await fetchApiData();
        setApiData(apiData);
      };
      load();
      setInfo(null);
      setHeartbeatInfo(null);
      return true;
    }
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [setActive, setUrl, setApiData, setInfo, setHeartbeatInfo]);

  const handleStart = useCallback(() => {
    const load = async () => {
      setActive(true);
      const { info, heartbeatInfo } = await fetchInfo({
        apiData,
        audio_src_id: audioQuality,
        video_src_id: videoQuality,
      });
      setInfo(info);
      setHeartbeatInfo(heartbeatInfo);
      setUrl(info.url);
    };
    load();
  }, [apiData, audioQuality, videoQuality]);

  return (
    <>
      <select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value)}>
        {apiData
          ? apiData.media.delivery.movie.session.videos.map((qlt: any) => (
              <option key={qlt} value={qlt}>
                {qlt}
              </option>
            ))
          : null}
      </select>
      <select value={audioQuality} onChange={(e) => setAudioQuality(e.target.value)}>
        {apiData
          ? apiData.media.delivery.movie.session.audios.map((qlt: any) => (
              <option key={qlt} value={qlt}>
                {qlt}
              </option>
            ))
          : null}
      </select>
      <button onClick={handleStart} disabled={active}>
        保存
      </button>
    </>
  );
}

export default App;
