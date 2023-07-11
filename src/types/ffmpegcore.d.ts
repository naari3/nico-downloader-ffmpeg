declare function createFFmpegCore(...args: any[]): any;

declare module "@ffmpeg/core" {
  export = createFFmpegCore;
}

declare module "@ffmpeg/core-st" {
  export = createFFmpegCore;
}
