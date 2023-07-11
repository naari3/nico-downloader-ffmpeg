import { useEffect, useRef } from "react";
import { fetchInfo } from "../lib/fetchInfo";

function useHeartbeatClock({
  info,
  heartbeatInfo,
  active,
}: {
  info: any;
  heartbeatInfo: any;
  active: boolean;
}) {
  const savedCallback = useRef<() => void>();
  useEffect(() => {
    if (!info || !heartbeatInfo) {
      return;
    }
    savedCallback.current = async () => {
      const heartbeatResponse = await fetch(heartbeatInfo.url, {
        method: "POST",
        body: heartbeatInfo.data,
      });
      const heartbeatData = await heartbeatResponse.json();
      console.debug({ heartbeatData });
    };
  }, [info, heartbeatInfo]);

  useEffect(() => {
    if (!info || !heartbeatInfo) {
      return;
    }
    function tick() {
      if (savedCallback.current) {
        savedCallback.current();
        // log cute message with emoji
        console.log("💗 heartbeat");
      }
    }
    if (active) {
      // console.log(`setInterval(tick, ${heartbeatInfo.interval})`);
      const id = setInterval(tick, heartbeatInfo.interval);
      return () => clearInterval(id);
    }
  }, [active, info, heartbeatInfo]);
}

function useCurrentPageHeartbeat({
  active,
  info,
  heartbeatInfo,
}: {
  active: boolean;
  info: any;
  heartbeatInfo: any;
}) {
  useEffect(() => {
    const load = async () => {
      console.debug({ info, heartbeatInfo });
      await heartbeatInfo?.ping?.();
    };
    load();
  }, [info, heartbeatInfo]);

  useHeartbeatClock({ info, heartbeatInfo, active });
}

export { useCurrentPageHeartbeat };
