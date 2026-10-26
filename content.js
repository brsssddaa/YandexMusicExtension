(function () {
    'use strict';

    try {
        const s = document.createElement("script");
        s.src = chrome.runtime.getURL("page_inject.js");
        s.onload = () => s.remove();
        (document.head || document.documentElement).appendChild(s);
    } catch(e) {}

    window.addEventListener("message", async (event) => {
        if (!event.data || event.data.source !== "YM_FREE_PAGE") return;

        if (event.data.action === "RESOLVE_FULL_STREAM") {
            const { artist, title } = event.data;
            const query = `${artist} - ${title}`;

            const gateways = [
                "https://inv.nadeko.net",
                "https://invidious.tiekoetter.com",
                "https://yt.chocolatemoo53.com"
            ];

            for (const gw of gateways) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500);

                    const res = await fetch(`${gw}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const items = await res.json();
                        if (items && items.length > 0) {
                            const videoId = items[0].videoId;
                            const streamUrl = `${gw}/latest_version?id=${videoId}&itag=140`;

                            window.postMessage({
                                source: "YM_FREE_EXT",
                                action: "PLAY_FULL_STREAM",
                                streamUrl: streamUrl,
                                title: title,
                                artist: artist
                            }, "*");
                            return;
                        }
                    }
                } catch (e) {}
            }
        }
    });
})();
