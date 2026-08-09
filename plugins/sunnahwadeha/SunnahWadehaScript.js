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
	function content_thumbnails(config, default_icon, url) {
		return thumbnails(url || plugin_icon_url(config, default_icon));
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
	function query_string(params) {
		return params.filter((item) => item[1] !== null && item[1] !== void 0).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
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

	var PLATFORM = "Sunnah Wadeha";
	var BASE_URL = "https://sunnahwadeha.com";
	var API_URL = `${BASE_URL}/api`;
	var DEFAULT_ICON = `${BASE_URL}/icons/favicon-32.png`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { jsonCache: 160 };
	var _config = {};
	var _state = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	source.enable = function(conf, _settings, savedState) {
		_config = conf ?? {};
		_state = parseState(savedState);
		init_lru_caches(_state, CACHE_LIMITS);
	};
	source.saveState = () => "{}";
	source.getHome = function() {
		return new SunnahWadehaLessonPager(1, "", null, true);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [contentFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"الحديث",
			"العقيدة",
			"الفقه",
			"السيرة",
			"التفسير",
			"التوحيد"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		const content = selectedContent(filters);
		if (content === "live") {
			const live = safeLiveItem();
			return new ArrayVideoPager(live && itemMatches(live, query) ? [live] : [], DEFAULT_LIMIT);
		}
		return new SunnahWadehaLessonPager(1, query, null, content === "all");
	};
	source.isChannelUrl = function(url) {
		return /^sunnahwadeha:\/\/root$/.test(String(url ?? "")) || /^https?:\/\/(?:www\.)?sunnahwadeha\.com\/?$/.test(String(url ?? ""));
	};
	source.getChannel = function(_url) {
		return rootChannel();
	};
	source.getChannelContents = function(_url, type, order, filters) {
		return source.search("", type, order, filters);
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(_url, query, type, order, filters) {
		return source.search(query, type, order, filters);
	};
	source.searchChannels = function(query) {
		const channel = rootChannel();
		return new ArrayChannelPager(itemMatches(channel, query) ? [channel] : [], DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return Boolean(seriesId(url));
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		return new SunnahWadehaSeriesPager(1, query);
	};
	source.getPlaylist = function(url) {
		const id = seriesId(url);
		if (!id) throw new ScriptException(`${PLATFORM} series id missing`);
		return seriesToPlaylistDetails(fetchJson(`${API_URL}/series/${id}?depth=1`));
	};
	source.getChannelPlaylists = function(_url) {
		return new SunnahWadehaSeriesPager(1);
	};
	source.isContentDetailsUrl = function(url) {
		return Boolean(lessonId(url)) || isLiveUrl(url);
	};
	source.getContentDetails = function(url) {
		if (isLiveUrl(url)) {
			const live = liveItem(fetchLive());
			if (!live) throw new ScriptException(`${PLATFORM} has no active live broadcast`);
			return live;
		}
		const id = lessonId(url);
		if (!id) throw new ScriptException(`${PLATFORM} lesson id missing`);
		return lessonToDetails(fetchJson(`${API_URL}/lessons/${id}?depth=2`));
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
	function fetchLive() {
		return get_json(`${API_URL}/live/now`, { Accept: "application/json" });
	}
	function safeLiveItem() {
		try {
			return liveItem(fetchLive());
		} catch (_e) {
			return null;
		}
	}
	function fetchLessons(page, query = "", series = null) {
		return fetchJson(`${API_URL}/lessons?${query_string([
			["depth", 1],
			["limit", DEFAULT_LIMIT],
			["page", page],
			["sort", "-createdAt"],
			["where[title][contains]", query || null],
			["where[series][equals]", series]
		])}`);
	}
	function fetchSeries(page, query = "") {
		return fetchJson(`${API_URL}/series?${query_string([
			["depth", 1],
			["limit", DEFAULT_LIMIT],
			["page", page],
			["sort", "-updatedAt"],
			["where[title][contains]", query || null],
			["where[scope][equals]", "public"]
		])}`);
	}
	function lessonToFeed(item) {
		const media = item?.audioFile;
		if (!item?.id || !media?.url) return null;
		return grayjay.feed_video(`lesson-${item.id}`, {
			name: clean_text(item.title),
			thumbnails: lessonThumbnails(item),
			author: rootAuthor(),
			uploadDate: parseDate(item.createdAt),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: lessonUrl(item.id),
			description: lessonDescription(item),
			video: lessonSource(media),
			shareUrl: publicSeriesUrl(relationId(item.series))
		});
	}
	function lessonToDetails(item) {
		const details = lessonToFeed(item);
		if (!details) throw new ScriptException(`${PLATFORM} lesson has no playable audio`);
		const result = grayjay.video(`lesson-${item.id}`, {
			name: details.name,
			thumbnails: lessonThumbnails(item),
			author: rootAuthor(),
			uploadDate: parseDate(item.createdAt),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: lessonUrl(item.id),
			description: lessonDescription(item),
			video: lessonSource(item.audioFile),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: publicSeriesUrl(relationId(item.series))
		});
		const series = relationId(item.series);
		result.getContentRecommendations = function() {
			return series ? new SunnahWadehaLessonPager(1, "", series, false, item.id) : new ArrayVideoPager([], DEFAULT_LIMIT);
		};
		return result;
	}
	function lessonSource(media) {
		return audio_source_descriptor({
			name: "Ogg Opus Audio",
			container: media.mimeType || "audio/ogg",
			codec: "opus",
			duration: 0,
			url: media.url,
			language: "ar"
		});
	}
	function liveItem(item) {
		if (!item?.live || !item.cfIframeUrl) return null;
		const nested = grayjay.nested(`live-${item.id}`, {
			name: clean_text(item.title || "البث المباشر"),
			author: rootAuthor(),
			datetime: parseDate(item.startedAt),
			url: "sunnahwadeha://live",
			contentUrl: item.cfIframeUrl,
			contentName: clean_text(item.title || "البث المباشر"),
			contentDescription: clean_text(item.description || "البث المباشر لموقع السنة واضحة"),
			contentProvider: "Cloudflare Stream",
			contentThumbnails: static_thumbnails(_config, DEFAULT_ICON)
		});
		nested.getContentRecommendations = () => new SunnahWadehaLessonPager(1);
		return nested;
	}
	function seriesToPlaylist(item) {
		return grayjay.playlist(`series-${item.id}`, {
			name: clean_text(item.title),
			thumbnails: seriesThumbnails(item),
			thumbnail: imageUrl(item.coverImage) || iconUrl(),
			author: rootAuthor(),
			datetime: parseDate(item.createdAt),
			url: seriesUrl(item.id),
			videoCount: 0
		});
	}
	function seriesToPlaylistDetails(item) {
		if (!item?.id) throw new ScriptException(`${PLATFORM} series not found`);
		const contents = new SunnahWadehaLessonPager(1, "", item.id);
		return grayjay.playlist_details(`series-${item.id}`, {
			name: clean_text(item.title),
			thumbnails: seriesThumbnails(item),
			thumbnail: imageUrl(item.coverImage) || iconUrl(),
			author: rootAuthor(),
			datetime: parseDate(item.createdAt),
			url: seriesUrl(item.id),
			videoCount: contents.context.totalDocs,
			contents
		});
	}
	function rootChannel() {
		return grayjay.channel("root", {
			name: "السنة واضحة",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "دروس صوتية وشروح كتب وبث مباشر.",
			url: "sunnahwadeha://root",
			urlAlternatives: [BASE_URL]
		});
	}
	function rootAuthor() {
		return grayjay.author("root", "السنة واضحة", "sunnahwadeha://root", iconUrl());
	}
	function lessonDescription(item) {
		const series = typeof item.series === "object" ? clean_text(item.series.title) : "";
		const category = categoryName(item.category) || categoryName(item.series?.category);
		return [
			clean_text(typeof item.description === "string" ? item.description : ""),
			series,
			category
		].filter(Boolean).join("\n");
	}
	function lessonThumbnails(item) {
		const image = imageUrl(item.coverImage) || imageUrl(item.series?.coverImage);
		return image ? content_thumbnails(_config, DEFAULT_ICON, image) : static_thumbnails(_config, DEFAULT_ICON);
	}
	function seriesThumbnails(item) {
		const image = imageUrl(item.coverImage) || imageUrl(item.explainedBook?.coverImage);
		return image ? content_thumbnails(_config, DEFAULT_ICON, image) : static_thumbnails(_config, DEFAULT_ICON);
	}
	function imageUrl(image) {
		return typeof image === "object" ? image.sizes?.thumbnail?.url || image.sizes?.card?.url || image.url : "";
	}
	function categoryName(category) {
		return typeof category === "object" ? clean_text(category.name) : "";
	}
	function relationId(value) {
		return typeof value === "object" ? value.id : value;
	}
	function lessonId(url) {
		const value = String(url ?? "");
		return value.match(/^sunnahwadeha:\/\/lesson\/(\d+)$/)?.[1] || value.match(/^https?:\/\/(?:www\.)?sunnahwadeha\.com\/api\/lessons\/(\d+)(?:[?#].*)?$/)?.[1];
	}
	function seriesId(url) {
		const value = String(url ?? "");
		return value.match(/^sunnahwadeha:\/\/series\/(\d+)$/)?.[1] || value.match(/^https?:\/\/(?:www\.)?sunnahwadeha\.com\/series\/(\d+)\/?(?:[?#].*)?$/)?.[1];
	}
	function isLiveUrl(url) {
		return /^sunnahwadeha:\/\/live$/.test(String(url ?? "")) || /^https?:\/\/(?:www\.)?sunnahwadeha\.com\/?#live$/.test(String(url ?? ""));
	}
	function lessonUrl(id) {
		return `sunnahwadeha://lesson/${id}`;
	}
	function seriesUrl(id) {
		return `sunnahwadeha://series/${id}`;
	}
	function publicSeriesUrl(id) {
		return id ? `${BASE_URL}/series/${id}` : BASE_URL;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function parseDate(value) {
		return Math.floor(Date.parse(value || "") / 1e3) || 0;
	}
	function itemMatches(item, query) {
		const needle = normalize_search_text(query);
		return !needle || normalize_search_text(`${item.name || item.contentName} ${item.description || item.contentDescription}`).includes(needle);
	}
	function contentFilter() {
		return {
			id: "content",
			name: "المحتوى",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "الدروس والبث المباشر",
					value: "all"
				},
				{
					id: "audio",
					name: "الدروس الصوتية",
					value: "audio"
				},
				{
					id: "live",
					name: "البث المباشر",
					value: "live"
				}
			]
		};
	}
	function selectedContent(filters) {
		const value = selected_filter_values(filters, "content")[0];
		return value === "audio" || value === "live" ? value : "all";
	}
	var SunnahWadehaLessonPager = class SunnahWadehaLessonPager extends VideoPager {
		constructor(page = 1, query = "", series = null, includeLive = false, excludeId = null) {
			const data = fetchLessons(page, query, series);
			const items = (data.docs ?? []).filter((item) => String(item.id) !== String(excludeId ?? "")).map(lessonToFeed).filter(Boolean);
			const live = page === 1 && includeLive ? safeLiveItem() : null;
			super(live && itemMatches(live, query) ? [live, ...items] : items, Boolean(data.hasNextPage), {
				page,
				query,
				series,
				includeLive,
				excludeId,
				totalDocs: Number(data.totalDocs || 0)
			});
		}
		nextPage() {
			return apply_pager_state(this, new SunnahWadehaLessonPager(this.context.page + 1, this.context.query, this.context.series, this.context.includeLive, this.context.excludeId));
		}
	};
	var SunnahWadehaSeriesPager = class SunnahWadehaSeriesPager extends PlaylistPager {
		constructor(page = 1, query = "") {
			const data = fetchSeries(page, query);
			super((data.docs ?? []).map(seriesToPlaylist), Boolean(data.hasNextPage), {
				page,
				query
			});
		}
		nextPage() {
			return apply_pager_state(this, new SunnahWadehaSeriesPager(this.context.page + 1, this.context.query));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	log(`LOADED ${PLATFORM} ${static_thumbnails(_config, DEFAULT_ICON).sources.length}`);

})();
