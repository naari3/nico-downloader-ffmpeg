const _API_HEADERS = {
  "X-Frontend-ID": "6",
  "X-Frontend-Version": "0",
  "X-Niconico-Language": "en-us",
  Referer: "https://www.nicovideo.jp/",
  Origin: "https://www.nicovideo.jp",
};

const fetchApiData = async () => {
  const resp = await (
    await fetch(location.href, {
      credentials: "include",
    })
  ).text();
  const escapedApiData = resp.match(/data-api-data="([^"]+)"/)![1];
  const doc = new DOMParser().parseFromString(escapedApiData, "text/html");
  const apiData = JSON.parse(doc.body.textContent!);
  return apiData;
};

const fetchInfo = async (params?: {
  apiData?: any;
  audio_src_id?: string;
  video_src_id?: string;
}) => {
  const apiData = params?.apiData ?? (await fetchApiData());
  console.debug({ apiData });
  const sessionApiData = apiData.media.delivery.movie.session;
  console.debug({ sessionApiData });
  const sessionApiEndpoint = sessionApiData.urls[0];

  const protocol = "m3u8";
  const segmentDuration = 6000;
  const parsedToken = JSON.parse(sessionApiData.token);
  const encryption = apiData.media.delivery.encryption;
  const prococolParameters: any = {
    hls_parameters: {
      segment_duration: segmentDuration,
      transfer_preset: "standard2",
      use_ssl: "yes",
      use_well_known_port: "yes",
    },
  };
  if (parsedToken && parsedToken["hls_encryption"] && encryption) {
    prococolParameters.hls_parameters["encryption"] = {
      [parsedToken.hls_encryption]: {
        encrypted_key: encryption.encrypted_key,
        key_uri: encryption.key_uri,
      },
    };
  }
  const sessionResponse = await fetch(
    `${sessionApiEndpoint.url}?_format=json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session: {
          client_info: {
            player_id: sessionApiData.playerId,
          },
          content_auth: {
            auth_type: sessionApiData.authTypes[sessionApiData.protocols[0]],
            content_key_timeout: sessionApiData.contentKeyTimeout,
            service_id: "nicovideo",
            service_user_id: sessionApiData.serviceUserId,
          },
          content_id: sessionApiData.contentId,
          content_src_id_sets: [
            {
              content_src_ids: [
                {
                  src_id_to_mux: {
                    audio_src_ids: params?.audio_src_id
                      ? [params.audio_src_id]
                      : [sessionApiData.audios[0]],
                    video_src_ids: params?.video_src_id
                      ? [params.video_src_id]
                      : [sessionApiData.videos[0]],
                  },
                },
              ],
            },
          ],
          content_type: "movie",
          content_uri: "",
          keep_method: {
            heartbeat: {
              lifetime: sessionApiData.heartbeatLifetime,
            },
          },
          priority: sessionApiData.priority,
          protocol: {
            name: "http",
            parameters: {
              http_parameters: {
                parameters: prococolParameters,
              },
            },
          },
          recipe_id: sessionApiData.recipeId,
          session_operation_auth: {
            session_operation_auth_by_signature: {
              signature: sessionApiData.signature,
              token: sessionApiData.token,
            },
          },
          timing_constraint: "unlimited",
        },
      }),
      credentials: "include",
    }
  );
  const sessionData = await sessionResponse.json();
  const url = sessionData.data.session.content_uri;

  const info = {
    url,
    protocol,
  };

  const heartbeatInfo = {
    url: `${sessionApiEndpoint.url}/${sessionData.data.session.id}?_format=json&_method=PUT`,
    data: JSON.stringify(sessionData.data),
    interval: sessionApiData.heartbeatLifetime,
    // interval: sessionApiData.heartbeatLifetime / 3000,
    ping: async () => {
      const trackingId = apiData.media.delivery.trackingId;
      if (trackingId) {
        const trackingUrl = `https://nvapi.nicovideo.jp/v1/2ab0cbaa/watch?t=${trackingId}`;
        const response = await fetch(trackingUrl, {
          headers: _API_HEADERS,
          credentials: "include",
        });
        const data = await response.json();
        if (data.meta.status !== 200) {
          console.error(data);
        }
      }
    },
  };

  return { info, heartbeatInfo };
};

export { fetchInfo, fetchApiData };
