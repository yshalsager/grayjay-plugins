(function() {

	function thumbnails(url) {
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
		return thumbnails(plugin_icon_url(config, default_icon));
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
	function post_text(url, body = "", headers = {}, useAuth = false, debugContext = null) {
		const response = request("POST", url, body, headers, useAuth, debugContext);
		if (!response.isOk) throw request_error(response, url);
		return response.body;
	}
	function post_json(url, body = "", headers = {}, useAuth = false, debugContext = null) {
		const text = post_text(url, body, headers, useAuth, debugContext);
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

	function decode_html(value) {
		return String(value ?? "").replace(/&#0*39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
	}
	function clean_text(value) {
		return decode_html(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
	}
	function normalize_text(value) {
		return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
	}
	function normalize_search_text(value) {
		return normalize_text(value).replace(/[\u064b-\u065f\u0670]/g, "").replace(/[إأآٱا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ـ/g, "").replace(/[^\w\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
	}

	var PLATFORM = "BinOthaimeen";
	var BASE_URL = "https://binothaimeen.net";
	var API_URL = "https://shekhapi.binothaimeen.net";
	var SEARCH_URL = "https://shekhcp.binothaimeen.net/api/search-data";
	var SOUND_URL = "https://sounds.binothaimeen.net";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { jsonCache: 120 };
	var _config = {};
	var _state = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	source.enable = function(conf, _settings, savedState) {
		_config = conf ?? {};
		_state = parseState(savedState);
		init_lru_caches(_state, CACHE_LIMITS);
	};
	source.saveState = function() {
		return "{}";
	};
	source.getHome = function() {
		return new ArrayVideoPager(rootSections().flatMap((section) => fetchLessons(section.id, 1).data.slice(0, section.children_count ? 2 : 4).map((lesson) => lessonToContent(lesson, section))).filter(Boolean), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"الفتاوى",
			"الصلاة",
			"المرأة",
			"العقيدة",
			"التفسير",
			"الحج",
			"الصيام"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, _filters) {
		if (!normalize_search_text(query)) return source.getHome();
		return new OthaimeenSearchPager(query);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "root" || parsed?.type === "section" || normalized === BASE_URL || normalized === "https://shekh.binothaimeen.net";
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "section") return sectionChannel(sectionById(parsed.id));
		return grayjay.channel("root", {
			name: "الشيخ ابن عثيمين",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "المكتبة الصوتية للشيخ محمد بن صالح العثيمين.",
			url: "binothaimeen://root",
			urlAlternatives: [BASE_URL, "https://shekh.binothaimeen.net"]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		return new OthaimeenLessonPager(parsed?.type === "section" ? parsed.id : rootSections()[0].id);
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		const needle = normalize_search_text(query);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : rootSections()[0];
		return new ArrayVideoPager(fetchLessons(section.id, 1).data.map((lesson) => lessonToContent(lesson, section)).filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle))), DEFAULT_LIMIT);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([source.getChannel("binothaimeen://root"), ...rootSections().map(sectionChannel)].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist";
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(rootSections().filter(isPlaylistSection).filter((section) => !needle || normalize_search_text(sectionTitle(section)).includes(needle)).map(sectionToPlaylist), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type !== "playlist") throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const section = sectionById(parsed.id);
		return grayjay.playlist_details(`playlist-${section.id}`, {
			name: sectionTitle(section),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url,
			videoCount: section.many_all_lessons_count || section.many_lessons_count || 0,
			contents: new OthaimeenLessonPager(section.id)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		return new ArrayPlaylistPager((parsed?.type === "section" ? fetchChildren(parsed.id, 1).data : rootSections()).filter(isPlaylistSection).map(sectionToPlaylist), DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "audio" || /^https:\/\/sounds\.binothaimeen\.net\/.*\.mp3(?:$|\?)/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "audio") return lessonToDetails(fetchLesson(parsed.id), parsed.section ? sectionById(parsed.section) : null);
		const normalized = normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized);
		throw new ScriptException(`Unsupported ${PLATFORM} content URL`);
	};
	function parseState(value) {
		try {
			return JSON.parse(value || "{}");
		} catch (_e) {
			return {};
		}
	}
	function fetchJson(url) {
		const cached = cache_get(_state, CACHE_LIMITS, "jsonCache", url);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "jsonCache", url, get_json(url, { Accept: "application/json" }));
	}
	function rootSections() {
		return fetchJson(`${API_URL}/course/sections/audio_library/10`).data ?? [];
	}
	function fetchChildren(id, page = 1) {
		return fetchJson(`${API_URL}/course/sections/audio_library/children/${id}?pageSize=${DEFAULT_LIMIT}&page=${page}`);
	}
	function fetchLessons(id, page = 1) {
		return fetchJson(`${API_URL}/course/sections/audio_library/many_lessons/${id}/${DEFAULT_LIMIT}?page=${page}`);
	}
	function fetchLesson(id) {
		return fetchJson(`${API_URL}/lessons/audios/show/${id}/0/1?getManySectionsWithAllParent=audio_library&getAllPaths=1`).data;
	}
	function fetchSearch(query, page = 1) {
		const key = `search:${query}:${page}`;
		const cached = cache_get(_state, CACHE_LIMITS, "jsonCache", key);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "jsonCache", key, post_json(SEARCH_URL, JSON.stringify({
			pageSize: DEFAULT_LIMIT,
			searchTerm: query,
			type: "audios",
			page,
			mode: "wide"
		}), {
			"Content-Type": "application/json",
			Accept: "application/json"
		}));
	}
	function lessonToContent(lesson, section = null) {
		if (!audioUrl(lesson.certificate_url)) return null;
		return grayjay.feed_video(`audio-${lesson.id}`, {
			name: titleText(lesson.title),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: parseDate(lesson.created_at || lesson.publish_date),
			duration: 0,
			viewCount: Number(lesson.views || 0),
			isLive: false,
			url: audioInternalUrl(lesson.id, section?.id),
			description: clean_text(lesson.objective?.content?.ar || ""),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: audioUrl(lesson.certificate_url),
				language: "ar"
			}),
			shareUrl: audioUrl(lesson.certificate_url)
		});
	}
	function searchResultToContent(item) {
		return grayjay.feed_video(`audio-${item.id}`, {
			name: titleText(item.title),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: audioInternalUrl(item.id),
			description: titleText(item.content)
		});
	}
	function lessonToDetails(lesson, section = null) {
		const resolvedSection = section ?? lesson.many_sections?.[0] ?? lesson.paths?.[0] ?? null;
		return grayjay.video(`audio-${lesson.id}`, {
			name: titleText(lesson.title),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: parseDate(lesson.created_at || lesson.publish_date),
			duration: 0,
			viewCount: Number(lesson.views || 0),
			isLive: false,
			url: audioInternalUrl(lesson.id, resolvedSection?.id),
			description: clean_text(lesson.objective?.content?.ar || lesson.description?.ar || ""),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: audioUrl(lesson.certificate_url),
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: audioUrl(lesson.certificate_url),
			getContentRecommendations: () => resolvedSection?.id ? new OthaimeenLessonPager(resolvedSection.id) : source.getHome()
		});
	}
	function directMp3ToDetails(url) {
		return grayjay.video(`mp3-${normalize_search_text(url).slice(-60)}`, {
			name: decodeTitle(url),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url,
			description: PLATFORM,
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: url
		});
	}
	function audioUrl(value) {
		const raw = normalizePublicUrl(value);
		if (!raw) return "";
		if (/^https?:\/\//i.test(raw)) return raw;
		if (raw.includes("/storage")) return `${SOUND_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
		return `${SOUND_URL}/storage/${raw.replace(/^\/+/, "")}`;
	}
	function sectionChannel(section) {
		return grayjay.channel(`section-${section.id}`, {
			name: sectionTitle(section),
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${sectionTitle(section)} - الشيخ ابن عثيمين`,
			url: sectionUrl(section.id),
			urlAlternatives: [BASE_URL]
		});
	}
	function sectionToPlaylist(section) {
		return grayjay.playlist(`playlist-${section.id}`, {
			name: sectionTitle(section),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(section.id),
			videoCount: section.many_all_lessons_count || section.many_lessons_count || 0
		});
	}
	function sectionById(id) {
		return rootSections().find((section) => section.id === id) ?? {
			id,
			title: { ar: "قسم صوتي" },
			many_all_lessons_count: 0
		};
	}
	function isPlaylistSection(section) {
		return (section.many_lessons_count || 0) > 0 || (section.children_count || 0) === 0 && (section.many_all_lessons_count || 0) > 0;
	}
	function rootAuthor() {
		return grayjay.author("binothaimeen", "الشيخ محمد بن صالح العثيمين", BASE_URL, iconUrl());
	}
	function titleText(value) {
		return clean_text(typeof value === "object" ? value.ar || value.en || value.fr : value);
	}
	function sectionTitle(section) {
		return titleText(section.title);
	}
	function parseDate(value) {
		const raw = String(value ?? "");
		const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
		if (match) return Math.floor((/* @__PURE__ */ new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`)).getTime() / 1e3);
		return Math.floor(new Date(raw).getTime() / 1e3) || 0;
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, "") || PLATFORM).replace(/[-_]+/g, " ");
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("//")) return `https:${raw}`;
		if (raw.startsWith("/")) return raw;
		return raw.replace(/^http:\/\//i, "https://");
	}
	function sectionUrl(id) {
		return `binothaimeen://section/${id}`;
	}
	function playlistUrl(id) {
		return `binothaimeen://playlist/section/${id}`;
	}
	function audioInternalUrl(id, sectionId = "") {
		return `binothaimeen://audio/${id}${sectionId ? `/${sectionId}` : ""}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "binothaimeen://root") return { type: "root" };
		let match = value.match(/^binothaimeen:\/\/section\/([^/]+)$/);
		if (match) return {
			type: "section",
			id: match[1]
		};
		match = value.match(/^binothaimeen:\/\/playlist\/section\/([^/]+)$/);
		if (match) return {
			type: "playlist",
			id: match[1]
		};
		match = value.match(/^binothaimeen:\/\/audio\/([^/]+)\/?([^/]*)$/);
		if (match) return {
			type: "audio",
			id: match[1],
			section: match[2] || ""
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var OthaimeenLessonPager = class OthaimeenLessonPager extends VideoPager {
		constructor(sectionId, page = 1) {
			const section = sectionById(sectionId);
			const data = fetchLessons(sectionId, page);
			super((data.data ?? []).map((lesson) => lessonToContent(lesson, section)).filter(Boolean), page < (data.meta?.last_page || 1), {
				sectionId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new OthaimeenLessonPager(this.context.sectionId, this.context.page + 1));
		}
	};
	var OthaimeenSearchPager = class OthaimeenSearchPager extends VideoPager {
		constructor(query, page = 1) {
			const response = fetchSearch(query, page);
			super((response.data ?? []).map(searchResultToContent), Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page), {
				query,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new OthaimeenSearchPager(this.context.query, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED BinOthaimeen " + staticThumbnails().sources.length);

})();
