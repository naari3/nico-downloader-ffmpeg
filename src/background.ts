import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import createFFmpegCore from "@ffmpeg/core-st";
import browser from "webextension-polyfill";
import { CompleteMessage, Message, URLMessage } from "./types/message";

const parseArgs = (core: any, args: any[]) => {
  const argsPtr = core._malloc(args.length * Uint32Array.BYTES_PER_ELEMENT);
  args.forEach((s, idx) => {
    const buf = core._malloc(s.length + 1);
    core.writeAsciiToMemory(s, buf);
    core.setValue(argsPtr + Uint32Array.BYTES_PER_ELEMENT * idx, buf, "i32");
  });
  return [args.length, argsPtr];
};

const ffmpeg = (core: any, args: any[]) => {
  core.ccall(
    "main",
    "number",
    ["number", "number"],
    parseArgs(core, [
      "ffmpeg",
      "-nostdin",
      "-allowed_extensions",
      "ALL",
      ...args,
    ])
  );
};
type PlaylistItem = {
  type: "m3u8" | "ts";
  data: string | ArrayBuffer;
  name: string;
  items?: { [key: string]: PlaylistItem };
};

async function fetchPlaylist(url: string, name: string): Promise<PlaylistItem> {
  console.log("📥 fetching...", { name, url });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/vnd.apple.mpegurl")) {
    const data = await response.text();
    return { type: "m3u8", data, name };
  } else if (contentType?.includes("video/MP2T")) {
    const data = await response.arrayBuffer();
    return { type: "ts", data, name };
  } else {
    throw new Error(`Unexpected content-type! type: ${contentType}`);
  }
}

async function fetchHLSPlaylist(
  baseUrl: string,
  playlistUrl: string,
  name: string
): Promise<PlaylistItem> {
  let playlist: PlaylistItem = {
    type: "m3u8",
    data: "",
    items: {},
    name: name ?? playlistUrl,
  };

  const result = await fetchPlaylist(playlistUrl, name ?? playlistUrl);
  if (result.type === "m3u8") {
    const lines = (result.data as string).split("\n");
    playlist.type = result.type;
    playlist.data = result.data;

    for (let line of lines) {
      line = line.trim();
      if (!line.startsWith("#") && line.length > 0) {
        const itemUrl = new URL(line, baseUrl);
        let childName: string;
        if (itemUrl.href.includes(".ts")) {
          const pathArray = name.split("/");
          pathArray.pop();
          pathArray.push(line);
          childName = pathArray.join("/");
        } else {
          childName = line;
        }
        playlist.items![itemUrl.href] = await fetchHLSPlaylist(
          makeBaseUrl(itemUrl.href),
          itemUrl.href,
          childName
        );
      }
    }
  } else if (result.type === "ts") {
    return result;
  }

  return playlist;
}

function flattenPlaylistItems(item: PlaylistItem): PlaylistItem[] {
  let flatArray: PlaylistItem[] = [item];

  if (item.items) {
    for (const key in item.items) {
      flatArray = [...flatArray, ...flattenPlaylistItems(item.items[key])];
    }
  }

  return flatArray;
}

const makeBaseUrl = (urlStr: string) => {
  const url = new URL(urlStr);
  const path = url.pathname.split("/");
  path.pop();
  const dir = path.join("/");
  const baseUrl = new URL(dir + "/", url.origin);
  return baseUrl.toString();
};

const parseMasterM3u8 = async (masterUrl: string, masterName: string) => {
  const baseUrl = makeBaseUrl(masterUrl);
  const playlist = await fetchHLSPlaylist(baseUrl, masterUrl, masterName);
  return { playlist, baseUrl };
};

const fetchMasterPlaylistItems = async (
  masterUrl: string,
  masterName: string
): Promise<PlaylistItem[]> => {
  const { playlist } = await parseMasterM3u8(masterUrl, masterName);
  return flattenPlaylistItems(playlist);
};

const runFFmpeg = async (playlistItems: PlaylistItem[]) => {
  const inputFilename = "master.m3u8";
  const outputFilename = "output.mp4";
  let resolve: ((value: undefined) => void) | null = null;
  const waitEnd = new Promise<undefined>((r) => {
    resolve = r;
  });
  const core = await createFFmpegCore({
    printErr: (e: any) => console.warn(`ffmpeg-err: ${e}`),
    print: (e: any) => {
      console.log(`ffmpeg-out: ${e}`);
      if (e.startsWith("FFMPEG_END")) {
        resolve!(undefined);
      }
    },
  });
  console.debug({ core });
  const items = playlistItems;
  const dirs: string[] = [];
  items.forEach((item) => {
    const path = item.name.split("/");
    path.pop();
    if (path.length === 0) return;
    const dir = path.join("/");
    if (!dirs.includes(dir)) {
      dirs.push(dir);
    }
  });
  const createdDirs: string[] = [];

  console.debug({ dirs });
  dirs.forEach((dir) => {
    const path = dir.split("/");
    let currentPath = "";
    path.forEach((p) => {
      currentPath += p + "/";
      if (!createdDirs.includes(currentPath)) {
        core.FS.mkdir(currentPath);
        createdDirs.push(currentPath);
        console.log(`📁 create ${currentPath}`);
      }
    });
  });
  items.forEach((item) => {
    if (item.type === "m3u8") {
      core.FS.writeFile(
        item.name,
        new TextEncoder().encode(item.data as string)
      );
    } else if (item.type === "ts") {
      core.FS.writeFile(item.name, new Uint8Array(item.data as ArrayBuffer));
    }

    console.log(`🎞️ add ${item.name}`);
  });

  try {
    ffmpeg(core, ["-i", inputFilename, "-c", "copy", outputFilename]);
  } catch (error) {
    if ((error as any).status !== 0) {
      throw error;
    }
  }
  await waitEnd;
  const file = core.FS.readFile(outputFilename);
  console.debug({ file });
  core.FS.unlink(outputFilename);
  return file as Uint8Array;
};

browser.runtime.onMessage.addListener(
  (message: URLMessage, sender, sendResponse) => {
    console.debug({ createFFmpegCore });
    console.debug({ message });
    const load = async () => {
      const playlistItems = await fetchMasterPlaylistItems(
        message.url,
        "master.m3u8"
      );
      const file = await runFFmpeg(playlistItems);
      console.debug(file);
      await downloadBlob(
        new Blob([file.buffer], { type: "video/mp4" }),
        `${message.watchId}.mp4`
      );
      const completeMessage: CompleteMessage = {
        type: "complete",
        watchId: message.watchId,
        // blob: new Blob([file.buffer], { type: "video/mp4" }),
      };

      await browser.tabs.sendMessage(sender.tab?.id!, completeMessage);
      // await browser.runtime.sendMessage(completeMessage);
    };
    load();

    return true;
  }
);

// 現状、Service Wrokerから直接おおきなファイルをダウンロードすることができない
// そのため、現在開いてるページに対して、Service Workerからダウンロード用のhtmlをiframeで埋め込み、そこにblobを渡してダウンロードさせる
// (iframeあたりのpostMessageはchrome.runtime.sendMessageとかと違ってblobをそのまま渡せる)
// ref: https://stackoverflow.com/a/73350257
async function downloadBlob(
  blob: Blob,
  name: string,
  origin?: string,
  destroyBlob = true
) {
  // When `destroyBlob` parameter is true, the blob is transferred instantly,
  // but it's unusable in SW afterwards, which is fine as we made it only to download
  const send = async (dst: MessageEventSource, close: boolean) => {
    // if (destroyBlob) {
    //   dst.postMessage({ blob, name, close }, origin, [
    //     await blob.arrayBuffer(),
    //   ]);
    // }
    dst.postMessage({ blob, name, close });
  };
  const WAR = browser.runtime.getManifest().web_accessible_resources;
  const tab =
    WAR?.some((r) => (r as any).resources?.includes("downloader.html")) &&
    (await browser.tabs.query({ url: "*://*/*" })).find((t) => t.url);
  if (tab) {
    console.debug({ tab });
    const downloaderUrl = browser.runtime.getURL("downloader.html");
    const result = await browser.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (url) => {
        console.log("👋 howdy");
        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.style.cssText = "display:none!important";
        document.body.appendChild(iframe);
      },
      args: [downloaderUrl],
    });
    console.debug({ result });
    console.debug("YO");
  } else {
    await browser.windows.create({
      url: "downloader.html",
      state: "minimized",
    });
  }
  console.log("⏳ waiting for message");
  self.addEventListener("message", function onMsg(e) {
    if (e.data === "sendBlob") {
      console.log("📨 sending blob, close listener");
      self.removeEventListener("message", onMsg);
      if (!e.source) return;
      send(e.source, !tab);
      console.log("✅ completed!");
    }
    return true;
  });
}
