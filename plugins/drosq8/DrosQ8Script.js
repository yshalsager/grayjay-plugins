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
	function post_text(url, body = "", headers = {}, useAuth = false, debugContext = null) {
		const response = request("POST", url, body, headers, useAuth, debugContext);
		if (!response.isOk) throw request_error(response, url);
		return response.body;
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

	var PLATFORM = "DrosQ8";
	var BASE_URL = "https://www.drosq8.com";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var ROOT_CATEGORY = "218";
	var HOME_CATEGORY = "221";
	var CACHE_LIMITS = { pageCache: 80 };
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
		return new DrosCategoryPager(HOME_CATEGORY);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"العلم",
			"العشر",
			"القرآن",
			"التوحيد",
			"الصيام",
			"الحج",
			"الحديث"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		if (!needle) return source.getHome();
		const category = {
			id: ROOT_CATEGORY,
			title: PLATFORM,
			url: `${BASE_URL}/cat/${ROOT_CATEGORY}`
		};
		return new ArrayVideoPager(parseItems(fetchSearchResults(query), category).filter((item) => !needle || normalize_search_text(`${item.title} ${item.category.title}`).includes(needle)).map(itemToFeed), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "root" || parsed?.type === "category" || normalized === BASE_URL || isCategoryUrl(normalized);
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		const category = parsed?.type === "category" ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url));
		if (category) return categoryChannel(category);
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "محاضرات ودروس صوتية من موقع دروس الكويت.",
			url: "drosq8://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		return new DrosCategoryPager((parsed?.type === "category" ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url)))?.id ?? HOME_CATEGORY);
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		const category = parsed?.type === "category" ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url));
		return source.search(query, null, null, category ? { category: category.id } : null);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([source.getChannel("drosq8://root"), ...rootCategories().map(categoryChannel)].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "playlist" || isCategoryUrl(normalized);
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(rootCategories().flatMap((category) => [category, ...parseCategories(fetchCategoryPage(category.id, 1)).slice(0, 60)]).filter((category) => !needle || normalize_search_text(category.title).includes(needle)).map(categoryToPlaylist), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		const category = parsed?.type === "playlist" ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url));
		if (!category) throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const items = parseItems(fetchCategoryPage(category.id, 1), category);
		return grayjay.playlist_details(`playlist-${category.id}`, {
			name: category.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(category.id),
			videoCount: category.count || items.length,
			contents: new DrosCategoryPager(category.id)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		const category = parsed?.type === "category" ? categoryById(parsed.id) : categoryFromUrl(normalizePublicUrl(url));
		return new ArrayPlaylistPager((category ? parseCategories(fetchCategoryPage(category.id, 1)) : rootCategories()).map(categoryToPlaylist), DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "content" || isPlayUrl(normalized) || /^https:\/\/www\.drosq8\.com\/.*\.mp3(?:$|\?)/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = parsed?.type === "content" ? parsed.url : normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return itemToDetails({
			title: decodeTitle(normalized),
			url: normalized,
			audioUrl: normalized,
			category: categoryById(HOME_CATEGORY)
		});
		if (!isPlayUrl(normalized)) throw new ScriptException(`Unsupported ${PLATFORM} content URL`);
		return itemToDetails(parseDetail(fetchPage(normalized), normalized));
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
	function fetchCategoryPage(id, page = 1) {
		return fetchPage(page > 1 ? `${BASE_URL}/cat/${id}/${page}/` : `${BASE_URL}/cat/${id}`);
	}
	function fetchSearchResults(query) {
		return post_text(`${BASE_URL}/cat/search`, query_string([["search", query], ["action", "ابحث"]]), {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "text/html,application/xhtml+xml"
		});
	}
	function rootCategories() {
		return parseCategories(fetchCategoryPage(ROOT_CATEGORY, 1)).filter((category) => category.count !== 0);
	}
	function parseCategories(html) {
		const categories = [];
		const regex = /<h4\b[^>]*class=["'][^"']*pull-right[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']*\/cat\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\b[^>]*class=["'][^"']*btn-d[^"']*["'][^>]*>[\s\S]*?(\d+)[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) categories.push({
			id: match[2],
			title: clean_text(match[3]),
			url: normalizePublicUrl(match[1]),
			count: Number(match[4] || 0)
		});
		return dedupe_by_url(categories);
	}
	function parseItems(html, category) {
		const items = [];
		const regex = /<li\b[^>]*class=["'][^"']*list-group-item[^"']*["'][^>]*>[\s\S]*?<\/li>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const block = match[0];
			const path = extract_first(block, /<a\b[^>]*href=["']([^"']*\/play\/\d+[^"']*)["'][^>]*>/i);
			const title = clean_text(extract_first(block, /<h4\b[^>]*class=["'][^"']*hedh4[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>[\s\S]*?([\s\S]*?)<\/a>/i));
			if (!path || !title) continue;
			const url = normalizePublicUrl(path);
			items.push({
				title,
				url,
				category,
				viewCount: Number(extract_first(block, /fa-comments[^<]*<\/i>\s*([0-9]+)/i) || 0),
				uploadDate: parseDate(extract_first(block, /<br>\s*(\d{4}-\d{2}-\d{2})/i))
			});
		}
		return dedupe_by_url(items);
	}
	function parseDetail(html, url) {
		const title = cleanTitle(extract_first(html, /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || decodeTitle(url));
		const audioUrl = normalizePublicUrl(extract_first(html, /<source\b[^>]*src=["']([^"']+\.mp3[^"']*)["']/i) || extract_first(html, /<a\b[^>]*href=["']([^"']+\.mp3[^"']*)["']/i));
		if (!audioUrl) throw new ScriptException(`${PLATFORM} audio file not found`);
		return {
			title,
			url,
			audioUrl: encodeURI(audioUrl),
			category: categoryFromBreadcrumb(html) ?? categoryById(HOME_CATEGORY),
			viewCount: Number(extract_first(html, /fa-comments[^<]*<\/i>\s*([0-9]+)/i) || 0),
			uploadDate: parseDate(extract_first(html, /(\d{4}-\d{2}-\d{2})/i)),
			description: clean_text(extract_first(html, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) || "")
		};
	}
	function itemToFeed(item) {
		return grayjay.feed_video(`play-${playId(item.url)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: authorForCategory(item.category),
			uploadDate: item.uploadDate || 0,
			duration: 0,
			viewCount: item.viewCount || 0,
			isLive: false,
			url: contentUrl(item.url),
			description: item.category?.title ?? "",
			shareUrl: item.url
		});
	}
	function itemToDetails(item) {
		return grayjay.video(`audio-${playId(item.url || item.audioUrl)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: authorForCategory(item.category),
			uploadDate: item.uploadDate || 0,
			duration: 0,
			viewCount: item.viewCount || 0,
			isLive: false,
			url: contentUrl(item.url),
			description: item.description || item.category?.title || "",
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
			shareUrl: item.url || item.audioUrl,
			getContentRecommendations: () => new DrosCategoryPager(item.category?.id ?? HOME_CATEGORY)
		});
	}
	function categoryChannel(category) {
		return grayjay.channel(`category-${category.id}`, {
			name: category.title,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${category.title} - دروس الكويت`,
			url: categoryUrl(category.id),
			urlAlternatives: [category.url]
		});
	}
	function categoryToPlaylist(category) {
		return grayjay.playlist(`playlist-${category.id}`, {
			name: category.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(category.id),
			videoCount: category.count || 0
		});
	}
	function rootAuthor() {
		return grayjay.author("drosq8", PLATFORM, BASE_URL, iconUrl());
	}
	function authorForCategory(category) {
		return grayjay.author(`category-${category?.id ?? "root"}`, category?.title || PLATFORM, category?.url || BASE_URL, iconUrl());
	}
	function categoryById(id) {
		const html = fetchCategoryPage(id, 1);
		return {
			id: String(id),
			title: parseCategoryTitle(html) || `قسم ${id}`,
			url: `${BASE_URL}/cat/${id}`,
			count: parseItems(html, {
				id: String(id),
				title: "",
				url: `${BASE_URL}/cat/${id}`
			}).length
		};
	}
	function categoryFromUrl(url) {
		const id = String(url ?? "").match(/\/cat\/(\d+)/)?.[1];
		return id ? categoryById(id) : null;
	}
	function categoryFromBreadcrumb(html) {
		const links = [];
		const regex = /<a\b[^>]*href=["']([^"']*\/cat\/(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) links.push({
			id: match[2],
			title: clean_text(match[3]),
			url: normalizePublicUrl(match[1])
		});
		return links.pop() ?? null;
	}
	function parseCategoryTitle(html) {
		return cleanTitle(extract_first(html, /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || extract_first(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || extract_first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i));
	}
	function cleanTitle(value) {
		return clean_text(value).replace(/\s*-\s*دروس الكويت\s*$/i, "").replace(/^دروس الكويت\s*-\s*/i, "");
	}
	function parseDate(value) {
		const match = String(value ?? "").match(/(\d{4})-(\d{2})-(\d{2})/);
		if (!match) return 0;
		return Math.floor((/* @__PURE__ */ new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)).getTime() / 1e3);
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, "") || PLATFORM).replace(/[-_]+/g, " ");
	}
	function playId(url) {
		return String(url ?? "").match(/\/play\/(\d+)/)?.[1] || normalize_search_text(url).slice(-48) || "audio";
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("//")) return `https:${raw}`.replace("https://drosq8.com", BASE_URL);
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw.replace(/^http:\/\//i, "https://").replace(/^https:\/\/drosq8\.com/i, BASE_URL);
	}
	function isCategoryUrl(url) {
		return /^https:\/\/www\.drosq8\.com\/cat\/\d+(?:\/\d+\/?)?$/i.test(url);
	}
	function isPlayUrl(url) {
		return /^https:\/\/www\.drosq8\.com\/play\/\d+\/?$/i.test(url);
	}
	function categoryUrl(id) {
		return `drosq8://category/${id}`;
	}
	function playlistUrl(id) {
		return `drosq8://playlist/${id}`;
	}
	function contentUrl(url) {
		return `drosq8://content/${encodeURIComponent(url)}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "drosq8://root") return { type: "root" };
		let match = value.match(/^drosq8:\/\/category\/([^/]+)$/);
		if (match) return {
			type: "category",
			id: match[1]
		};
		match = value.match(/^drosq8:\/\/playlist\/([^/]+)$/);
		if (match) return {
			type: "playlist",
			id: match[1]
		};
		match = value.match(/^drosq8:\/\/content\/(.+)$/);
		if (match) return {
			type: "content",
			url: decodeURIComponent(match[1])
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var DrosCategoryPager = class DrosCategoryPager extends VideoPager {
		constructor(categoryId, page = 1) {
			const category = categoryById(categoryId);
			const html = fetchCategoryPage(categoryId, page);
			const items = parseItems(html, category).map(itemToFeed);
			super(items, hasNextPage(html, categoryId, page), {
				categoryId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new DrosCategoryPager(this.context.categoryId, this.context.page + 1));
		}
	};
	function hasNextPage(html, categoryId, page) {
		return new RegExp(`/cat/${categoryId}/${page + 1}/`, "i").test(html);
	}
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED DrosQ8 " + staticThumbnails().sources.length);

})();
