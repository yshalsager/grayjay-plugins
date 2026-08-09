(function() {

	function thumbnails$1(url) {
		return new Thumbnails([new Thumbnail(url, 0)]);
	}
	function audio_source_descriptor({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) {
		return audio_sources_descriptor([{
			name,
			url,
			language,
			duration,
			container,
			codec,
			bitrate
		}]);
	}
	function audio_sources_descriptor(sources) {
		return new UnMuxVideoSourceDescriptor([], sources.map(({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) => new AudioUrlSource({
			name,
			bitrate,
			container,
			codec,
			duration,
			url,
			language
		})));
	}

	function plugin_asset(config, path) {
		const url = String(path ?? "");
		if (/^https?:\/\//.test(url)) return url;
		const base = String(config?.sourceUrl ?? "").replace(/\/[^/]*$/, "/");
		return base ? `${base}${url.replace(/^\.\//, "")}` : url;
	}
	function plugin_icon_url(config, default_icon) {
		return config?.absoluteIconUrl ?? plugin_asset(config, config?.iconUrl ?? default_icon);
	}
	function static_thumbnails(config, default_icon) {
		return thumbnails$1(plugin_icon_url(config, default_icon));
	}

	function dedupe_strings(values, key = (value) => value) {
		const seen = {};
		const result = [];
		for (const value of values) {
			const dedupeKey = key(value);
			if (!dedupeKey || seen[dedupeKey]) continue;
			seen[dedupeKey] = true;
			result.push(value);
		}
		return result;
	}

	function selected_filter_values(filters, id) {
		if (!filters) return [];
		if (Array.isArray(filters)) return filters.filter((filter) => filter?.id === id || filter?.group?.id === id).map(filter_value).filter(Boolean);
		let value = filters[id];
		if (value === void 0 && typeof filters.get === "function") value = filters.get(id);
		if (value === void 0 || value === null) return [];
		return (Array.isArray(value) ? value : [value]).map(filter_value).filter(Boolean);
	}
	function filter_value(value) {
		return String(value?.value ?? value?.id ?? value ?? "");
	}

	function grayjay_platform(platform, get_config_id) {
		const platform_id = (id) => new PlatformID(platform, String(id), get_config_id());
		return {
			id: platform_id,
			author(id, name, url, thumbnail) {
				return new PlatformAuthorLink(platform_id(id), name, url, thumbnail);
			},
			feed_video(id, value) {
				return new PlatformVideo({
					id: platform_id(id),
					...value
				});
			},
			video(id, value) {
				return new PlatformVideoDetails({
					id: platform_id(id),
					...value
				});
			},
			nested(id, value) {
				return new PlatformNestedMediaContent({
					id: platform_id(id),
					...value
				});
			},
			web(id, value) {
				return new PlatformWebDetails({
					id: platform_id(id),
					...value
				});
			},
			channel(id, value) {
				return new PlatformChannel({
					id: platform_id(id),
					subscribers: 0,
					...value
				});
			},
			playlist(id, value) {
				return new PlatformPlaylist({
					id: platform_id(id),
					...value
				});
			},
			playlist_details(id, value) {
				return new PlatformPlaylistDetails({
					id: platform_id(id),
					...value
				});
			}
		};
	}

	var REDACTED = "[redacted]";
	var SENSITIVE_KEY = /authorization|cookie|token|secret|password|signature/i;
	function is_testing() {
		return typeof IS_TESTING !== "undefined" && IS_TESTING;
	}
	function debug_string(value, maxLength = 1200) {
		if (value === void 0) return "";
		const seen = [];
		let text;
		try {
			if (typeof value === "string") text = value;
			else if (value && typeof value === "object" && typeof value.message === "string") text = value.stack || `${value.name || "Error"}: ${value.message}`;
			else text = JSON.stringify(value, (key, item) => {
				if (SENSITIVE_KEY.test(key)) return REDACTED;
				if (item && typeof item === "object") {
					if (seen.indexOf(item) >= 0) return "[circular]";
					seen.push(item);
				}
				return item;
			});
		} catch {
			text = String(value);
		}
		return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
	}
	function debug_log(scope, message, data) {
		if (!is_testing()) return;
		const text = `[${scope}] ${message}${data === void 0 ? "" : ` ${debug_string(data)}`}`;
		if (typeof log === "function") log(text);
	}

	var BODY_PREVIEW_LENGTH = 500;
	function get_response(url, headers = {}, useAuth = false, debugContext = null) {
		const response = request("GET", url, "", headers, useAuth, debugContext);
		if (!response.isOk) throw request_error(response, url);
		return response;
	}
	function get_text(url, headers = {}, useAuth = false, debugContext = null) {
		return get_response(url, headers, useAuth, debugContext).body;
	}
	function get_json(url, headers = {}, useAuth = false, debugContext = null) {
		const text = get_text(url, headers, useAuth, debugContext);
		try {
			return JSON.parse(text);
		} catch (e) {
			debug_log(debug_scope(debugContext), "JSON parse failed", {
				url,
				error: String(e),
				preview: debug_string(text, BODY_PREVIEW_LENGTH)
			});
			throw e;
		}
	}
	function init_lru_caches(state, limits) {
		state.cacheOrder = state.cacheOrder ?? {};
		for (const cacheName of Object.keys(limits)) {
			state[cacheName] = state[cacheName] ?? {};
			if (!Array.isArray(state.cacheOrder[cacheName])) state.cacheOrder[cacheName] = Object.keys(state[cacheName]);
			prune_lru_cache(state, limits, cacheName);
		}
	}
	function cache_set(state, limits, cacheName, key, value) {
		if (!key) return value;
		state[cacheName] = state[cacheName] ?? {};
		state.cacheOrder = state.cacheOrder ?? {};
		state.cacheOrder[cacheName] = Array.isArray(state.cacheOrder[cacheName]) ? state.cacheOrder[cacheName] : Object.keys(state[cacheName]);
		const cacheKey = String(key);
		const order = state.cacheOrder[cacheName];
		const previousIndex = order.indexOf(cacheKey);
		if (previousIndex >= 0) order.splice(previousIndex, 1);
		state[cacheName][cacheKey] = value;
		order.push(cacheKey);
		prune_lru_cache(state, limits, cacheName);
		return value;
	}
	function cache_get(state, limits, cacheName, key) {
		const cacheKey = String(key);
		const value = state[cacheName]?.[cacheKey];
		if (value !== void 0) cache_set(state, limits, cacheName, cacheKey, value);
		return value;
	}
	function prune_lru_cache(state, limits, cacheName) {
		const limit = limits[cacheName];
		const order = state.cacheOrder?.[cacheName];
		if (!limit || !Array.isArray(order)) return;
		while (order.length > limit) {
			const key = order.shift();
			if (key) delete state[cacheName][key];
		}
	}
	function request(method, url, body, headers, useAuth, debugContext = null) {
		const start = Date.now();
		try {
			const response = method === "POST" ? http.POST(url, body, headers, useAuth) : http.GET(url, headers, useAuth);
			log_response(method, url, response, Date.now() - start, debugContext);
			return response;
		} catch (e) {
			debug_log(debug_scope(debugContext), "HTTP exception", {
				method,
				url,
				ms: Date.now() - start,
				error: String(e)
			});
			throw e;
		}
	}
	function log_response(method, url, response, ms, debugContext) {
		const details = {
			method,
			url,
			code: response?.code,
			ms,
			bytes: body_length(response)
		};
		if (response?.isOk) {
			debug_log(debug_scope(debugContext), "HTTP OK", details);
			return;
		}
		debug_log(debug_scope(debugContext), "HTTP failure", {
			...details,
			preview: body_preview(response)
		});
	}
	function request_error(response, url) {
		return new ScriptException(`Request failed with code ${response.code}: ${url}`);
	}
	function debug_scope(debugContext) {
		if (!debugContext) return "http";
		if (typeof debugContext === "string") return debugContext;
		return debugContext.scope || "http";
	}
	function body_length(response) {
		const body = response?.body;
		if (typeof body === "string") return body.length;
		return body?.length ?? body?.byteLength ?? 0;
	}
	function body_preview(response) {
		const body = response?.body;
		return typeof body === "string" ? debug_string(body, BODY_PREVIEW_LENGTH) : "";
	}

	function apply_pager_state(target, next) {
		target.results = next.results;
		target.hasMore = next.hasMore;
		target.context = next.context;
		return target;
	}
	function array_pager_class(BasePager) {
		return class ArrayPager extends BasePager {
			constructor(items, limit, offset = 0) {
				const results = items.slice(offset, offset + limit);
				super(results, offset + limit < items.length, {
					items,
					limit,
					offset: offset + limit
				});
			}
			nextPage() {
				return apply_pager_state(this, new this.constructor(this.context.items, this.context.limit, this.context.offset));
			}
		};
	}

	function quran_name(item, language = "ar") {
		if (typeof item?.name === "object") return String(item.name[language] ?? item.name.ar ?? item.name.en ?? Object.values(item.name)[0] ?? "").trim();
		if (item?.name) return String(item.name).trim();
		if (language === "ar") return String(item?.name_arabic ?? item?.translated_name?.name ?? item?.name_simple ?? "").trim();
		return String(item?.translated_name?.name ?? item?.name_simple ?? item?.name_arabic ?? "").trim();
	}
	function quran_filter_label(item, language = "ar") {
		return `${quran_name(item, language)} (${item.id})`;
	}
	function quran_id_from_filter(value, items, language = "ar", aliases = () => []) {
		const text = String(value ?? "").trim();
		const directId = Number(text);
		if (directId) return directId;
		const trailingId = Number(text.match(/\((\d+)\)$/)?.[1]);
		if (trailingId) return trailingId;
		return Number((items ?? []).find((item) => {
			return [
				quran_filter_label(item, language),
				quran_name(item, language),
				...aliases(item)
			].some((name) => name === text);
		})?.id);
	}
	function verse_reference(query) {
		const match = String(query ?? "").trim().match(/^(\d{1,3})\s*[:/]\s*(\d{1,3})$/);
		if (!match) return null;
		return {
			chapter: Number(match[1]),
			ayah: Number(match[2])
		};
	}

	var PLATFORM = "Quran.com";
	var BASE_URL = "https://quran.com";
	var API_BASE = "https://api.quran.com/api/v4";
	var DEFAULT_ICON = "https://quran.com/favicon.ico";
	var DEFAULT_LIMIT = 24;
	var CACHE_MAX_AGE_MS = 1440 * 60 * 1e3;
	var CACHE_LIMITS = {
		timedCache: 48,
		versesCache: 48
	};
	var LANGUAGES = ["ar", "en"];
	var DEFAULT_RECITER_IDS = [
		null,
		1,
		2
	];
	var CONTENT_TYPES = {
		AYAH: "ayah",
		TIMED: "timed"
	};
	var LABELS = {
		ar: {
			timedSurah: "تلاوة السورة بتوقيت الآيات",
			content: "المحتوى",
			reciter: "القارئ",
			surah: "السورة",
			style: "النمط",
			source: "المصدر",
			quranText: "نص القرآن",
			playlist: "قائمة القارئ"
		},
		en: {
			timedSurah: "Timed surah",
			content: "Content",
			reciter: "Reciter",
			surah: "Surah",
			style: "Style",
			source: "Source",
			quranText: "Quran text",
			playlist: "Reciter playlist"
		}
	};
	var DEFAULT_HEADERS = {
		"Content-Type": "application/json",
		"User-Agent": `grayjay.app/${bridge.buildVersion}`
	};
	var REGEX = {
		ROOT: /^https?:\/\/(?:www\.)?quran\.com\/?(?:[?#].*)?$/i,
		WEB_CHAPTER: /^https?:\/\/(?:www\.)?quran\.com\/(?:[a-z]{2}\/)?(\d{1,3})\/?(?:[?#].*)?$/i,
		WEB_AYAH: /^https?:\/\/(?:www\.)?quran\.com\/(?:[a-z]{2}\/)?(\d{1,3})\/(\d{1,3})(?:[/?#].*)?$/i,
		CHANNEL: /^qurancom:\/\/reciter\/(\d+)$/,
		PLAYLIST: /^qurancom:\/\/playlist\/(ayah|timed)\/(\d+)(?:\/(\d+))?$/,
		AYAH: /^qurancom:\/\/ayah\/(\d+)\/(\d+)\/(\d+)$/,
		TIMED: /^qurancom:\/\/timed\/(\d+)\/(\d+)$/,
		AUDIO_CDN: /^https?:\/\/audio\.qurancdn\.com\/(.+\/(\d{3})(\d{3})\.mp3)(?:[?#].*)?$/i,
		QURANIC_AUDIO: /^https?:\/\/download\.quranicaudio\.com\/.+\/0*(\d{1,3})\.mp3(?:[?#].*)?$/i
	};
	var _config = {};
	var _settings = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	var state = {
		language: "",
		catalogFetchedAt: 0,
		recitations: [],
		chapters: [],
		timedCache: {},
		versesCache: {},
		cacheOrder: {}
	};
	source.enable = function(conf, settings, savedState) {
		_config = conf ?? {};
		_settings = settings ?? {};
		if (savedState) try {
			state = JSON.parse(savedState);
		} catch (e) {
			logIfTesting("Failed to parse Quran.com state: " + e);
		}
		init_lru_caches(state, CACHE_LIMITS);
	};
	source.saveState = function() {
		return JSON.stringify(state);
	};
	source.getHome = function() {
		ensureCatalog();
		const firstChapter = state.chapters[0]?.id ?? 1;
		const primaryReciter = defaultReciter();
		return new ArrayVideoPager([primaryReciter, ...state.recitations.filter((reciter) => Number(reciter.id) !== Number(primaryReciter.id))].map((reciter) => timedToVideo(reciter, firstChapter)), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => searchCapabilities();
	source.getSearchChannelContentsCapabilities = () => searchCapabilities();
	source.getChannelCapabilities = () => searchCapabilities();
	source.searchSuggestions = function(query) {
		ensureCatalog();
		const q = normalize(query);
		return dedupe_strings([
			text("timedSurah"),
			...state.recitations.flatMap((reciter) => [
				reciterName(reciter),
				reciter.reciter_name,
				reciter.style
			]),
			...state.chapters.flatMap((chapter) => [
				chapterName(chapter),
				chapter.name_simple,
				chapter.name_arabic
			])
		]).filter((item) => item && (!q || normalize(item).indexOf(q) >= 0)).slice(0, 10);
	};
	source.search = function(query, _type, _order, filters) {
		ensureCatalog();
		const q = normalize(query);
		if (!q && !hasSearchFilters(filters)) return source.getHome();
		const reciters = selectedReciters(filters, q);
		const chapters = selectedChapters(filters, q, shouldSearchAllChapters(filters, q));
		const contentTypes = selectedContentTypes(filters);
		const results = [];
		for (const reciter of reciters) for (const chapter of chapters) if (contentTypes.indexOf(CONTENT_TYPES.TIMED) >= 0) results.push(timedToVideo(reciter, chapter.id));
		return new ArrayVideoPager(results, DEFAULT_LIMIT);
	};
	source.searchChannels = function(query) {
		ensureCatalog();
		const q = normalize(query);
		return new ArrayChannelPager(state.recitations.filter((reciter) => !q || reciterMatches(reciter, q)).map(reciterToChannel), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		return REGEX.ROOT.test(url) || REGEX.CHANNEL.test(url);
	};
	source.getChannel = function(url) {
		ensureCatalog();
		if (REGEX.ROOT.test(url)) return rootChannel();
		return reciterToChannel(reciterFromUrl(url));
	};
	source.getChannelContents = function(url, type, order, filters) {
		ensureCatalog();
		if (REGEX.ROOT.test(url)) return source.getHome();
		const reciter = reciterFromUrl(url);
		return source.search("", type, order, {
			...filterObject(filters),
			reciter: reciterFilterLabel(reciter)
		});
	};
	source.getPeekChannelTypes = () => [text("timedSurah")];
	source.peekChannelContents = function(url, _type) {
		ensureCatalog();
		if (REGEX.ROOT.test(url)) return source.getHome().results.slice(0, 6);
		const reciter = reciterFromUrl(url);
		return state.chapters.slice(0, 6).map((chapter) => timedToVideo(reciter, chapter.id));
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		ensureCatalog();
		if (REGEX.ROOT.test(url)) return source.search(query, type, order, filters);
		const reciter = reciterFromUrl(url);
		return source.search(query, type, order, {
			...filterObject(filters),
			reciter: reciterFilterLabel(reciter)
		});
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		ensureCatalog();
		const q = normalize(query);
		const mode = selectedPlaylistMode(filters);
		return new ArrayPlaylistPager(selectedReciters(filters, q).map((reciter) => playlistToPlatform(reciter, mode)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return REGEX.PLAYLIST.test(url);
	};
	source.getPlaylist = function(url) {
		ensureCatalog();
		const match = url.match(REGEX.PLAYLIST);
		if (!match) throw new ScriptException("Unsupported Quran.com playlist URL");
		const reciter = state.recitationById?.[match[2]];
		if (!reciter) throw new ScriptException("Quran.com playlist not found");
		return playlistDetails(reciter, match[1]);
	};
	source.getChannelPlaylists = function(url) {
		ensureCatalog();
		const mode = CONTENT_TYPES.TIMED;
		if (REGEX.ROOT.test(url)) return source.searchPlaylists("", null, null, { content: mode });
		return new ArrayPlaylistPager([playlistToPlatform(reciterFromUrl(url), mode)], DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		return Boolean(REGEX.AYAH.test(url) || REGEX.TIMED.test(url) || REGEX.WEB_AYAH.test(url) || REGEX.WEB_CHAPTER.test(url) || mediaParts(url));
	};
	source.getContentDetails = function(url) {
		ensureCatalog();
		const publicMedia = contentFromMediaUrl(url);
		if (publicMedia) return publicMedia;
		let match = url.match(REGEX.WEB_AYAH);
		if (match) return timedToVideo(defaultReciter(), Number(match[1]), true);
		match = url.match(REGEX.WEB_CHAPTER);
		if (match) return timedToVideo(defaultReciter(), Number(match[1]), true);
		match = url.match(REGEX.AYAH);
		if (match) return timedToVideo(reciterById(match[1]), Number(match[2]), true);
		match = url.match(REGEX.TIMED);
		if (match) return timedToVideo(reciterById(match[1]), Number(match[2]), true);
		throw new ScriptException("Unsupported Quran.com URL");
	};
	source.getContentChapters = function(url) {
		ensureCatalog();
		const parts = timedPartsFromUrl(url);
		if (!parts) return [];
		try {
			const verses = versesByKey(parts.chapterId);
			return timedAudio(parts.reciterId, parts.chapterId).timestamps.filter((item) => Number(item.timestamp_to) > Number(item.timestamp_from)).map((item) => ({
				name: `${item.verse_key} ${verses[item.verse_key] ?? ""}`.trim(),
				timeStart: Number(item.timestamp_from) / 1e3,
				timeEnd: Number(item.timestamp_to) / 1e3,
				type: Type.Chapter.NORMAL
			}));
		} catch (e) {
			logIfTesting("Failed to build Quran.com chapters: " + e);
			return [];
		}
	};
	function ensureCatalog() {
		const language = LANGUAGES[Number(_settings.language ?? 0)] ?? "ar";
		if (state.language === language && state.recitations?.length && state.chapters?.length && catalogIsFresh()) {
			rebuildIndexes();
			return;
		}
		state.language = language;
		state.catalogFetchedAt = Date.now();
		state.recitations = get_json(`${API_BASE}/resources/recitations?language=${language}`, DEFAULT_HEADERS).recitations ?? [];
		state.chapters = get_json(`${API_BASE}/chapters?language=${language}`, DEFAULT_HEADERS).chapters ?? [];
		sortCatalog();
		rebuildIndexes();
	}
	function catalogIsFresh() {
		const fetchedAt = Number(state.catalogFetchedAt ?? 0);
		return fetchedAt > 0 && Date.now() - fetchedAt < CACHE_MAX_AGE_MS;
	}
	function sortCatalog() {
		state.recitations = [...state.recitations ?? []].sort((a, b) => reciterName(a).localeCompare(reciterName(b), state.language || void 0));
		state.chapters = [...state.chapters ?? []].sort((a, b) => Number(a.id) - Number(b.id));
	}
	function rebuildIndexes() {
		state.recitationById = {};
		state.chapterById = {};
		for (const reciter of state.recitations ?? []) state.recitationById[String(reciter.id)] = reciter;
		for (const chapter of state.chapters ?? []) state.chapterById[Number(chapter.id)] = chapter;
	}
	function searchCapabilities() {
		ensureCatalog();
		return {
			types: [Type.Feed.Mixed],
			sorts: [Type.Order.Chronological],
			filters: [
				reciterFilter(),
				surahFilter(),
				styleFilter()
			]
		};
	}
	function reciterFilter() {
		return {
			id: "reciter",
			name: text("reciter"),
			isMultiSelect: false,
			filters: state.recitations.map((reciter) => ({
				id: reciterFilterLabel(reciter),
				name: reciterFilterLabel(reciter),
				value: reciterFilterLabel(reciter)
			}))
		};
	}
	function surahFilter() {
		return {
			id: "surah",
			name: text("surah"),
			isMultiSelect: false,
			filters: state.chapters.map((chapter) => ({
				id: chapterFilterLabel(chapter),
				name: chapterFilterLabel(chapter),
				value: chapterFilterLabel(chapter)
			}))
		};
	}
	function styleFilter() {
		const styles = dedupe_strings(state.recitations.map((reciter) => reciter.style).filter(Boolean));
		return {
			id: "style",
			name: text("style"),
			isMultiSelect: false,
			filters: styles.map((style) => ({
				id: style,
				name: style,
				value: style
			}))
		};
	}
	function timedToVideo(reciter, chapterId, includeDetails = false) {
		const chapter = chapterById(chapterId);
		const audioUrl = (includeDetails ? timedAudio(reciter.id, chapterId) : null)?.audio_url ?? timedPreviewUrl(reciter, chapterId);
		const details = grayjay.video(`timed-${reciter.id}-${chapterId}`, {
			name: `${chapterName(chapter)} - ${reciterName(reciter)}`,
			thumbnails: thumbnails(),
			author: reciterToAuthor(reciter),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: timedUrl(reciter.id, chapterId),
			description: contentDescription(reciter, chapter, text("timedSurah"), audioUrl),
			video: audio_source_descriptor({
				name: "Surah MP3",
				url: audioUrl,
				language: "ar"
			}),
			subtitles: includeDetails && subtitlesEnabled() ? timedSubtitles(reciter.id, chapterId) : [],
			shareUrl: `${BASE_URL}/${chapterId}`
		});
		details.getContentRecommendations = function() {
			return new ArrayVideoPager(relatedTimedChapters(reciter, chapter), DEFAULT_LIMIT);
		};
		return details;
	}
	function contentDescription(reciter, chapter, kind, audioUrl) {
		return [
			`${text("reciter")}: ${reciterName(reciter)}`,
			`${text("style")}: ${reciter.style ?? "-"}`,
			`${text("surah")}: ${chapterName(chapter)} (${chapter.id})`,
			kind,
			`${text("source")}: ${audioUrl}`
		].join("\n");
	}
	function reciterToAuthor(reciter) {
		return grayjay.author(reciter.id, reciterName(reciter), reciterUrl(reciter.id), iconUrl());
	}
	function rootChannel() {
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "Quran.com timed full-surah recitations.",
			url: BASE_URL,
			urlAlternatives: [BASE_URL]
		});
	}
	function reciterToChannel(reciter) {
		return grayjay.channel(reciter.id, {
			name: reciterName(reciter),
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: [reciter.reciter_name, reciter.style].filter(Boolean).join("\n"),
			url: reciterUrl(reciter.id),
			urlAlternatives: [reciterUrl(reciter.id)]
		});
	}
	function playlistToPlatform(reciter, mode) {
		return grayjay.playlist(`playlist-${mode}-${reciter.id}`, {
			name: `${reciterName(reciter)} - ${text("timedSurah")}`,
			thumbnails: thumbnails(),
			author: reciterToAuthor(reciter),
			datetime: 0,
			url: playlistUrl(mode, reciter.id),
			videoCount: state.chapters.length,
			thumbnail: iconUrl()
		});
	}
	function playlistDetails(reciter, mode) {
		const contents = state.chapters.map((chapter) => timedToVideo(reciter, chapter.id));
		return grayjay.playlist_details(`playlist-${mode}-${reciter.id}`, {
			name: `${reciterName(reciter)} - ${text("timedSurah")}`,
			thumbnails: thumbnails(),
			author: reciterToAuthor(reciter),
			datetime: 0,
			url: playlistUrl(mode, reciter.id),
			videoCount: contents.length,
			thumbnail: iconUrl(),
			contents: new ArrayVideoPager(contents, DEFAULT_LIMIT)
		});
	}
	function relatedTimedChapters(reciter, chapter) {
		const items = [];
		const seen = {};
		const add = (targetReciter, chapterId) => {
			if (!targetReciter || !state.chapterById?.[Number(chapterId)]) return;
			const url = timedUrl(targetReciter.id, chapterId);
			if (seen[url] || url === timedUrl(reciter.id, chapter.id)) return;
			seen[url] = true;
			items.push(timedToVideo(targetReciter, chapterId));
		};
		add(reciter, Number(chapter.id) + 1);
		add(reciter, Number(chapter.id) - 1);
		for (const other of state.recitations ?? []) add(other, chapter.id);
		return items;
	}
	function timedAudio(reciterId, chapterId) {
		const key = `${reciterId}-${chapterId}`;
		const cached = cache_get(state, CACHE_LIMITS, "timedCache", key);
		if (cached) return cached;
		const response = get_json(`${API_BASE}/chapter_recitations/${reciterId}/${chapterId}?segments=true`, DEFAULT_HEADERS);
		if (!response.audio_file?.audio_url) throw new ScriptException(`Quran.com timed recitation not found: ${reciterId}/${chapterId}`);
		return cache_set(state, CACHE_LIMITS, "timedCache", key, response.audio_file);
	}
	function timedPreviewUrl(reciter, chapterId) {
		try {
			return timedAudio(reciter.id, chapterId).audio_url;
		} catch {
			return `${API_BASE}/chapter_recitations/${reciter.id}/${chapterId}?segments=true`;
		}
	}
	function versesByKey(chapterId) {
		const key = String(chapterId);
		const cached = cache_get(state, CACHE_LIMITS, "versesCache", key);
		if (cached) return cached;
		const response = get_json(`${API_BASE}/quran/verses/uthmani?chapter_number=${chapterId}`, DEFAULT_HEADERS);
		const verses = {};
		for (const verse of response.verses ?? []) verses[verse.verse_key] = verse.text_uthmani;
		return cache_set(state, CACHE_LIMITS, "versesCache", key, verses);
	}
	function timedSubtitles(reciterId, chapterId) {
		try {
			const verses = versesByKey(chapterId);
			const cues = timedAudio(reciterId, chapterId).timestamps.filter((item) => verses[item.verse_key] && Number(item.timestamp_to) > Number(item.timestamp_from)).map((item) => `${vttTimestamp(item.timestamp_from)} --> ${vttTimestamp(item.timestamp_to)}\n${verses[item.verse_key]}`);
			return [{
				name: text("quranText"),
				language: "ar",
				format: "text/vtt",
				url: `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n${cues.join("\n\n")}\n`)}`
			}];
		} catch (e) {
			logIfTesting("Failed to build Quran.com subtitles: " + e);
			return [];
		}
	}
	function contentFromMediaUrl(url) {
		const parts = mediaParts(url);
		if (!parts) return null;
		if (parts.type === CONTENT_TYPES.AYAH) return timedToVideo(defaultReciter(), parts.chapterId, true);
		if (parts.type === CONTENT_TYPES.TIMED) {
			const normalized = normalizeMediaUrl(url);
			for (const reciter of state.recitations ?? []) if (normalizeMediaUrl(timedAudio(reciter.id, parts.chapterId).audio_url) === normalized) return timedToVideo(reciter, parts.chapterId, true);
		}
		return null;
	}
	function mediaParts(url) {
		let match = String(url ?? "").match(REGEX.AUDIO_CDN);
		if (match) return {
			type: CONTENT_TYPES.AYAH,
			relativeUrl: match[1],
			chapterId: Number(match[2]),
			ayahNumber: Number(match[3])
		};
		match = String(url ?? "").match(REGEX.QURANIC_AUDIO);
		if (match) return {
			type: CONTENT_TYPES.TIMED,
			chapterId: Number(match[1])
		};
		return null;
	}
	function timedPartsFromUrl(url) {
		const match = String(url ?? "").match(REGEX.TIMED);
		if (match) return {
			reciterId: Number(match[1]),
			chapterId: Number(match[2])
		};
		const media = mediaParts(url);
		if (media?.type === CONTENT_TYPES.TIMED) return {
			reciterId: defaultReciter().id,
			chapterId: media.chapterId
		};
		return null;
	}
	function selectedContentTypes(filters) {
		const selected = selected_filter_values(filters, "content");
		if (selected.length) return selected.indexOf(CONTENT_TYPES.TIMED) >= 0 || selected.indexOf(CONTENT_TYPES.AYAH) >= 0 ? [CONTENT_TYPES.TIMED] : [];
		return [CONTENT_TYPES.TIMED];
	}
	function selectedPlaylistMode(filters) {
		return selectedContentTypes(filters)[0] ?? CONTENT_TYPES.TIMED;
	}
	function subtitlesEnabled() {
		return Number(_settings.subtitles ?? 0) !== 1;
	}
	function selectedReciters(filters, query) {
		const selectedIds = selected_filter_values(filters, "reciter").map(reciterIdFromFilter).filter(Boolean);
		const selectedStyles = selected_filter_values(filters, "style").map((item) => normalize(item));
		const queryMatchesChapter = Boolean(query && ((state.chapters ?? []).some((chapter) => chapterMatches(chapter, query)) || verse_reference(query)));
		return (state.recitations ?? []).filter((reciter) => (!selectedIds.length || selectedIds.indexOf(Number(reciter.id)) >= 0) && (!selectedStyles.length || selectedStyles.indexOf(normalize(reciter.style)) >= 0) && (!query || reciterMatches(reciter, query) || queryMatchesChapter || selectedIds.length || selectedStyles.length || selected_filter_values(filters, "surah").length));
	}
	function selectedChapters(filters, query, allWhenUnscoped = false) {
		const selectedIds = selected_filter_values(filters, "surah").map(chapterIdFromFilter).filter(Boolean);
		const ref = verse_reference(query);
		if (ref) return [chapterById(ref.chapter)];
		const matches = (state.chapters ?? []).filter((chapter) => !query || chapterMatches(chapter, query));
		if (selectedIds.length) return selectedIds.map(chapterById);
		if (!query && !allWhenUnscoped) return [state.chapters[0]];
		return matches.length ? matches : allWhenUnscoped ? state.chapters : [state.chapters[0]];
	}
	function hasSearchFilters(filters) {
		return [
			"content",
			"reciter",
			"surah",
			"style"
		].some((id) => selected_filter_values(filters, id).length > 0);
	}
	function shouldSearchAllChapters(filters, query) {
		if (selected_filter_values(filters, "surah").length) return false;
		if (selected_filter_values(filters, "reciter").length || selected_filter_values(filters, "style").length) return true;
		return Boolean(query && (state.recitations ?? []).some((reciter) => reciterMatches(reciter, query)));
	}
	function filterObject(filters) {
		const object = {};
		if (!filters) return object;
		for (const id of [
			"content",
			"reciter",
			"surah",
			"style"
		]) {
			const values = selected_filter_values(filters, id);
			if (values.length) object[id] = values;
		}
		return object;
	}
	function reciterIdFromFilter(value) {
		const textValue = String(value ?? "").trim();
		const trailingId = Number(textValue.match(/\((\d+)\)$/)?.[1]);
		if (trailingId) return trailingId;
		return Number((state.recitations ?? []).find((reciter) => reciterFilterLabel(reciter) === textValue || reciterName(reciter) === textValue)?.id);
	}
	function chapterIdFromFilter(value) {
		return quran_id_from_filter(value, state.chapters, state.language);
	}
	function reciterFromUrl(url) {
		const match = String(url ?? "").match(REGEX.CHANNEL);
		if (!match) throw new ScriptException("Unsupported Quran.com channel URL");
		return reciterById(match[1]);
	}
	function reciterById(id) {
		const reciter = state.recitationById?.[String(id)];
		if (!reciter) throw new ScriptException("Quran.com reciter not found");
		return reciter;
	}
	function defaultReciter() {
		const reciterId = DEFAULT_RECITER_IDS[Number(_settings.defaultReciter ?? 0)];
		return reciterId ? state.recitationById?.[String(reciterId)] ?? state.recitations[0] : state.recitations[0];
	}
	function chapterById(id) {
		const chapter = state.chapterById?.[Number(id)];
		if (!chapter) throw new ScriptException("Quran.com chapter not found");
		return chapter;
	}
	function reciterName(reciter) {
		return String(reciter.translated_name?.name || reciter.reciter_name || reciter.id).trim();
	}
	function chapterName(chapter) {
		return quran_name(chapter, state.language);
	}
	function reciterFilterLabel(reciter) {
		return `${reciterName(reciter)}${reciter.style ? ` - ${reciter.style}` : ""} (${reciter.id})`;
	}
	function chapterFilterLabel(chapter) {
		return quran_filter_label(chapter, state.language);
	}
	function reciterMatches(reciter, query) {
		return normalize(reciterName(reciter)).indexOf(query) >= 0 || normalize(reciter.reciter_name).indexOf(query) >= 0 || normalize(reciter.style).indexOf(query) >= 0 || String(reciter.id) === query;
	}
	function chapterMatches(chapter, query) {
		return normalize(chapterName(chapter)).indexOf(query) >= 0 || normalize(chapter.name_simple).indexOf(query) >= 0 || normalize(chapter.name_arabic).indexOf(query) >= 0 || String(chapter.id) === query;
	}
	function text(key) {
		return LABELS[state.language]?.[key] ?? LABELS.en[key] ?? key;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function thumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function normalize(value) {
		return String(value ?? "").toLowerCase().trim();
	}
	function normalizeMediaUrl(value) {
		return String(value ?? "").replace(/^http:\/\//, "https://").replace(/[?#].*$/, "").trim().toLowerCase();
	}
	function vttTimestamp(ms) {
		const value = Math.max(0, Number(ms) || 0);
		const hours = Math.floor(value / 36e5);
		const minutes = Math.floor(value % 36e5 / 6e4);
		const seconds = Math.floor(value % 6e4 / 1e3);
		const milliseconds = Math.floor(value % 1e3);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
	}
	function reciterUrl(id) {
		return `qurancom://reciter/${id}`;
	}
	function playlistUrl(mode, reciterId) {
		return `qurancom://playlist/${mode}/${reciterId}`;
	}
	function timedUrl(reciterId, chapterId) {
		return `qurancom://timed/${reciterId}/${chapterId}`;
	}
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	function logIfTesting(msg) {
		if (typeof IS_TESTING !== "undefined" && IS_TESTING) log(msg);
	}
	log("LOADED");

})();
