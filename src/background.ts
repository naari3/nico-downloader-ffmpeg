import createFFmpegCore from "@ffmpeg/core-st";
import browser from "webextension-polyfill";
import { CompleteMessage, Message, URLMessage } from "./types/message";
import { PlaylistItem, fetchMasterPlaylistItems } from "./lib/fetchHLS";

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
  core.ccall("main", "number", ["number", "number"], parseArgs(core, ["ffmpeg", "-nostdin", "-allowed_extensions", "ALL", ...args]));
};

// core.FSで各ファイルが配置されるディレクトリを用意しておく必要があるので、mkdirに渡すためのディレクトリ名一覧をつくる
// 例:
//   入力: ["a/b/c", "a/b/d", "a/e"]
//   出力: ["a/", "a/b/", "a/b/c/", "a/b/d/", "a/e/"]
const makeUniqueDirectories = (items: PlaylistItem[]) => {
  const dirs = new Set<string>();
  const createdDirs = new Set<string>();

  items.forEach((item) => {
    const path = item.name.split("/");
    path.pop();
    if (path.length > 0) dirs.add(path.join("/"));
  });

  dirs.forEach((dir) => {
    const path = dir.split("/");
    path.reduce((currentPath, p) => {
      const newPath = currentPath + p + "/";
      createdDirs.add(newPath);
      return newPath;
    }, "");
  });

  return Array.from(createdDirs);
};

// @ffmpeg/ffmpeg より低レイヤーなAPIを直接触っている
// ref: https://github.com/ffmpegwasm/ffmpeg.wasm-core/blob/1f3461d4162ea41dd714c5cae7fff08fda362ad8/wasm/examples/browser/js/utils.js#L23
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
  makeUniqueDirectories(items).forEach((dir) => {
    core.FS.mkdir(dir);
    console.log(`📁 create ${dir}`);
  });
  items.forEach((item) => {
    if (item.type === "m3u8") {
      core.FS.writeFile(item.name, new TextEncoder().encode(item.data as string));
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

browser.runtime.onMessage.addListener((message: URLMessage, sender, sendResponse) => {
  console.debug({ createFFmpegCore });
  console.debug({ message });
  const load = async () => {
    const playlistItems = await fetchMasterPlaylistItems(message.url, "master.m3u8");
    const file = await runFFmpeg(playlistItems);
    console.debug(file);
    await downloadBlob(new Blob([file.buffer], { type: "video/mp4" }), `${message.watchId}.mp4`);
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
});

// 現状、Service Wrokerから直接おおきなファイルをダウンロードすることができない
// そのため、現在開いてるページに対して、Service Workerからダウンロード用のhtmlをiframeで埋め込み、そこにblobを渡してダウンロードさせる
// (iframeあたりのpostMessageはchrome.runtime.sendMessageとかと違ってblobをそのまま渡せる)
// ref: https://stackoverflow.com/a/73350257
async function downloadBlob(blob: Blob, name: string, origin?: string, destroyBlob = true) {
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
    WAR?.some((r) => (r as any).resources?.includes("downloader.html")) && (await browser.tabs.query({ url: "*://*/*" })).find((t) => t.url);
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
