type Message = URLMessage | CompleteMessage;

type URLMessage = {
  type: "url";
  url: string;
  watchId: string;
};

type CompleteMessage = {
  type: "complete";
  watchId: string;
  //   blob: Blob;
};

export type { Message, URLMessage, CompleteMessage };
