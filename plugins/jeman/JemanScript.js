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

	var PLATFORM = "Jeman";
	var BASE_URL = "https://j-eman.net";
	var API_URL = "https://apis.j-eman.net";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var CATEGORY_LIMIT = 500;
	var CACHE_LIMITS = { jsonCache: 80 };
	var AUDIO_TABS = [
		{
			id: "lessons",
			name: "الدروس"
		},
		{
			id: "simplifyscience",
			name: "تقريب العلم"
		},
		{
			id: "lectures",
			name: "الخطب المنبرية"
		},
		{
			id: "programsquestions",
			name: "سؤالات البرامج"
		},
		{
			id: "occasionsdoctrine",
			name: "فقه المناسبات"
		},
		{
			id: "words",
			name: "الكلمات والمواعظ"
		},
		{
			id: "sciencelectures",
			name: "المحاضرات العلمية"
		},
		{
			id: "scientificmeetings",
			name: "اللقاءات العلمية"
		}
	];
	var VIDEO_TABS = [
		{
			id: "lessonsbenefits",
			name: "فوائد الدروس"
		},
		{
			id: "visuallessons",
			name: "دروس مرئية"
		},
		{
			id: "translatedclips",
			name: "مقاطع مترجمة"
		}
	];
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
		return new ArrayVideoPager([...fetchList("pgsounds", "sciencelectures", 1).data.slice(0, 10).map(audioToDetails), ...fetchList("pgclips", "visuallessons", 1).data.slice(0, 10).map(apiItemToContent)].filter(Boolean), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [kindFilter(), tabFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"العلم",
			"التوحيد",
			"الصيام",
			"الحج",
			"الدروس",
			"الخطب",
			"فوائد الدروس"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		const kind = selectedKind(filters);
		const tabs = selectedTabs(filters, kind);
		if (!needle) {
			const items = [];
			for (const tab of tabs.slice(0, 3)) items.push(...fetchTabPage(tab, 1).map(apiItemToContent));
			return new ArrayVideoPager(items.filter(Boolean), DEFAULT_LIMIT);
		}
		const selected = selected_filter_values(filters, "tab");
		if (kind === "video" || selected.length) return new JemanTabSearchPager(query, kind, selected);
		return new JemanSearchPager(query, kind);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "root" || parsed?.type === "tab" || parsed?.type === "category" || normalizePublicUrl(url) === BASE_URL;
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "tab") return tabChannel(tabByKind(parsed.kind, parsed.tab), parsed.kind);
		if (parsed?.type === "category") return categoryChannel(categoryById(parsed.kind, parsed.tab, parsed.categoryId), parsed.kind, parsed.tab);
		return grayjay.channel("root", {
			name: "Jeman",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "برامج الدعوة والإرشاد لفضيلة الشيخ صالح العصيمي.",
			url: "jeman://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "tab") return new JemanPager(parsed.kind, parsed.tab);
		if (parsed?.type === "category") return new JemanPager(parsed.kind, parsed.tab, parsed.categoryId);
		return source.getHome();
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
		if (parsed?.type === "tab" || parsed?.type === "category") return new ArrayVideoPager(fetchChannelPage(parsed, 1).filter((item) => !needle || normalize_search_text(`${item.title} ${categoryTitle(item)}`).includes(needle)).map(apiItemToContent), DEFAULT_LIMIT);
		return source.search(query, null, null, null);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([
			source.getChannel("jeman://root"),
			...AUDIO_TABS.map((tab) => tabChannel(tab, "audio")),
			...VIDEO_TABS.map((tab) => tabChannel(tab, "video")),
			...AUDIO_TABS.flatMap((tab) => categories("audio", tab.id).slice(0, 12).map((category) => categoryChannel(category, "audio", tab.id))),
			...VIDEO_TABS.flatMap((tab) => categories("video", tab.id).slice(0, 12).map((category) => categoryChannel(category, "video", tab.id)))
		].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist";
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(selectedTabs(filters, selectedKind(filters)).flatMap((tab) => playableCategories(tab.kind, tab.id).map((category) => categoryToPlaylist(category, tab.kind, tab.id))).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type !== "playlist") throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const category = categoryById(parsed.kind, parsed.tab, parsed.categoryId);
		return grayjay.playlist_details(`playlist-${parsed.kind}-${parsed.tab}-${parsed.categoryId}`, {
			name: category.title,
			thumbnails: imageThumbnails(category.image_url),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: parseDate(category.publish_date),
			url,
			videoCount: 0,
			contents: new JemanPager(parsed.kind, parsed.tab, parsed.categoryId)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "tab") return new ArrayPlaylistPager(playableCategories(parsed.kind, parsed.tab).map((category) => categoryToPlaylist(category, parsed.kind, parsed.tab)), DEFAULT_LIMIT);
		if (parsed?.type === "category") return new ArrayPlaylistPager([categoryToPlaylist(categoryById(parsed.kind, parsed.tab, parsed.categoryId), parsed.kind, parsed.tab)], DEFAULT_LIMIT);
		return source.searchPlaylists("", null, null, null);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "audio" || parsed?.type === "video" || /^https:\/\/apis\.j-eman\.net\/storage\/.*\.mp3/i.test(normalized) || /^https:\/\/j-eman\.net\/video\/[^/]+\/show\/[^/]+/i.test(normalized) || /^https:\/\/www\.youtube\.com\/watch\?v=/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "audio") return audioToDetails(fetchDetail("pgsounds", parsed.tab, parsed.id));
		if (parsed?.type === "video") return clipToNested(fetchDetail("pgclips", parsed.tab, parsed.id));
		const normalized = normalizePublicUrl(url);
		if (/^https:\/\/apis\.j-eman\.net\/storage\/.*\.mp3/i.test(normalized)) return directMp3ToDetails(normalized);
		const publicVideo = normalized.match(/^https:\/\/j-eman\.net\/video\/([^/]+)\/show\/([^/]+)/i);
		if (publicVideo) return clipToNested(fetchDetail("pgclips", publicVideo[1], publicVideo[2]));
		const youtubeId = normalized.match(/[?&]v=([^&]+)/)?.[1];
		if (youtubeId) return youtubeToNested(youtubeId);
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
		return cache_set(_state, CACHE_LIMITS, "jsonCache", url, get_json(url));
	}
	function fetchList(endpoint, tab, page = 1, categoryId = null) {
		return fetchJson(`${API_URL}/${categoryId ? `${endpoint}/${tab}/bycategory/${categoryId}/0/${DEFAULT_LIMIT}` : `${endpoint}/${tab}/0/${DEFAULT_LIMIT}`}?page=${page}`);
	}
	function fetchTabPage(tab, page) {
		return fetchList(tab.kind === "video" ? "pgclips" : "pgsounds", tab.id, page).data ?? [];
	}
	function fetchChannelPage(parsed, page) {
		return fetchList(parsed.kind === "video" ? "pgclips" : "pgsounds", parsed.tab, page, parsed.categoryId).data ?? [];
	}
	function fetchDetail(endpoint, tab, id) {
		return fetchJson(`${API_URL}/${endpoint}/${tab}/show/${id}`).data;
	}
	function fetchSearch(query, page = 1) {
		return fetchJson(`${API_URL}/globalsearch/${encodeURIComponent(query)}/0/${DEFAULT_LIMIT}?page=${page}`);
	}
	function categories(kind, tab) {
		return flattenCategories(fetchJson(`${API_URL}/${kind === "video" ? "pgclipcategories" : "pgsoundcategories"}/${tab}/parentCategory/0/${CATEGORY_LIMIT}`).data ?? []);
	}
	function playableCategories(kind, tab) {
		return categories(kind, tab).filter((category) => !category.children?.length);
	}
	function flattenCategories(items) {
		const result = [];
		for (const item of items) {
			result.push(item);
			result.push(...flattenCategories(item.children ?? []));
		}
		return result;
	}
	function audioToDetails(item) {
		const audioUrl = storageUrl(item.file_url || item.sound_url);
		if (!audioUrl) throw new ScriptException("No playable Jeman MP3 found");
		const details = grayjay.video(`audio-${item.type}-${item.id}`, {
			name: item.title,
			thumbnails: imageThumbnails(item.image_url),
			author: rootAuthor(),
			uploadDate: parseDate(item.publish_date),
			duration: 0,
			viewCount: Number(item.views || 0),
			isLive: false,
			url: audioUrlInternal(item.type, item.id),
			description: clean_text(item.description || item.content || ""),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: audioUrl,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: `${BASE_URL}/sounds/${item.type}/${item.pgsoundcategories_id || 0}/1`
		});
		details.getContentRecommendations = function() {
			if (item.pgsoundcategories_id) return new JemanPager("audio", item.type, item.pgsoundcategories_id);
			return new JemanPager("audio", item.type);
		};
		return details;
	}
	function clipToNested(item) {
		const youtubeId = item.clip_code || String(item.clip_url ?? "").match(/\/embed\/([^"/?]+)/)?.[1];
		if (!youtubeId) throw new ScriptException("No playable Jeman YouTube clip found");
		return grayjay.nested(`video-${item.type}-${item.id}`, {
			name: item.title,
			author: rootAuthor(),
			datetime: parseDate(item.publish_date),
			url: videoUrlInternal(item.type, item.id),
			contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
			contentName: item.title,
			contentDescription: clean_text(item.description || item.content || ""),
			contentProvider: "YouTube",
			contentThumbnails: imageThumbnails(item.image_url || `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`)
		});
	}
	function apiItemToContent(item) {
		if (item.clip_code || item.clip_url) try {
			return clipToNested(item);
		} catch (_e) {
			return null;
		}
		return audioToDetails(item);
	}
	function searchItemToContent(item, kind) {
		const html = `${item.content ?? ""} ${item.description ?? ""}`;
		if (kind !== "video") {
			const direct = String(item.sound_url || item.file_url || "");
			const match = html.match(/href=["']([^"']+\.mp3(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/i);
			const url = storageUrl(direct && /\.mp3(?:$|\?)/i.test(direct) ? direct : decode_html(match?.[1] || ""));
			if (url) return directMp3ToDetails(url, clean_text(match?.[2] || item.title));
		}
		if (kind !== "audio") {
			const id = item.clip_code || String(item.clip_url || html).match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([^"'&?/]+)/i)?.[1];
			if (id) return youtubeToNested(id, clean_text(item.title));
		}
		return null;
	}
	function directMp3ToDetails(url, name = "") {
		return grayjay.video(`mp3-${url.split("/").pop()}`, {
			name: name || decodeURIComponent(url.split("/").pop().replace(/\.mp3(?:\?.*)?$/i, "")).replace(/[-_]+/g, " "),
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url,
			description: "",
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
	function youtubeToNested(id, name = "YouTube") {
		return grayjay.nested(`youtube-${id}`, {
			name,
			author: rootAuthor(),
			datetime: 0,
			url: `https://www.youtube.com/watch?v=${id}`,
			contentUrl: `https://www.youtube.com/watch?v=${id}`,
			contentName: name,
			contentDescription: "",
			contentProvider: "YouTube",
			contentThumbnails: imageThumbnails(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
		});
	}
	function categoryToPlaylist(category, kind, tab) {
		return grayjay.playlist(`playlist-${kind}-${tab}-${category.id}`, {
			name: category.title,
			thumbnails: imageThumbnails(category.image_url),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: parseDate(category.publish_date),
			url: playlistUrlInternal(kind, tab, category.id),
			videoCount: 0
		});
	}
	function tabChannel(tab, kind) {
		return grayjay.channel(`tab-${kind}-${tab.id}`, {
			name: tab.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${kind === "video" ? "مرئيات" : "صوتيات"} ${tab.name}`,
			url: tabUrlInternal(kind, tab.id),
			urlAlternatives: [`${BASE_URL}/${kind === "video" ? "videos" : "sounds"}/${tab.id}/0/1`]
		});
	}
	function categoryChannel(category, kind, tab) {
		return grayjay.channel(`category-${kind}-${tab}-${category.id}`, {
			name: category.title,
			thumbnail: imageUrl(category.image_url) || iconUrl(),
			banner: imageUrl(category.image_url) || iconUrl(),
			description: tabByKind(kind, tab).name,
			url: categoryUrlInternal(kind, tab, category.id),
			urlAlternatives: [`${BASE_URL}/${kind === "video" ? "videos" : "sounds"}/${tab}/${category.id}/1`]
		});
	}
	function rootAuthor() {
		return grayjay.author("saleh-osaimi", "الشيخ صالح العصيمي", BASE_URL, iconUrl());
	}
	function storageUrl(value) {
		const raw = String(value ?? "").trim();
		if (!raw) return null;
		if (raw.startsWith("http")) return encodeURI(raw);
		if (raw.startsWith("/storage/")) return encodeURI(`${API_URL}${raw}`);
		return encodeURI(`${API_URL}/storage/${raw.replace(/^\/+/, "")}`);
	}
	function imageUrl(value) {
		const raw = String(value ?? "").trim();
		if (!raw) return null;
		if (raw.startsWith("http")) return raw;
		if (raw.startsWith("/")) return `${API_URL}${raw}`;
		return `${API_URL}/${raw}`;
	}
	function imageThumbnails(value) {
		return thumbnails(imageUrl(value) || iconUrl());
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function categoryTitle(item) {
		return item.pgsoundcategories_title || item.pgclipcategories_title || "";
	}
	function parseDate(value) {
		const date = Date.parse(String(value ?? ""));
		return Number.isFinite(date) ? Math.floor(date / 1e3) : 0;
	}
	function normalizePublicUrl(url) {
		return String(url ?? "").trim().replace("http://", "https://");
	}
	function tabByKind(kind, id) {
		const tab = (kind === "video" ? VIDEO_TABS : AUDIO_TABS).find((item) => item.id === id);
		if (!tab) throw new ScriptException(`Unknown ${PLATFORM} tab: ${kind}/${id}`);
		return {
			...tab,
			kind
		};
	}
	function categoryById(kind, tab, id) {
		const category = categories(kind, tab).find((item) => item.id === id);
		if (!category) throw new ScriptException(`Unknown ${PLATFORM} category: ${kind}/${tab}/${id}`);
		return category;
	}
	function selectedKind(filters) {
		const value = selected_filter_values(filters, "kind")[0];
		return value === "audio" || value === "video" ? value : "all";
	}
	function selectedTabs(filters, kind) {
		const selected = selected_filter_values(filters, "tab");
		return [...AUDIO_TABS.map((tab) => ({
			...tab,
			kind: "audio"
		})), ...VIDEO_TABS.map((tab) => ({
			...tab,
			kind: "video"
		}))].filter((tab) => (kind === "all" || tab.kind === kind) && (!selected.length || selected.includes(`${tab.kind}:${tab.id}`)));
	}
	function kindFilter() {
		return {
			id: "kind",
			name: "المحتوى",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "الكل",
					value: "all"
				},
				{
					id: "audio",
					name: "صوتيات",
					value: "audio"
				},
				{
					id: "video",
					name: "مرئيات",
					value: "video"
				}
			]
		};
	}
	function tabFilter() {
		return {
			id: "tab",
			name: "القسم",
			isMultiSelect: true,
			filters: [...AUDIO_TABS.map((tab) => ({
				id: `audio:${tab.id}`,
				name: tab.name,
				value: `audio:${tab.id}`
			})), ...VIDEO_TABS.map((tab) => ({
				id: `video:${tab.id}`,
				name: tab.name,
				value: `video:${tab.id}`
			}))]
		};
	}
	function tabUrlInternal(kind, tab) {
		return `jeman://tab/${kind}/${tab}`;
	}
	function categoryUrlInternal(kind, tab, categoryId) {
		return `jeman://category/${kind}/${tab}/${categoryId}`;
	}
	function playlistUrlInternal(kind, tab, categoryId) {
		return `jeman://playlist/${kind}/${tab}/${categoryId}`;
	}
	function audioUrlInternal(tab, id) {
		return `jeman://audio/${tab}/${id}`;
	}
	function videoUrlInternal(tab, id) {
		return `jeman://video/${tab}/${id}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "jeman://root") return { type: "root" };
		let match = value.match(/^jeman:\/\/(tab|category|playlist)\/(audio|video)\/([^/]+)(?:\/([^/]+))?$/);
		if (match) return {
			type: match[1],
			kind: match[2],
			tab: match[3],
			categoryId: match[4]
		};
		match = value.match(/^jeman:\/\/(audio|video)\/([^/]+)\/([^/]+)$/);
		if (match) return {
			type: match[1],
			tab: match[2],
			id: match[3]
		};
		return null;
	}
	var JemanPager = class JemanPager extends VideoPager {
		constructor(kind, tab, categoryId = null, page = 1) {
			const response = fetchList(kind === "video" ? "pgclips" : "pgsounds", tab, page, categoryId);
			super((response.data ?? []).map(apiItemToContent).filter(Boolean), Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page), {
				kind,
				tab,
				categoryId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new JemanPager(this.context.kind, this.context.tab, this.context.categoryId, this.context.page + 1));
		}
	};
	var JemanSearchPager = class JemanSearchPager extends VideoPager {
		constructor(query, kind = "all", page = 1) {
			const response = fetchSearch(query, page);
			super((response.data ?? []).map((item) => searchItemToContent(item, kind)).filter(Boolean), Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page), {
				query,
				kind,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new JemanSearchPager(this.context.query, this.context.kind, this.context.page + 1));
		}
	};
	var JemanTabSearchPager = class JemanTabSearchPager extends VideoPager {
		constructor(query, kind = "all", selected = [], page = 1) {
			const needle = normalize_search_text(query);
			const responses = selectedTabs({ tab: selected }, kind).map((tab) => ({
				tab,
				response: fetchList(tab.kind === "video" ? "pgclips" : "pgsounds", tab.id, page)
			}));
			super(responses.flatMap(({ response }) => response.data ?? []).filter((item) => normalize_search_text(`${item.title} ${categoryTitle(item)}`).includes(needle)).map(apiItemToContent).filter(Boolean), responses.some(({ response }) => Number(response.meta?.current_page ?? page) < Number(response.meta?.last_page ?? page)), {
				query,
				kind,
				selected,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new JemanTabSearchPager(this.context.query, this.context.kind, this.context.selected, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`);

})();
