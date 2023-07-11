import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

console.log("Hello from sandbox.ts");

window.addEventListener("message", (event) => {
  const load = async () => {
    const ffmpeg = createFFmpeg({
      mainName: "main",
      log: true,
    });
    await ffmpeg.load();
    const m3u8 = event.data.url;
    ffmpeg.FS("writeFile", "input.m3u8", await fetchFile(m3u8));
    // TODO: fetch時にCORSに引っかかって落ちる　ここを突破できればマルチスレッドで動くと思う
    await ffmpeg.run("-i", "input.m3u8", "-c", "copy", "-bsf:a", "aac_adtstoasc", "output.mp4");
    const data = ffmpeg.FS("readFile", "output.mp4");
    const url = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
    window.postMessage({ url }, "*");
  };
  console.debug({ event });
  load();
});
