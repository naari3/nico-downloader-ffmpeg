import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

console.log("Hello from sandbox.ts");

window.addEventListener("message", (event) => {
  const load = async () => {
    const ffmpeg = createFFmpeg({
      mainName: "main",
      log: true,
      // SharedArrayBufferが使えないのでシングルスレッド版を使用する
      // corePath: "https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js",
    });
    await ffmpeg.load();
    const m3u8 = event.data.url;
    ffmpeg.FS("writeFile", "input.m3u8", await fetchFile(m3u8));
    // fetch時にCORSに引っかかって落ちる
    await ffmpeg.run(
      "-i",
      "input.m3u8",
      "-c",
      "copy",
      "-bsf:a",
      "aac_adtstoasc",
      "output.mp4"
    );
    const data = ffmpeg.FS("readFile", "output.mp4");
    const url = URL.createObjectURL(
      new Blob([data.buffer], { type: "video/mp4" })
    );
    window.postMessage({ url }, "*");
  };
  console.log({ event });
  load();
});
