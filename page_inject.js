// Яндекс Музыка - Core Page Injector & State Engine v2.3 (Mobile & Desktop Edition)
(function () {
    'use strict';
    const win = window;

    function formatTime(sec) {
        if (!sec || isNaN(sec)) return "00:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // Сохранение и восстановление позиции воспроизведения
    function getResumeState() {
        try {
            const raw = localStorage.getItem('ym_resume_state');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.track && parsed.track.title) return parsed;
            }
        } catch(e) {}
        return null;
    }

    let activeTrack = null;
    let currentPosition = 0;
    let currentDuration = 0;
    let hasRestoredPositionThisSession = false;

    function saveResumeState(track, position, duration, rawItem) {
        if (!track && !activeTrack) return;
        const curTrack = track || activeTrack;
        if (!curTrack || !curTrack.title) return;

        const pos = typeof position === 'number' && !isNaN(position) ? Math.max(0, position) : currentPosition;
        const dur = typeof duration === 'number' && !isNaN(duration) ? duration : (curTrack.duration || currentDuration || 180);

        const state = {
            track: {
                id: curTrack.id || curTrack.trackId || "",
                title: curTrack.title,
                artist: (curTrack.artists || []).map(a => a.name || a.title).join(", ") || curTrack.artist || "",
                artists: curTrack.artists || [{ name: curTrack.artist || "" }],
                albumId: (curTrack.albums && curTrack.albums[0] ? curTrack.albums[0].id : curTrack.albumId) || "",
                coverUri: curTrack.coverUri || (curTrack.albums && curTrack.albums[0] ? curTrack.albums[0].coverUri : "") || "",
                duration: dur
            },
            rawTrackItem: rawItem || (getResumeState()?.rawTrackItem) || null,
            position: pos,
            duration: dur,
            updatedAt: Date.now()
        };

        try {
            localStorage.setItem('ym_resume_state', JSON.stringify(state));
        } catch(e) {}
    }

    win.addEventListener('beforeunload', () => {
        if (activeTrack && currentPosition > 0) {
            saveResumeState(activeTrack, currentPosition, currentDuration);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && activeTrack && currentPosition > 0) {
            saveResumeState(activeTrack, currentPosition, currentDuration);
        }
    });

    // 1. Отслеживание аудио-элемента HTML5
    try {
        const _origPlay = HTMLAudioElement.prototype.play;
        HTMLAudioElement.prototype.play = function (...args) {
            const audio = this;

            if (!hasRestoredPositionThisSession) {
                const saved = getResumeState();
                if (saved && saved.position > 1) {
                    try {
                        audio.currentTime = saved.position;
                        hasRestoredPositionThisSession = true;
                    } catch(e) {}
                }
            }

            if (!audio._ym_tracked) {
                audio._ym_tracked = true;

                audio.addEventListener('timeupdate', () => {
                    if (audio.currentTime > 0) {
                        currentPosition = audio.currentTime;
                        currentDuration = audio.duration || currentDuration;
                        if (Math.floor(currentPosition) % 2 === 0) {
                            saveResumeState(activeTrack, currentPosition, currentDuration);
                        }
                    }
                });

                audio.addEventListener('pause', () => {
                    if (audio.currentTime > 0) {
                        currentPosition = audio.currentTime;
                        saveResumeState(activeTrack, currentPosition, currentDuration);
                    }
                });
            }

            return _origPlay.apply(this, args);
        };
    } catch(e) {}

    // 2. Строковые замены для снятия флагов ограничений
    function needsPatch(str) {
        return typeof str === 'string' && (
            str.includes('hasPlus') ||
            str.includes('isFreemium') ||
            str.includes('WebNext') ||
            str.includes('closeCollection') ||
            str.includes('limitListening') ||
            str.includes('advertisementDisabled') ||
            str.includes('radioNoAds') ||
            str.includes('serviceAvailable')
        );
    }

    const regexReplacements = [
        [/"hasPlus":\s*false/gi,                                  '"hasPlus":true'],
        [/"premium":\s*false/gi,                                  '"premium":true'],
        [/"isFreemium":\s*true/gi,                                '"isFreemium":false'],
        [/"isTrialAvailable":\s*true/gi,                          '"isTrialAvailable":false'],
        [/"advertisementDisabled":\s*false/gi,                    '"advertisementDisabled":true'],
        [/"radioNoAds":\s*false/gi,                               '"radioNoAds":true'],
        [/"isNoAdsFeaturesAvailable":\s*false/gi,                 '"isNoAdsFeaturesAvailable":true'],
        [/"canStartTrial":\s*true/gi,                             '"canStartTrial":false'],
        [/\\"hasPlus\\":\s*false/gi,                              '\\"hasPlus\\":true'],
        [/\\"premium\\":\s*false/gi,                              '\\"premium\\":true'],
        [/\\"isFreemium\\":\s*true/gi,                            '\\"isFreemium\\":false'],
        [/hasPlus\\?":false/gi,                                   'hasPlus":true'],
        [/isFreemium\\?":true/gi,                                 'isFreemium":false'],
        [/"serviceAvailable":\s*false/gi,                         '"serviceAvailable":true'],
        [/"closeCollection":\s*"(?:default|on)"/gi,               '"closeCollection":"off"'],
        [/"limitListening":\s*"(?:default|on)"/gi,               '"limitListening":"off"'],
        [/"closeListening":\s*"(?:default|on)"/gi,               '"closeListening":"off"'],
        [/"WebNextBlockFullscreen":\{"group":"on"/gi,             '"WebNextBlockFullscreen":{"group":"off"'],
        [/\\"WebNextBlockFullscreen\\":\{\\"group\\":\\"on\\"/gi, '\\"WebNextBlockFullscreen\\":\{\\"group\\":\\"off\\"']
    ];

    function applyRegex(text) {
        if (!needsPatch(text)) return text;
        let modified = text;
        for (const [regex, replacement] of regexReplacements) {
            modified = modified.replace(regex, replacement);
        }
        return modified;
    }

    function patchObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) patchObject(obj[i]);
            return obj;
        }
        if ('hasPlus' in obj) obj.hasPlus = true;
        if ('premium' in obj) obj.premium = true;
        if ('isFreemium' in obj) obj.isFreemium = false;
        if ('isTrialAvailable' in obj) obj.isTrialAvailable = false;
        if ('advertisementDisabled' in obj) obj.advertisementDisabled = true;
        if ('radioNoAds' in obj) obj.radioNoAds = true;
        if ('canStartTrial' in obj) obj.canStartTrial = false;
        if ('serviceAvailable' in obj) obj.serviceAvailable = true;

        if (obj.WebNextDesktopWebFreemium && typeof obj.WebNextDesktopWebFreemium === 'object') {
            const v = obj.WebNextDesktopWebFreemium.value || obj.WebNextDesktopWebFreemium;
            if (v) {
                v.limitListening = 'off';
                v.closeListening = 'off';
                v.closeCollection = 'off';
                v.title = 'off';
            }
        }
        if (obj.WebNextBlockFullscreen && typeof obj.WebNextBlockFullscreen === 'object') {
            obj.WebNextBlockFullscreen.group = 'off';
        }
        if (obj.WebNextDisableCollection && typeof obj.WebNextDisableCollection === 'object') {
            obj.WebNextDisableCollection.group = 'off';
        }
        return obj;
    }

    // 3. Безопасный перехват JSON.parse (с защитой от сбоев)
    const _origParse = win.JSON.parse;
    win.JSON.parse = function (text, reviver) {
        if (typeof text === 'string' && needsPatch(text)) {
            try {
                const patched = applyRegex(text);
                return _origParse.call(this, patched, reviver);
            } catch(e) {
                // Если regex повредил JSON, парсим оригинал без сбоя
                return _origParse.call(this, text, reviver);
            }
        }
        return _origParse.call(this, text, reviver);
    };

    // 4. Безопасный перехват Next.js стриминга данных (__next_f)
    try {
        (function hookNextF() {
            const patchChunk = (chunk) => {
                try {
                    if (Array.isArray(chunk) && typeof chunk[1] === 'string' && needsPatch(chunk[1])) {
                        chunk[1] = applyRegex(chunk[1]);
                    }
                } catch(e) {}
                return chunk;
            };

            const existing = win.__next_f || [];
            for (let i = 0; i < existing.length; i++) patchChunk(existing[i]);

            const origPush = existing.push.bind(existing);
            existing.push = function (...args) {
                for (const c of args) patchChunk(c);
                return origPush(...args);
            };
            win.__next_f = existing;
        })();
    } catch(e) {}

    // 5. Безопасный перехват React патчей (__STATE_PATCHES__)
    try {
        (function hookStatePatches() {
            const patchOp = (op) => {
                if (!op || typeof op !== 'object') return;
                const p = op.path || '';
                if (p.includes('hasPlus')                && op.value === false) op.value = true;
                if (p.includes('premium')               && op.value === false) op.value = true;
                if (p.includes('isFreemium')            && op.value === true)  op.value = false;
                if (p.includes('isTrialAvailable')      && op.value === true)  op.value = false;
                if (p.includes('advertisementDisabled') && op.value === false) op.value = true;
                if (p.includes('radioNoAds')            && op.value === false) op.value = true;
                if (p.includes('canStartTrial')         && op.value === true)  op.value = false;
                if (p.includes('serviceAvailable')      && op.value === false) op.value = true;
                if (p.includes('WebNextDesktopWebFreemium') && typeof op.value === 'object' && op.value !== null) {
                    const v = op.value.value || op.value;
                    if (v) {
                        v.limitListening = 'off';
                        v.closeListening = 'off';
                        v.closeCollection = 'off';
                        v.title = 'off';
                    }
                }
                if (p.includes('WebNextBlockFullscreen') && typeof op.value === 'object' && op.value !== null) {
                    op.value.group = 'off';
                }
                if (p.includes('WebNextDisableCollection') && typeof op.value === 'object' && op.value !== null) {
                    op.value.group = 'off';
                }
            };

            const patchPush = (origPush) => function (...args) {
                for (const patchSet of args) {
                    if (Array.isArray(patchSet)) {
                        for (const op of patchSet) patchOp(op);
                    }
                }
                return origPush.apply(this, args);
            };

            const existing = win.__STATE_PATCHES__ || [];
            for (const patchSet of existing) {
                if (Array.isArray(patchSet)) {
                    for (const op of patchSet) patchOp(op);
                }
            }
            existing.push = patchPush(existing.push.bind(existing));
            win.__STATE_PATCHES__ = existing;

            existing.push([
                { op: "replace", path: "/user/account/data/hasPlus", value: true },
                { op: "replace", path: "/user/account/data/isFreemium", value: false },
                { op: "replace", path: "/user/account/data/serviceAvailable", value: true }
            ]);
        })();
    } catch(e) {}

    // 6. Перехват сети (fetch & XHR)
    try {
        (function hookNetwork() {
            const XHR = win.XMLHttpRequest.prototype;
            const origOpen = XHR.open;

            XHR.open = function (method, url, ...rest) {
                this._ym_url = url ? String(url) : '';
                return origOpen.call(this, method, url, ...rest);
            };

            const rtDesc = Object.getOwnPropertyDescriptor(XHR, 'responseText');
            if (rtDesc && rtDesc.get) {
                Object.defineProperty(XHR, 'responseText', {
                    get: function () {
                        const text = rtDesc.get.call(this);
                        return needsPatch(text) ? applyRegex(text) : text;
                    }
                });
            }

            const _origFetch = win.fetch;
            if (_origFetch) {
                win.fetch = async function (input, init) {
                    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

                    try {
                        const resp = await _origFetch.call(this, input, init);

                        if ((!resp.ok || resp.status === 401 || resp.status === 403) &&
                            (url.includes('library.jsx') || url.includes('collection.jsx') || url.includes('plus.jsx'))) {
                            return new Response(JSON.stringify({
                                result: {
                                    hasPlus: true,
                                    success: true,
                                    tracks: [],
                                    playlists: [],
                                    artists: [],
                                    albums: []
                                }
                            }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        const origJson = resp.json.bind(resp);
                        const origText = resp.text.bind(resp);

                        resp.json = async function () {
                            const data = await origJson();
                            try {
                                patchObject(data);

                                if (data && data.result && Array.isArray(data.result.sequence)) {
                                    data.result.sequence = data.result.sequence.filter(item => item && item.type !== 'ad' && item.type !== 'upsell');
                                    for (const item of data.result.sequence) {
                                        if (item.track) {
                                            item.track.hasPlus = true;
                                            item.track.isAvailable = true;
                                            delete item.track.error;
                                        }
                                    }

                                    if (!activeTrack && data.result.sequence.length > 0 && data.result.sequence[0].track) {
                                        activeTrack = data.result.sequence[0].track;
                                    }

                                    const saved = getResumeState();
                                    if (saved && saved.track && saved.track.id) {
                                        const alreadyFirst = data.result.sequence[0] && data.result.sequence[0].track && data.result.sequence[0].track.id === saved.track.id;
                                        if (!alreadyFirst) {
                                            const resumeItem = saved.rawTrackItem || {
                                                type: "track",
                                                track: {
                                                    id: saved.track.id,
                                                    title: saved.track.title,
                                                    artists: saved.track.artists || [{ name: saved.track.artist }],
                                                    coverUri: saved.track.coverUri,
                                                    durationMs: (saved.duration || 180) * 1000,
                                                    hasPlus: true,
                                                    isAvailable: true
                                                }
                                            };
                                            data.result.sequence.unshift(resumeItem);
                                        }
                                    }
                                }
                            } catch(e) {}
                            return data;
                        };

                        resp.text = async function () {
                            const t = await origText();
                            return needsPatch(t) ? applyRegex(t) : t;
                        };

                        return resp;
                    } catch(err) {
                        if (url.includes('library') || url.includes('collection')) {
                            return new Response(JSON.stringify({
                                result: { hasPlus: true, tracks: [], playlists: [] }
                            }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                        throw err;
                    }
                };
            }
        })();
    } catch(e) {}

    // 7. Очистка DOM от блокирующих окон (без удаления нод React)
    function cleanDomElements() {
        try {
            document.querySelectorAll('.BlockPage_root__crGK_, [class*="BlockPage_root"], [class*="PaywallModal_root"]').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
            });

            document.querySelectorAll('[class*="VibePage_root_withoutPlus"]').forEach(el => {
                el.classList.remove('VibePage_root_withoutPlus__xZ8r4');
                el.className = el.className.replace(/\bVibePage_root_withoutPlus\S*/g, '');
            });

            document.querySelectorAll('[class*="VibePageFreemiumBlock_root"], [class*="VibePage_freemiumBlock"]').forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
        } catch(e) {}
    }

    // 8. Обновление визуальных индикаторов плеера
    function updatePlayerIndicators() {
        try {
            if (hasRestoredPositionThisSession) return;
            const saved = getResumeState();
            if (!saved || !saved.position || saved.position <= 0) return;

            const dur = saved.duration || 180;
            const pos = saved.position;

            const timecodeEl = document.querySelector('.VibePlayerbarMeta_timecodeOverlay__JhnCy, [class*="VibePlayerbarMeta_timecodeOverlay"]');
            if (timecodeEl && timecodeEl.textContent.includes('00:00 / 00:00')) {
                timecodeEl.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
            }

            const metaRoot = document.querySelector('.VibePlayerbarMeta_root___dH5G, [class*="VibePlayerbarMeta_root"]');
            if (metaRoot) {
                const percent = Math.min(100, Math.max(0, (pos / dur) * 100));
                metaRoot.style.setProperty('--track-progress', `${percent}%`);
            }

            const slider = document.querySelector('.VibePlayerbarMeta_slider__pyonb, [class*="VibePlayerbarMeta_slider"]');
            if (slider && Number(slider.value) === 0) {
                slider.max = dur;
                slider.value = pos;
            }
        } catch(e) {}
    }

    try {
        const observer = new MutationObserver(() => {
            cleanDomElements();
            updatePlayerIndicators();
        });

        const startObs = () => {
            if (document.body) {
                cleanDomElements();
                updatePlayerIndicators();
                observer.observe(document.body, { childList: true, subtree: true });
            }
        };

        if (document.body) startObs();
        else document.addEventListener('DOMContentLoaded', startObs, { once: true });
    } catch(e) {}

    // 9. Подключение к externalAPI
    let currentTrackKey = "";

    function setupExternalApi() {
        if (!win.externalAPI) {
            setTimeout(setupExternalApi, 250);
            return;
        }

        try {
            win.externalAPI.on(win.externalAPI.EVENT_TRACK, () => {
                const track = win.externalAPI.getCurrentTrack();
                if (!track) return;

                activeTrack = track;
                const artist = (track.artists || []).map(a => a.name || a.title).join(", ") || track.artist || "";
                const title = track.title;
                const newKey = `${artist} - ${title}`;

                if (newKey === currentTrackKey) return;
                currentTrackKey = newKey;

                currentDuration = track.duration || currentDuration;

                const saved = getResumeState();
                if (saved && saved.track && saved.track.id === (track.id || track.trackId) && saved.position > 1) {
                    currentPosition = saved.position;
                } else {
                    currentPosition = 0;
                }

                saveResumeState(track, currentPosition, currentDuration);

                win.postMessage({
                    source: "YM_FREE_PAGE",
                    action: "RESOLVE_FULL_STREAM",
                    artist: artist,
                    title: title,
                    duration: track.duration
                }, "*");
            });

            win.externalAPI.on(win.externalAPI.EVENT_PROGRESS, () => {
                try {
                    const prog = win.externalAPI.getProgress();
                    if (prog && typeof prog.position === 'number' && prog.position > 0) {
                        currentPosition = prog.position;
                        currentDuration = prog.duration || currentDuration;
                        saveResumeState(activeTrack, currentPosition, currentDuration);
                    }
                } catch(e) {}
            });
        } catch(e) {}
    }

    setupExternalApi();
})();
