type PlaylistItem = {
  type: "m3u8" | "ts";
  data: string | ArrayBuffer;
  name: string;
  items?: { [key: string]: PlaylistItem };
};

async function fetchPlaylist(url: string, name: string): Promise<PlaylistItem> {
  console.log(`📥 fetching... ${name}`, { url });
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

async function fetchHLSPlaylist(baseUrl: string, playlistUrl: string, name: string): Promise<PlaylistItem> {
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
        playlist.items![itemUrl.href] = await fetchHLSPlaylist(makeBaseUrl(itemUrl.href), itemUrl.href, childName);
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

const fetchMasterPlaylistItems = async (masterUrl: string, masterName: string): Promise<PlaylistItem[]> => {
  const { playlist } = await parseMasterM3u8(masterUrl, masterName);
  return flattenPlaylistItems(playlist);
};

export { fetchMasterPlaylistItems };
export type { PlaylistItem };
