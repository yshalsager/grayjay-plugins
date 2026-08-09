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

	function dedupe_by(items, key) {
		const seen = {};
		const result = [];
		for (const item of items) {
			const value = key(item);
			if (!value || seen[value]) continue;
			seen[value] = true;
			result.push(item);
		}
		return result;
	}
	function dedupe_by_url(items) {
		return dedupe_by(items, (item) => item.url ?? item.contentUrl);
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

	function extract_first(value, regex) {
		const match = String(value ?? "").match(regex);
		return match ? match[1] : null;
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

	var PLATFORM = "Shkhudheir";
	var BASE_URL = "https://shkhudheir.com";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { pageCache: 80 };
	var SERIES = [
		{
			id: "1054903076",
			name: "التعليق على تفسير القرطبي",
			category: "القرآن وعلومه"
		},
		{
			id: "1775116188",
			name: "التعليق على الموافقات",
			category: "أصول الفقه"
		},
		{
			id: "1244069620",
			name: "الموقظة في علم مصطلح الحديث",
			category: "الحديث وعلومه"
		}
	];
	var FATWA_SECTIONS = [
		{
			id: "297",
			name: "القرآن وعلومه"
		},
		{
			id: "299",
			name: "العقيدة"
		},
		{
			id: "300",
			name: "فقه العبادات"
		},
		{
			id: "302",
			name: "فقه الأسرة"
		},
		{
			id: "315",
			name: "مسائل متفرقة"
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
		return new ArrayVideoPager([...parseSeriesItems(fetchPage(seriesUrl(SERIES[0].id)), SERIES[0]), detailToFeed(fetchDetailPage(`${BASE_URL}/fatawa/1414595258`))].filter(Boolean), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"التفسير",
			"الحديث",
			"العقيدة",
			"الفقه",
			"الفتاوى",
			"القرآن"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		const items = SERIES.flatMap((series) => parseSeriesItems(fetchPage(seriesUrl(series.id)), series));
		items.push(detailToFeed(fetchDetailPage(`${BASE_URL}/fatawa/1414595258`)));
		return new ArrayVideoPager(dedupe_by_url(items.filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle)))), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return [
			"root",
			"series",
			"fatawa",
			"fatwa-section"
		].includes(parsed?.type) || normalizePublicUrl(url) === BASE_URL;
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "series") return seriesChannel(seriesById(parsed.id));
		if (parsed?.type === "fatawa") return simpleChannel("fatawa", "الفتاوى", "shkhudheir://fatawa");
		if (parsed?.type === "fatwa-section") return simpleChannel(`fatwa-section-${parsed.id}`, fatwaSectionById(parsed.id).name, `shkhudheir://fatawa/section/${parsed.id}`);
		return grayjay.channel("root", {
			name: "الشيخ عبد الكريم الخضير",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "الدروس والفتاوى الصوتية للشيخ عبد الكريم الخضير.",
			url: "shkhudheir://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "series") return new SeriesPager(parsed.id);
		if (parsed?.type === "fatwa-section") return new FatwaSectionPager(parsed.id);
		return source.getHome();
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		return source.search(query, type, order, filters);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([
			source.getChannel("shkhudheir://root"),
			simpleChannel("lessons", "الدروس العلمية", "shkhudheir://lessons"),
			source.getChannel("shkhudheir://fatawa"),
			...SERIES.map(seriesChannel),
			...FATWA_SECTIONS.map((section) => source.getChannel(`shkhudheir://fatawa/section/${section.id}`))
		].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist";
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(SERIES.filter((series) => !needle || normalize_search_text(series.name).includes(needle)).map(seriesToPlaylist), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type !== "playlist") throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const series = seriesById(parsed.id);
		return grayjay.playlist_details(`series-${series.id}`, {
			name: series.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url,
			videoCount: 0,
			contents: new SeriesPager(series.id)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "series") return new ArrayPlaylistPager([seriesToPlaylist(seriesById(parsed.id))], DEFAULT_LIMIT);
		return new ArrayPlaylistPager(SERIES.map(seriesToPlaylist), DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "lesson" || parsed?.type === "fatwa" || /\/(?:scientific-lesson|fatawa?|node)\/\d+/i.test(normalized) || /^https:\/\/shkhudheir\.com\/files\/.*\.mp3/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "lesson") return detailToDetails(fetchDetailPage(`${BASE_URL}/scientific-lesson/${parsed.id}`));
		if (parsed?.type === "fatwa") return detailToDetails(fetchDetailPage(`${BASE_URL}/fatawa/${parsed.id}`));
		const normalized = normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized);
		if (/\/(?:scientific-lesson|fatawa?|node)\/\d+/i.test(normalized)) return detailToDetails(fetchDetailPage(normalized));
		throw new ScriptException(`Unsupported ${PLATFORM} content URL`);
	};
	function parseState(value) {
		try {
			return JSON.parse(value || "{}");
		} catch (_e) {
			return {};
		}
	}
	function fetchPage(url) {
		const normalized = normalizePublicUrl(url);
		const cached = cache_get(_state, CACHE_LIMITS, "pageCache", normalized);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "pageCache", normalized, get_text(normalized, { Accept: "text/html,application/xhtml+xml" }));
	}
	function fetchDetailPage(url) {
		return {
			html: fetchPage(url),
			url: normalizePublicUrl(url)
		};
	}
	function parseSeriesItems(html, series) {
		const items = [];
		const regex = /<td\b[^>]*class=["'][^"']*views-field-title[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/scientific-lesson\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) items.push({
			title: clean_text(match[3]),
			url: lessonUrl(match[2]),
			shareUrl: absoluteUrl(match[1]),
			series
		});
		return dedupe_by_url(items.map(itemToFeed));
	}
	function parseFatwaItems(html) {
		const items = [];
		const regex = /<a\b[^>]*href=["']([^"']*\/fatwa(?:wa)?\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) items.push({
			title: clean_text(match[3]),
			url: fatwaUrl(match[2]),
			shareUrl: absoluteUrl(match[1])
		});
		return dedupe_by_url(items.filter((item) => item.title).map(itemToFeed));
	}
	function detailToFeed(detail) {
		const parsed = parseDetail(detail);
		return parsed?.audioUrl ? itemToFeed(parsed) : null;
	}
	function itemToFeed(item) {
		return grayjay.feed_video(`item-${mediaId(item.url)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: item.url,
			description: item.series?.name || "",
			shareUrl: item.shareUrl || item.url
		});
	}
	function detailToDetails(detail) {
		const item = parseDetail(detail);
		if (!item?.audioUrl) throw new ScriptException(`${PLATFORM} audio file not found`);
		return grayjay.video(`audio-${mediaId(detail.url)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: item.uploadDate || 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: item.url,
			description: item.description,
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: item.audioUrl,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: detail.url,
			getContentRecommendations: () => item.series?.id ? new SeriesPager(item.series.id) : source.getHome()
		});
	}
	function parseDetail({ html, url }) {
		const title = clean_text(extract_first(html, /<h1\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
		const audioUrl = absoluteUrl(extract_first(html, /<source\b[^>]*src=["']([^"']+\.mp3[^"']*)["'][^>]*type=["']audio\/mpeg["']/i) || extract_first(html, /href=["']([^"']+\.mp3[^"']*)["']/i));
		const seriesId = extract_first(html, /href=["']\/series\/(\d+)["']/i);
		const date = extract_first(html, /<time\b[^>]*datetime=["']([^"']+)["']/i);
		return {
			title,
			audioUrl,
			url: url.includes("/scientific-lesson/") ? lessonUrl(extract_first(url, /\/scientific-lesson\/(\d+)/)) : fatwaUrl(extract_first(url, /\/(?:fatawa?|node)\/(\d+)/)),
			description: clean_text(extract_first(html, /<div\b[^>]*class=["'][^"']*field--name-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || html).slice(0, 2e3),
			uploadDate: date ? Math.floor(new Date(date).getTime() / 1e3) : 0,
			series: seriesId ? seriesById(seriesId) : null
		};
	}
	function directMp3ToDetails(url) {
		return grayjay.video(`mp3-${mediaId(url)}`, {
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
	function simpleChannel(id, name, url) {
		return grayjay.channel(id, {
			name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${name} - الشيخ عبد الكريم الخضير`,
			url,
			urlAlternatives: [BASE_URL]
		});
	}
	function seriesChannel(series) {
		return simpleChannel(`series-${series.id}`, series.name, seriesUrlInternal(series.id));
	}
	function seriesToPlaylist(series) {
		return grayjay.playlist(`series-${series.id}`, {
			name: series.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(series.id),
			videoCount: 0
		});
	}
	function seriesById(id) {
		return SERIES.find((series) => series.id === id) ?? {
			id,
			name: `سلسلة ${id}`,
			category: ""
		};
	}
	function fatwaSectionById(id) {
		return FATWA_SECTIONS.find((section) => section.id === id) ?? {
			id,
			name: `فتاوى ${id}`
		};
	}
	function rootAuthor() {
		return grayjay.author("shkhudheir", "الشيخ عبد الكريم الخضير", BASE_URL, iconUrl());
	}
	function absoluteUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("/")) return encodeUrl(`${BASE_URL}${raw}`);
		return encodeUrl(raw.replace(/^http:\/\//i, "https://"));
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw.replace(/^http:\/\//i, "https://");
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, "") || PLATFORM).replace(/[-_]+/g, " ");
	}
	function mediaId(value) {
		return normalize_search_text(value).slice(-64) || "audio";
	}
	function encodeUrl(url) {
		try {
			return encodeURI(decodeURI(url));
		} catch (_e) {
			return encodeURI(url);
		}
	}
	function seriesUrl(id, page = 0) {
		return `${BASE_URL}/series/${id}${page ? `?page=${page}` : ""}`;
	}
	function seriesUrlInternal(id) {
		return `shkhudheir://series/${id}`;
	}
	function playlistUrl(id) {
		return `shkhudheir://playlist/${id}`;
	}
	function lessonUrl(id) {
		return `shkhudheir://lesson/${id}`;
	}
	function fatwaUrl(id) {
		return `shkhudheir://fatwa/${id}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "shkhudheir://root") return { type: "root" };
		if (value === "shkhudheir://lessons") return { type: "lessons" };
		if (value === "shkhudheir://fatawa") return { type: "fatawa" };
		let match = value.match(/^shkhudheir:\/\/series\/(\d+)$/);
		if (match) return {
			type: "series",
			id: match[1]
		};
		match = value.match(/^shkhudheir:\/\/playlist\/(\d+)$/);
		if (match) return {
			type: "playlist",
			id: match[1]
		};
		match = value.match(/^shkhudheir:\/\/lesson\/(\d+)$/);
		if (match) return {
			type: "lesson",
			id: match[1]
		};
		match = value.match(/^shkhudheir:\/\/fatwa\/(\d+)$/);
		if (match) return {
			type: "fatwa",
			id: match[1]
		};
		match = value.match(/^shkhudheir:\/\/fatawa\/section\/(\d+)$/);
		if (match) return {
			type: "fatwa-section",
			id: match[1]
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var SeriesPager = class SeriesPager extends VideoPager {
		constructor(seriesId, page = 0) {
			const series = seriesById(seriesId);
			const html = fetchPage(seriesUrl(seriesId, page));
			const items = parseSeriesItems(html, series);
			super(items, new RegExp(`page=${page + 1}`, "i").test(html), {
				seriesId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new SeriesPager(this.context.seriesId, this.context.page + 1));
		}
	};
	var FatwaSectionPager = class FatwaSectionPager extends VideoPager {
		constructor(sectionId, page = 0) {
			const html = fetchPage(`${BASE_URL}/fatawa/section?id=${sectionId}${page ? `&page=${page}` : ""}`);
			const items = parseFatwaItems(html);
			super(items, new RegExp(`page=${page + 1}`, "i").test(html), {
				sectionId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new FatwaSectionPager(this.context.sectionId, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED Shkhudheir " + staticThumbnails().sources.length);

})();
