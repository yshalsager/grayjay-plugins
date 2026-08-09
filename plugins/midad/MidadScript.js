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
	function video_source_descriptor({ name, url, width = 0, height = 0, container = "video/mp4", codec = "h264", duration = 0, bitrate = 0 }) {
		return new VideoSourceDescriptor([new VideoUrlSource({
			name,
			width,
			height,
			container,
			codec,
			bitrate,
			duration,
			url
		})]);
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

	function parse_inertia_page(html) {
		const raw = String(html ?? "").match(/<script\b[^>]*data-page=["']app["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
		if (!raw) return null;
		return JSON.parse(decode_html(raw));
	}
	function pick_playable_resource(item) {
		return (item?.resources ?? []).find((resource) => ["audio", "video"].indexOf(String(resource.type ?? "").toLowerCase()) >= 0 && resource.path);
	}
	function pick_image(item) {
		const image = (item?.resources ?? []).find((resource) => String(resource.type ?? "").toLowerCase() === "image" && resource.path);
		if (image?.path) return image.path;
		if (typeof item?.image === "string") return item.image;
		if (item?.image?.path) return item.image.path;
		return "";
	}
	function clean_midad_title(value) {
		return clean_text(value);
	}

	var PLATFORM = "Midad";
	var DISPLAY_NAME = "مداد";
	var BASE_URL = "https://midad.com";
	var DEFAULT_ICON = "https://midad.com/favicon.ico";
	var DEFAULT_LIMIT = 20;
	var HOME_LIMIT = 8;
	var CACHE_MAX_AGE_MS = 300 * 1e3;
	var CACHE_LIMITS = {
		pageCache: 80,
		detailCache: 120,
		collectionCache: 60,
		channelCache: 60
	};
	Type.Order.Popularity = "Popularity";
	var SECTIONS = [
		{
			id: "lessons",
			name: "الدروس",
			route: "lessons",
			dataKey: "lessons",
			kind: "lesson"
		},
		{
			id: "recitations",
			name: "التلاوات",
			route: "recitations",
			dataKey: "recitations",
			kind: "recitation"
		},
		{
			id: "audiobooks",
			name: "الكتب الصوتية",
			route: "audiobooks",
			dataKey: "audiobooks",
			kind: "audiobook"
		},
		{
			id: "videos",
			name: "المرئيات",
			route: "videos",
			dataKey: "videos",
			kind: "video"
		},
		{
			id: "youtube",
			name: "يوتيوب مداد",
			route: "youtube-midad",
			dataKey: "videos",
			kind: "youtube"
		}
	];
	var KIND_LABELS = {
		lesson: "درس",
		recitation: "تلاوة",
		audiobook: "كتاب صوتي",
		video: "فيديو",
		youtube: "يوتيوب"
	};
	var DEFAULT_HEADERS = {
		"User-Agent": `grayjay.app/${bridge.buildVersion}`,
		Accept: "text/html,application/xhtml+xml"
	};
	var REGEX = {
		ROOT: /^https?:\/\/(?:www\.)?midad\.com\/?(?:[?#].*)?$/,
		INTERNAL_ROOT: /^midad:\/\/root$/,
		INTERNAL_SECTION: /^midad:\/\/section\/([a-z]+)$/,
		INTERNAL_CHANNEL: /^midad:\/\/scholar\/(\d+)(?:\/([^?#]+))?$/,
		WEB_CHANNEL: /^https?:\/\/(?:www\.)?midad\.com\/scholar\/(\d+)(?:\/([^?#]+))?\/?(?:[?#].*)?$/,
		INTERNAL_CONTENT: /^midad:\/\/content\/([a-z]+)\/(\d+)$/,
		WEB_CONTENT: /^https?:\/\/(?:www\.)?midad\.com\/(lesson|recitation|audiobook|video)\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/,
		INTERNAL_YOUTUBE: /^midad:\/\/content\/youtube\/(\d+)$/,
		WEB_YOUTUBE: /^https?:\/\/(?:www\.)?midad\.com\/youtube-midad-v\/(\d+)(?:[?#].*)?$/,
		INTERNAL_PLAYLIST: /^midad:\/\/playlist\/collection\/(\d+)$/,
		WEB_PLAYLIST: /^https?:\/\/(?:www\.)?midad\.com\/collection\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/
	};
	var _config = {};
	var state = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	source.enable = function(conf, _settings, _savedState) {
		_config = conf ?? {};
		state = {
			pageCache: {},
			detailCache: {},
			collectionCache: {},
			channelCache: {},
			cacheOrder: {}
		};
		init_lru_caches(state, CACHE_LIMITS);
	};
	source.saveState = function() {
		return "{}";
	};
	source.getHome = function() {
		return mixedFeed(Type.Order.Chronological);
	};
	function mixedFeed(order) {
		const items = [];
		items.push(...loadFeed("lessons", 1, order).items.slice(0, HOME_LIMIT));
		items.push(...loadFeed("audiobooks", 1, order).items.slice(0, HOME_LIMIT));
		items.push(...loadYoutubeFeed(1).items.slice(0, HOME_LIMIT));
		return new ArrayVideoPager(dedupeByUrl(items), DEFAULT_LIMIT);
	}
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, Type.Order.Popularity],
		filters: [sectionFilter()]
	});
	source.searchSuggestions = function(query) {
		const q = normalize(query);
		return [
			"التوحيد",
			"تفسير القرآن",
			"صحيح البخاري",
			"العقيدة",
			"رمضان",
			"الحج",
			"محمد بن صالح العثيمين"
		].filter((item) => !q || normalize(item).indexOf(q) >= 0).slice(0, 10);
	};
	source.search = function(query, _type, order, filters) {
		const q = String(query ?? "").trim();
		const section = selectedSection(filters);
		if (!q) {
			if (section === "all") return mixedFeed(order || Type.Order.Chronological);
			if (section === "youtube") return new MidadYoutubePager(1);
			return new MidadFeedPager(section, 1, order);
		}
		return new MidadSearchPager(q, 1, section, order);
	};
	source.searchChannels = function(query) {
		if (!normalize(query)) return new ArrayChannelPager([rootChannel(), ...SECTIONS.map(sectionChannel)], DEFAULT_LIMIT);
		return new ArrayChannelPager(dedupeByUrl(searchHits(String(query), 1).items.filter((hit) => hit.type === "scholar").map((hit) => hitToChannel(hit)).filter(Boolean)), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		return Boolean(isRootUrl(url) || sectionFromUrl(url) || channelPartsFromUrl(url));
	};
	source.getChannel = function(url) {
		if (isRootUrl(url)) return rootChannel();
		const section = sectionFromUrl(url);
		if (section) return sectionChannel(sectionDefinition(section));
		const parts = channelPartsFromUrl(url);
		if (!parts) throw new ScriptException("Unsupported Midad channel URL");
		return loadScholar(parts.id);
	};
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["المواد"];
	source.getChannelContents = function(url, _type, order, filters) {
		if (isRootUrl(url)) return source.search("", _type, order, filters);
		const section = sectionFromUrl(url);
		if (section === "youtube") return new MidadYoutubePager(1);
		if (section) return new MidadFeedPager(section, 1, order);
		const parts = channelPartsFromUrl(url);
		const channel = parts ? loadScholar(parts.id) : null;
		if (!channel) throw new ScriptException("Unsupported Midad channel URL");
		return new MidadSearchPager(channel.name, 1, selectedSection(filters), order);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		if (!String(query ?? "").trim()) return source.getChannelContents(url, type, order, filters);
		const section = sectionFromUrl(url);
		if (section) return source.search(query, type, order, { section });
		const parts = channelPartsFromUrl(url);
		if (parts) return new MidadSearchPager(`${loadScholar(parts.id).name} ${query}`, 1, selectedSection(filters), order);
		return source.search(query, type, order, filters);
	};
	source.peekChannelContents = function(url, type) {
		return source.getChannelContents(url, type, Type.Order.Chronological, null).results.slice(0, 6);
	};
	source.searchPlaylists = function(query, _type, order, _filters) {
		const q = String(query ?? "").trim();
		if (!q) return new MidadCollectionListPager(1, order);
		return new MidadPlaylistSearchPager(q, 1, order);
	};
	source.isPlaylistUrl = function(url) {
		return Boolean(playlistPartsFromUrl(url));
	};
	source.getPlaylist = function(url) {
		const parts = playlistPartsFromUrl(url);
		if (!parts) throw new ScriptException("Unsupported Midad playlist URL");
		const loaded = loadCollection(parts.id, 1);
		return grayjay.playlist_details(`collection-${loaded.collection.id}`, {
			name: cleanTitle(loaded.collection.name),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: authorFromScholars(loaded.collection.scholars),
			datetime: parseDate(loaded.collection.published_at),
			url: playlistUrl(loaded.collection.id),
			videoCount: Number(loaded.collection.entry_count || loaded.total || loaded.items.length || 0),
			contents: new MidadCollectionContentsPager(loaded.collection.id, 1),
			shareUrl: publicPlaylistUrl(loaded.collection.id, loaded.collection.slug)
		});
	};
	source.getChannelPlaylists = function(url) {
		if (isRootUrl(url) || sectionFromUrl(url)) return new MidadCollectionListPager(1, Type.Order.Chronological);
		const parts = channelPartsFromUrl(url);
		if (!parts) return new ArrayPlaylistPager([], DEFAULT_LIMIT);
		return new MidadPlaylistSearchPager(scholarPlaylistQuery(loadScholar(parts.id).name), 1);
	};
	source.isContentDetailsUrl = function(url) {
		return Boolean(contentPartsFromUrl(url));
	};
	source.getContentDetails = function(url) {
		const parts = contentPartsFromUrl(url);
		if (!parts) throw new ScriptException("Unsupported Midad content URL");
		return loadContentDetails(parts.kind, parts.id, url);
	};
	var MidadFeedPager = class MidadFeedPager extends VideoPager {
		constructor(sectionId, page = 1, order = Type.Order.Chronological) {
			const loaded = sectionId === "youtube" ? loadYoutubeFeed(page) : loadFeed(sectionId, page, order);
			super(loaded.items, loaded.hasMore, {
				sectionId,
				page: loaded.nextPage,
				order
			});
		}
		nextPage() {
			return apply_pager_state(this, new MidadFeedPager(this.context.sectionId, this.context.page, this.context.order));
		}
	};
	var MidadYoutubePager = class MidadYoutubePager extends VideoPager {
		constructor(page = 1) {
			const loaded = loadYoutubeFeed(page);
			super(loaded.items, loaded.hasMore, { page: loaded.nextPage });
		}
		nextPage() {
			return apply_pager_state(this, new MidadYoutubePager(this.context.page));
		}
	};
	var MidadSearchPager = class MidadSearchPager extends VideoPager {
		constructor(query, page = 1, section = "all", order) {
			const loaded = loadSearch(query, page, section, order);
			super(loaded.items, loaded.hasMore, {
				query,
				page: loaded.nextPage,
				section,
				order
			});
		}
		nextPage() {
			return apply_pager_state(this, new MidadSearchPager(this.context.query, this.context.page, this.context.section, this.context.order));
		}
	};
	var MidadCollectionListPager = class MidadCollectionListPager extends PlaylistPager {
		constructor(page = 1, order = Type.Order.Chronological) {
			const loaded = loadCollectionList(page, order);
			super(loaded.items, loaded.hasMore, {
				page: loaded.nextPage,
				order
			});
		}
		nextPage() {
			return apply_pager_state(this, new MidadCollectionListPager(this.context.page, this.context.order));
		}
	};
	var MidadPlaylistSearchPager = class MidadPlaylistSearchPager extends PlaylistPager {
		constructor(query, page = 1, order) {
			const loaded = loadPlaylistSearch(query, page, order);
			super(loaded.items, loaded.hasMore, {
				query,
				page: loaded.nextPage,
				order
			});
		}
		nextPage() {
			return apply_pager_state(this, new MidadPlaylistSearchPager(this.context.query, this.context.page, this.context.order));
		}
	};
	var MidadCollectionContentsPager = class MidadCollectionContentsPager extends VideoPager {
		constructor(collectionId, page = 1) {
			const loaded = loadCollection(collectionId, page);
			super(loaded.items, loaded.hasMore, {
				collectionId,
				page: loaded.nextPage
			});
		}
		nextPage() {
			return apply_pager_state(this, new MidadCollectionContentsPager(this.context.collectionId, this.context.page));
		}
	};
	function loadFeed(sectionId, page, order) {
		const section = sectionDefinition(sectionId);
		if (!section || section.id === "youtube") return loadYoutubeFeed(page);
		const pager = fetchInertia(feedUrl(section, page, order)).props?.data?.[section.dataKey];
		return {
			items: (Array.isArray(pager?.data) ? pager.data : []).map((item) => entryToFeed(item, section.kind)).filter(Boolean),
			hasMore: Boolean(pager?.links?.next),
			nextPage: Number(page || 1) + 1
		};
	}
	function loadYoutubeFeed(page) {
		const data = fetchInertia(`${BASE_URL}/youtube-midad${page > 1 ? `?page=${page}` : ""}`).props?.data ?? {};
		const videos = Array.isArray(data.videos?.data) ? data.videos.data : [];
		const playlists = Array.isArray(data.playlist?.data) ? data.playlist.data : [];
		return {
			items: [...videos, ...playlists].map(youtubeToNested).filter(Boolean),
			hasMore: Boolean(data.videos?.links?.next || data.playlist?.links?.next),
			nextPage: Number(page || 1) + 1
		};
	}
	function loadSearch(query, page, section, order) {
		const loaded = searchHits(query, page);
		const items = [];
		for (const hit of loaded.items) {
			if (hit.type !== "entry") continue;
			const kind = kindFromHit(hit);
			if (!kind || !sectionMatches(kind, section)) continue;
			const item = safeLoadContent(kind, hit.id, hit.url);
			if (item) items.push(item);
			if (items.length >= DEFAULT_LIMIT) break;
		}
		if (order === Type.Order.Popularity) items.sort((a, b) => Number(b.viewCount || 0) - Number(a.viewCount || 0));
		if (order === Type.Order.Chronological) items.sort((a, b) => Number(b.uploadDate || 0) - Number(a.uploadDate || 0));
		return {
			items,
			hasMore: loaded.hasMore,
			nextPage: loaded.nextPage
		};
	}
	function searchHits(query, page) {
		const inertia = fetchInertia(`${BASE_URL}/search?${query_string([["q", query], ["page", page > 1 ? page : null]])}`);
		const root = inertia.props?.data?.data;
		const hits = root?.data?.hits ?? root?.hits ?? [];
		const meta = root?.data?.meta ?? root?.meta ?? inertia.props?.data?.meta ?? {};
		return {
			items: Array.isArray(hits) ? hits : [],
			hasMore: Number(meta.currentPage ?? meta.current_page ?? page) < Number(meta.totalPages ?? meta.last_page ?? page),
			nextPage: Number(page || 1) + 1
		};
	}
	function loadPlaylistSearch(query, page, order) {
		const loaded = searchHits(query, page);
		const searchItems = loaded.items.filter((hit) => hit.type === "collection").map(hitToPlaylist).filter(Boolean);
		const fallbackItems = page === 1 ? searchCollectionList(query, order || Type.Order.Chronological) : [];
		const items = dedupeByUrl([...searchItems, ...fallbackItems]);
		if (order === Type.Order.Popularity) items.sort((a, b) => Number(b.videoCount || 0) - Number(a.videoCount || 0));
		if (order === Type.Order.Chronological) items.sort((a, b) => Number(b.datetime || 0) - Number(a.datetime || 0));
		return {
			items,
			hasMore: loaded.hasMore,
			nextPage: loaded.nextPage
		};
	}
	function searchCollectionList(query, order) {
		const q = normalize(query);
		if (!q) return [];
		const items = [];
		for (let page = 1; page <= 3 && items.length < DEFAULT_LIMIT; page++) {
			const loaded = loadCollectionList(page, order);
			items.push(...loaded.items.filter((item) => normalize(item.name).indexOf(q) >= 0));
			if (!loaded.hasMore) break;
		}
		return items;
	}
	function loadCollectionList(page, order) {
		const pager = fetchInertia(collectionListUrl(page, order)).props?.data?.mushafs;
		return {
			items: (Array.isArray(pager?.data) ? pager.data : []).map(collectionToPlaylist).filter(Boolean),
			hasMore: Boolean(pager?.links?.next),
			nextPage: Number(page || 1) + 1
		};
	}
	function loadCollection(id, page) {
		return cached("collectionCache", `${id}:${page}`, () => {
			const data = fetchInertia(`${BASE_URL}/collection/${id}${page > 1 ? `?page=${page}` : ""}`).props?.data ?? {};
			const collection = data.collection?.data ?? data.collection;
			const pager = data.entries;
			const entries = Array.isArray(pager?.data) ? pager.data : [];
			if (!collection?.id) throw new ScriptException("Midad collection not found");
			return {
				collection,
				items: entries.map((entry) => entryToFeed(entry, "recitation")).filter(Boolean),
				total: Number(pager?.meta?.total ?? entries.length),
				hasMore: Boolean(pager?.links?.next),
				nextPage: Number(page || 1) + 1
			};
		});
	}
	function loadContentDetails(kind, id, requestedUrl) {
		return cached("detailCache", `${kind}:${id}:${requestedUrl}`, () => {
			const data = fetchInertia(publicContentUrl(kind, id)).props?.data ?? {};
			const item = data.lesson ?? data.recitation ?? data.audiobook ?? data.video ?? data.youtube;
			if (!item?.id) throw new ScriptException("Midad item not found");
			if (kind === "youtube" || item.youtube_id) return youtubeToNested(item, requestedUrl);
			return entryToDetails(item, kind, requestedUrl, relatedEntries(data));
		});
	}
	function loadScholar(id) {
		return cached("channelCache", id, () => {
			const inertia = fetchInertia(`${BASE_URL}/scholar/${id}`);
			const scholar = inertia.props?.data?.scholar?.data ?? inertia.props?.data?.scholar;
			if (!scholar?.id) throw new ScriptException("Midad scholar not found");
			return scholarToChannel(scholar);
		});
	}
	function entryToFeed(item, kind) {
		if (!item?.id) return null;
		if (kind === "youtube") return youtubeToNested(item);
		return grayjay.feed_video(`${kind}-${item.id}`, {
			name: cleanTitle(item.title),
			thumbnails: content_thumbnails(_config, DEFAULT_ICON, pick_image(item)),
			author: authorFromEntry(item),
			uploadDate: parseDate(item.published_at),
			duration: 0,
			viewCount: parseViewCount(item.view_count_number ?? item.view_count),
			isLive: false,
			url: contentUrl(kind, item.id),
			shareUrl: publicContentUrl(kind, item.id, item.slug)
		});
	}
	function entryToDetails(item, kind, requestedUrl, related = []) {
		const resource = pick_playable_resource(item);
		if (!resource) throw new ScriptException("No playable Midad media resource found");
		const isAudio = String(resource.type ?? "").toLowerCase() === "audio";
		const details = grayjay.video(`${kind}-${item.id}`, {
			name: cleanTitle(resource.display_title || item.title),
			thumbnails: content_thumbnails(_config, DEFAULT_ICON, pick_image(item)),
			author: authorFromEntry(item),
			uploadDate: parseDate(item.published_at),
			duration: 0,
			viewCount: parseViewCount(item.view_count_number ?? item.view_count),
			isLive: false,
			url: requestedUrl || contentUrl(kind, item.id),
			description: entryDescription(item, kind),
			video: isAudio ? audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: resource.path,
				language: "ar"
			}) : video_source_descriptor({
				name: "MP4 Video",
				container: "video/mp4",
				codec: "h264",
				duration: 0,
				url: resource.path
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: publicContentUrl(kind, item.id, item.slug)
		});
		details.getContentRecommendations = function() {
			return new ArrayVideoPager(related.filter((entry) => entry?.id !== item.id).map((entry) => entryToFeed(entry, kindFromEntry(entry) || kind)).filter(Boolean), DEFAULT_LIMIT);
		};
		return details;
	}
	function youtubeToNested(item, requestedUrl = null) {
		if (!item?.id || !item.youtube_id) return null;
		const watchUrl = item.list_id ? `https://www.youtube.com/watch?v=${item.youtube_id}&list=${item.list_id}` : `https://www.youtube.com/watch?v=${item.youtube_id}`;
		return grayjay.nested(`youtube-${item.id}`, {
			name: cleanTitle(item.title),
			author: authorFromScholars(scholarsFrom(item)),
			datetime: parseDate(item.published_at),
			url: requestedUrl || contentUrl("youtube", item.id),
			contentUrl: watchUrl,
			contentName: cleanTitle(item.title),
			contentDescription: clean_text(item.description || ""),
			contentProvider: "YouTube",
			contentThumbnails: content_thumbnails(_config, DEFAULT_ICON, pick_image(item))
		});
	}
	function collectionToPlaylist(collection) {
		if (!collection?.id) return null;
		return grayjay.playlist(`collection-${collection.id}`, {
			name: cleanTitle(collection.name),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: authorFromScholars(collection.scholars),
			datetime: parseDate(collection.published_at),
			url: playlistUrl(collection.id),
			videoCount: Number(collection.entry_count || 0)
		});
	}
	function hitToPlaylist(hit) {
		if (!hit?.id) return null;
		return grayjay.playlist(`collection-${hit.id}`, {
			name: cleanTitle(hit.title),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(hit.id),
			videoCount: 0
		});
	}
	function hitToChannel(hit) {
		if (!hit?.id) return null;
		return grayjay.channel(`scholar-${hit.id}`, {
			name: cleanTitle(hit.title),
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${cleanTitle(hit.title)} على موقع مداد.`,
			url: channelUrl(hit.id),
			urlAlternatives: [hit.url || publicScholarUrl(hit.id)]
		});
	}
	function scholarToChannel(scholar) {
		return grayjay.channel(`scholar-${scholar.id}`, {
			name: cleanTitle(scholar.name),
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: clean_text(scholar.full_biography || scholar.brief_biography || ""),
			url: channelUrl(scholar.id, scholar.slug),
			urlAlternatives: [publicScholarUrl(scholar.id, scholar.slug)]
		});
	}
	function rootChannel() {
		return grayjay.channel("root", {
			name: DISPLAY_NAME,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "دروس وتلاوات وكتب صوتية ومرئيات من موقع مداد.",
			url: rootUrl(),
			urlAlternatives: [BASE_URL]
		});
	}
	function sectionChannel(section) {
		return grayjay.channel(`section-${section.id}`, {
			name: section.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${section.name} من موقع مداد.`,
			url: sectionUrl(section.id),
			urlAlternatives: [sectionPublicUrl(section)]
		});
	}
	function rootAuthor() {
		return grayjay.author("root", DISPLAY_NAME, rootUrl(), iconUrl());
	}
	function authorFromEntry(item) {
		return authorFromScholars(scholarsFrom(item));
	}
	function authorFromScholars(scholars) {
		const scholar = Array.isArray(scholars) ? scholars[0] : null;
		if (!scholar) return rootAuthor();
		const id = scholar.id ?? cleanTitle(scholar.name ?? scholar);
		const name = cleanTitle(scholar.name ?? scholar);
		return grayjay.author(`scholar-${id}`, name || DISPLAY_NAME, id ? channelUrl(id, scholar.slug) : rootUrl(), iconUrl());
	}
	function scholarsFrom(item) {
		const scholars = item?.entry_scholars ?? item?.scholars?.data ?? item?.scholars ?? item?.collection?.scholars;
		return Array.isArray(scholars) ? scholars : [];
	}
	function relatedEntries(data) {
		const related = data?.related_entries?.data ?? data?.entries?.data ?? [];
		return Array.isArray(related) ? related : [];
	}
	function kindFromHit(hit) {
		return entryKind(hit.entry_type) || entryKind(String(hit.url ?? "").match(/midad\.com\/([^/]+)/)?.[1]);
	}
	function kindFromEntry(entry) {
		if (entry?.youtube_id) return "youtube";
		if (entry?.mushaf_type || entry?.narration) return "recitation";
		return entryKind(String(entry?.type ?? entry?.entry_type ?? ""));
	}
	function entryKind(value) {
		const normalized = String(value ?? "").toLowerCase().replace(/s$/, "");
		if ([
			"lesson",
			"recitation",
			"audiobook",
			"video",
			"youtube"
		].indexOf(normalized) >= 0) return normalized;
		return null;
	}
	function sectionMatches(kind, section) {
		if (!section || section === "all") return true;
		if (section === "youtube") return kind === "youtube";
		return sectionDefinition(section)?.kind === kind;
	}
	function sectionDefinition(id) {
		return SECTIONS.find((section) => section.id === id || section.kind === id);
	}
	function sectionFilter() {
		return {
			id: "section",
			name: "القسم",
			isMultiSelect: false,
			filters: [{
				id: "all",
				name: "كل المواد",
				value: "all"
			}, ...SECTIONS.map((section) => ({
				id: section.id,
				name: section.name,
				value: section.id
			}))]
		};
	}
	function selectedSection(filters) {
		if (!filters) return "all";
		const raw = typeof filters === "string" ? filters : filters.section ?? selectedFilterValues(filters, "section")[0];
		const value = String(raw?.value ?? raw?.id ?? raw ?? "all");
		return sectionDefinition(value)?.id ?? (value === "all" ? "all" : "all");
	}
	function selectedFilterValues(filters, id) {
		if (!filters) return [];
		if (Array.isArray(filters)) return filters.filter((filter) => filter?.id === id || filter?.group?.id === id);
		if (typeof filters.get === "function") {
			const value = filters.get(id);
			return Array.isArray(value) ? value : value ? [value] : [];
		}
		const value = filters[id];
		return Array.isArray(value) ? value : value ? [value] : [];
	}
	function scholarPlaylistQuery(name) {
		const words = cleanTitle(name).split(/\s+/).filter(Boolean);
		if (words.length >= 2) return `مصحف ${words[0]} ${words[words.length - 1]}`;
		return `مصحف ${cleanTitle(name)}`;
	}
	function feedUrl(section, page, order) {
		const suffix = order === Type.Order.Popularity ? "top" : "new";
		const params = query_string([["page", page > 1 ? page : null]]);
		return `${BASE_URL}/${section.route}/${suffix}${params ? `?${params}` : ""}`;
	}
	function collectionListUrl(page, order) {
		const suffix = order === Type.Order.Popularity ? "top" : "new";
		const params = query_string([["page", page > 1 ? page : null]]);
		return `${BASE_URL}/recitations/${suffix}/collections${params ? `?${params}` : ""}`;
	}
	function sectionPublicUrl(section) {
		if (section.id === "youtube") return `${BASE_URL}/youtube-midad`;
		return `${BASE_URL}/${section.route}/new`;
	}
	function fetchInertia(url) {
		const page = parse_inertia_page(fetchPage(url));
		if (!page) throw new ScriptException("Midad page payload not found");
		return page;
	}
	function fetchPage(url) {
		return cached("pageCache", normalizePublicUrl(url), () => get_text(normalizePublicUrl(url), DEFAULT_HEADERS, false));
	}
	function safeLoadContent(kind, id, url) {
		try {
			return loadContentDetails(kind, id, url || contentUrl(kind, id));
		} catch (e) {
			logIfTesting(`Skipping Midad ${kind} ${id}: ${e}`);
			return null;
		}
	}
	function cached(cacheName, key, loader) {
		const cacheKey = String(key);
		const cachedItem = state[cacheName]?.[cacheKey];
		if (cachedItem?.expiresAt > Date.now()) return cachedItem.value;
		const value = loader();
		cache_set(state, CACHE_LIMITS, cacheName, cacheKey, {
			expiresAt: Date.now() + CACHE_MAX_AGE_MS,
			value
		});
		return value;
	}
	function isRootUrl(url) {
		const value = String(url ?? "");
		return REGEX.INTERNAL_ROOT.test(value) || REGEX.ROOT.test(value);
	}
	function sectionFromUrl(url) {
		return sectionDefinition(String(url ?? "").match(REGEX.INTERNAL_SECTION)?.[1])?.id ?? null;
	}
	function channelPartsFromUrl(url) {
		const value = String(url ?? "");
		const match = value.match(REGEX.INTERNAL_CHANNEL) || value.match(REGEX.WEB_CHANNEL);
		return match?.[1] ? {
			id: match[1],
			slug: safeDecode(match[2] ?? "")
		} : null;
	}
	function contentPartsFromUrl(url) {
		const value = String(url ?? "");
		const internalYoutube = value.match(REGEX.INTERNAL_YOUTUBE);
		if (internalYoutube) return {
			kind: "youtube",
			id: internalYoutube[1]
		};
		const internal = value.match(REGEX.INTERNAL_CONTENT);
		if (internal) return {
			kind: internal[1],
			id: internal[2]
		};
		const youtube = value.match(REGEX.WEB_YOUTUBE);
		if (youtube) return {
			kind: "youtube",
			id: youtube[1]
		};
		const web = value.match(REGEX.WEB_CONTENT);
		if (web) return {
			kind: web[1],
			id: web[2]
		};
		return null;
	}
	function playlistPartsFromUrl(url) {
		const value = String(url ?? "");
		const match = value.match(REGEX.INTERNAL_PLAYLIST) || value.match(REGEX.WEB_PLAYLIST);
		return match?.[1] ? { id: match[1] } : null;
	}
	function rootUrl() {
		return "midad://root";
	}
	function sectionUrl(id) {
		return `midad://section/${id}`;
	}
	function channelUrl(id, slug = "") {
		return `midad://scholar/${id}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
	}
	function contentUrl(kind, id) {
		return `midad://content/${kind}/${id}`;
	}
	function playlistUrl(id) {
		return `midad://playlist/collection/${id}`;
	}
	function publicScholarUrl(id, slug = "") {
		return `${BASE_URL}/scholar/${id}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
	}
	function publicPlaylistUrl(id, slug = "") {
		return `${BASE_URL}/collection/${id}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
	}
	function publicContentUrl(kind, id, slug = "") {
		if (kind === "youtube") return `${BASE_URL}/youtube-midad-v/${id}`;
		return `${BASE_URL}/${kind}/${id}${slug ? `/${encodeURIComponent(slug)}` : ""}`;
	}
	function normalizePublicUrl(url) {
		return String(url ?? "").replace(/^https:\/\/www\.midad\.com/i, BASE_URL);
	}
	function cleanTitle(value) {
		return clean_midad_title(value);
	}
	function parseDate(value) {
		const text = String(value ?? "").trim();
		if (!text) return 0;
		const normalized = text.includes("-") && /^\d{2}-\d{2}-\d{4}$/.test(text) ? text.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1") : text;
		const timestamp = Date.parse(normalized.replace(" ", "T"));
		return Number.isFinite(timestamp) ? Math.floor(timestamp / 1e3) : 0;
	}
	function parseViewCount(value) {
		if (typeof value === "number") return value;
		const text = String(value ?? "").trim().toLowerCase();
		const match = text.match(/^([\d.]+)\s*k$/);
		if (match) return Math.round(Number(match[1]) * 1e3);
		return Number(text.replace(/[^\d]/g, "")) || 0;
	}
	function entryDescription(item, kind) {
		return [
			KIND_LABELS[kind] || "",
			clean_text(item.headlines || item.body || ""),
			item.collection?.name ? `المجموعة: ${cleanTitle(item.collection.name)}` : "",
			scholarsFrom(item).length ? `العلماء: ${scholarsFrom(item).map((scholar) => cleanTitle(scholar.name ?? scholar)).join("، ")}` : "",
			item.source?.name ? `المصدر: ${cleanTitle(item.source.name)}` : ""
		].filter(Boolean).join("\n");
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function dedupeByUrl(items) {
		return dedupeBy(items, (item) => item?.url ?? item?.contentUrl);
	}
	function dedupeBy(items, key) {
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
	function normalize(value) {
		return normalize_search_text(value);
	}
	function safeDecode(value) {
		try {
			return decodeURIComponent(String(value ?? ""));
		} catch {
			return String(value ?? "");
		}
	}
	function logIfTesting(message) {
		if (typeof IS_TESTING !== "undefined" && IS_TESTING) log(message);
	}
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);

})();
