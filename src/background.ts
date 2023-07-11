import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";
import createFFmpegCore from "@ffmpeg/core-st";
import browser from "webextension-polyfill";

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
  console.log("====== fetchPlaylist ======");
  console.log({ name, url });
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

const parseMasterM3u8 = async (masterUrl: string) => {
  console.log("====== parseMasterM3u8 ======");
  const baseUrl = makeBaseUrl(masterUrl);
  const playlist = await fetchHLSPlaylist(baseUrl, masterUrl, "master.m3u8");
  return { playlist, baseUrl };
};

const runFFmpeg = async (masterPlaylistUrl: string) => {
  let resolve: ((value: undefined) => void) | null = null;
  const waitEnd = new Promise<undefined>((r) => {
    resolve = r;
  });
  const core = await createFFmpegCore({
    printErr: (e: any) => console.log(e),
    print: (e: any) => {
      console.log(e);
      if (e.startsWith("FFMPEG_END")) {
        resolve!(undefined);
      }
    },
  });
  console.log({ core, masterPlaylistUrl });
  const { playlist: masterPlaylist, baseUrl } = await parseMasterM3u8(
    masterPlaylistUrl
  );
  const items = flattenPlaylistItems(masterPlaylist);
  console.log({ items });
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

  dirs.forEach((dir) => {
    const path = dir.split("/");
    let currentPath = "";
    path.forEach((p) => {
      currentPath += p + "/";
      if (!createdDirs.includes(currentPath)) {
        core.FS.mkdir(currentPath);
        createdDirs.push(currentPath);
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

    console.log(`add ${item.name}`);
  });

  try {
    ffmpeg(core, ["-i", "master.m3u8", "-c", "copy", "output.mp4"]);
  } catch (error) {
    if ((error as any).status !== 0) {
      throw error;
    }
  }
  await waitEnd;
  const file = core.FS.readFile("output.mp4");
  console.log({ file });
  core.FS.unlink("output.mp4");
  return file as Uint8Array;
};

browser.runtime.onMessage.addListener((message) => {
  console.log({ createFFmpegCore });
  console.log({ message });
  const load = async () => {
    console.log("YO, load");
    const file = await runFFmpeg(message.url);
    console.log(file);
    // const ffmpeg = createFFmpeg({
    //   log: true,
    //   // SharedArrayBufferが使えないのでシングルスレッド版を使用する
    //   //   corePath: "https://unpkg.com/@ffmpeg/core-st@latest",
    //   // mainName: "main",
    // });
    // // 別ファイルのjsをロードするタイミングでURL.createObjectURLが使われているが、ServiceWorkerでは使えない
    // await ffmpeg.load();
    // const m3u8 = message.url;
    // ffmpeg.FS("writeFile", "input.m3u8", await fetchFile(m3u8));
    // await ffmpeg.run(
    //   "-i",
    //   "input.m3u8",
    //   "-c",
    //   "copy",
    //   "-bsf:a",
    //   "aac_adtstoasc",
    //   "output.mp4"
    // );
    // const data = ffmpeg.FS("readFile", "output.mp4");
    await downloadBlob(
      new Blob([file.buffer], { type: "video/mp4" }),
      "output.mp4",
      message.origin
    );
  };
  load();

  return true;
});

async function downloadBlob(
  blob: Blob,
  name: string,
  origin: string,
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
    console.log({ tab });
    const downloaderUrl = browser.runtime.getURL("downloader.html");
    const result = await browser.scripting.executeScript({
      target: { tabId: tab.id! },
      func: (url) => {
        console.log("howdy");
        const iframe = document.createElement("iframe");
        iframe.src = url;
        iframe.style.cssText = "display:none!important";
        document.body.appendChild(iframe);
      },
      args: [downloaderUrl],
    });
    console.log({ result });
    console.log("YO");
  } else {
    await browser.windows.create({
      url: "downloader.html",
      state: "minimized",
    });
  }
  console.log("waiting for message");
  self.addEventListener("message", function onMsg(e) {
    if (e.data === "sendBlob") {
      console.log("sending blob, close listener");
      self.removeEventListener("message", onMsg);
      if (!e.source) return;
      send(e.source, !tab);
      console.log("completed!");
    }
    return true;
  });
}
