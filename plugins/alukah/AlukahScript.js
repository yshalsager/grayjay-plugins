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

	var PLATFORM = "Alukah";
	var BASE_URL = "https://www.alukah.net";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { pageCache: 100 };
	var LIBRARY_CATEGORIES = [
		{
			id: "8012",
			name: "المكتبة السمعية"
		},
		{
			id: "10001",
			name: "أصول الفقه"
		},
		{
			id: "10551",
			name: "خطب منبرية"
		},
		{
			id: "11343",
			name: "القرآن الكريم"
		},
		{
			id: "10002",
			name: "فقه"
		},
		{
			id: "10003",
			name: "عقيدة"
		},
		{
			id: "10068",
			name: "تفسير"
		}
	];
	var AUDIO_BOOK_CATEGORIES = [
		{
			id: "0",
			name: "كل الكتب الناطقة"
		},
		{
			id: "5054",
			name: "المناهج الدراسية"
		},
		{
			id: "5096",
			name: "المكتبة العامة"
		}
	];
	var RADIO_CHANNELS = [
		{
			port: "quran",
			name: "قناة القرآن الكريم"
		},
		{
			port: "tafsir",
			name: "قناة تفسير القرآن الكريم"
		},
		{
			port: "ulumalquran",
			name: "قناة علوم القرآن الكريم"
		},
		{
			port: "aqidah",
			name: "قناة العقيدة والتوحيد"
		},
		{
			port: "hadith",
			name: "قناة الحديث وعلومه"
		},
		{
			port: "fiqhiyyah",
			name: "القناة الفقهية"
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
		return new ArrayVideoPager([...parseListItems(fetchPage(categoryUrl("library", "8012")), "library").slice(0, 12), ...RADIO_CHANNELS.slice(0, 4).map(radioToDetails)], DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"التوحيد",
			"القرآن",
			"الفقه",
			"العقيدة",
			"الحديث",
			"تفسير"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayVideoPager(dedupe_by_url((query ? parseSearchItems(fetchPage(`${BASE_URL}/Content/Search.aspx?q=${encodeURIComponent(query)}&CategoryAlias=Library`)) : [
			...parseListItems(fetchPage(categoryUrl("library", "8012")), "library"),
			...parseListItems(fetchPage(categoryUrl("audio-books", "0")), "audio-books"),
			...RADIO_CHANNELS.map(radioToDetails)
		]).filter((item) => !needle || normalize_search_text(item.name).includes(needle))), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "root" || parsed?.type === "category" || parsed?.type === "radio-root" || normalized === BASE_URL || /^https:\/\/www\.alukah\.net\/(?:library|audio_books)\/\d+\/?$/i.test(normalized);
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return categoryChannel(parsed.kind, parsed.id);
		if (parsed?.type === "radio-root") return simpleChannel("radio", "راديو الألوكة", "alukah://radio");
		const parsedPublicCategory = publicCategory(normalizePublicUrl(url));
		if (parsedPublicCategory) return categoryChannel(parsedPublicCategory.kind, parsedPublicCategory.id);
		return grayjay.channel("root", {
			name: "شبكة الألوكة",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "المكتبة السمعية والمكتبة الناطقة وراديو الألوكة.",
			url: "alukah://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return new AlukahListPager(parsed.kind, parsed.id);
		if (parsed?.type === "radio-root") return new ArrayVideoPager(RADIO_CHANNELS.map(radioToDetails), DEFAULT_LIMIT);
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
			source.getChannel("alukah://root"),
			simpleChannel("radio", "راديو الألوكة", "alukah://radio"),
			...LIBRARY_CATEGORIES.map((category) => categoryChannel("library", category.id)),
			...AUDIO_BOOK_CATEGORIES.map((category) => categoryChannel("audio-books", category.id))
		].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "playlist" || /^https:\/\/www\.alukah\.net\/(?:library|audio_books)\/\d+\/\d+/i.test(normalized);
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(parseListItems(fetchPage(categoryUrl("audio-books", "0")), "audio-books").map((item) => itemToPlaylist(item)).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "playlist") return detailToPlaylist(parsed.kind, detailPage(parsed.kind, parsed.id));
		const normalized = normalizePublicUrl(url);
		const publicDetail = publicDetailUrl(normalized);
		if (publicDetail) return detailToPlaylist(publicDetail.kind, fetchDetail(normalized));
		throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category" && parsed.kind === "audio-books") return new AlukahPlaylistPager(parsed.kind, parsed.id);
		return new AlukahPlaylistPager("audio-books", "0");
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "content" || parsed?.type === "radio" || /^https:\/\/radio\.alukah\.net\/[^/?#]+/i.test(normalized) || /^https:\/\/www\.alukah\.net\/(?:library|audio_books)\/\d+\/\d+/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "content") return trackToDetails(fetchDetail(parsed.url), Number(parsed.index));
		if (parsed?.type === "radio") return radioToDetails(radioByPort(parsed.port));
		const normalized = normalizePublicUrl(url);
		const radioPort = normalized.match(/^https:\/\/radio\.alukah\.net\/([^/?#]+)/i)?.[1];
		if (radioPort) return radioToDetails(radioByPort(radioPort));
		if (publicDetailUrl(normalized)) return trackToDetails(fetchDetail(normalized), 0);
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
		return fetchFreshPage(normalized);
	}
	function fetchFreshPage(url) {
		const normalized = normalizePublicUrl(url);
		return cache_set(_state, CACHE_LIMITS, "pageCache", normalized, get_text(normalized, { Accept: "text/html,application/xhtml+xml" }));
	}
	function fetchDetail(url) {
		const normalized = normalizePublicUrl(url);
		const detail = publicDetailUrl(normalized);
		let html = fetchPage(normalized);
		if (!hasTrackMarkers(html)) html = fetchFreshPage(normalized);
		return {
			url: normalized,
			html,
			id: contentIdFromUrl(normalized),
			categoryId: detail?.categoryId ?? "0"
		};
	}
	function detailPage(kind, id, categoryId = "0") {
		return fetchDetail(`${BASE_URL}/${kind === "audio-books" ? "audio_books" : "library"}/${categoryId}/${id}/`);
	}
	function parseListItems(html, kind) {
		const path = kind === "audio-books" ? "audio_books" : "library";
		const items = [];
		const regex = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const href = attr(tag, "href");
			const parts = href.match(new RegExp(`/${path}/(\\d+)/(\\d+)`, "i"));
			if (!parts) continue;
			const title = clean_text(attr(tag, "title") || tag);
			items.push({
				kind,
				categoryId: parts[1],
				id: parts[2],
				title,
				shareUrl: absoluteUrl(href),
				url: playlistUrl(kind, parts[2])
			});
		}
		return dedupe_by_url(items.map(itemToFeed));
	}
	function parseSearchItems(html) {
		const items = [];
		const regex = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const href = attr(tag, "href");
			const parts = href.match(/\/(library|audio_books)\/\d+\/(\d+)/i);
			if (!parts) continue;
			const kind = parts[1] === "audio_books" ? "audio-books" : "library";
			const title = clean_text(attr(tag, "title") || tag);
			items.push({
				kind,
				categoryId: parts[1],
				id: parts[2],
				title,
				shareUrl: absoluteUrl(href),
				url: playlistUrl(kind, parts[2])
			});
		}
		return dedupe_by_url(items.map(itemToFeed));
	}
	function attr(tag, name) {
		return decode_html(extract_first(tag, new RegExp(`${name}=['"]([^'"]*)['"]`, "i")) || "").trim();
	}
	function itemToFeed(item) {
		return grayjay.feed_video(`item-${item.kind}-${item.id}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentUrl(item.kind, item.shareUrl, 0),
			description: kindName(item.kind),
			shareUrl: item.shareUrl
		});
	}
	function itemToPlaylist(item) {
		const parsed = parseInternalUrl(item.url);
		const kind = parsed?.kind || item.kind;
		const id = parsed?.id || item.id;
		return grayjay.playlist(`playlist-${kind}-${id}`, {
			name: item.name || item.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(kind, id),
			videoCount: 0
		});
	}
	function detailToPlaylist(kind, detail) {
		const tracks = tracksFromDetail(detail, kind);
		return grayjay.playlist_details(`playlist-${kind}-${detail.id}`, {
			name: detailTitle(detail.html),
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(kind, detail.id),
			videoCount: tracks.length,
			contents: new ArrayVideoPager(tracks.map((track, index) => trackToFeed(detail, track, index, kind)), DEFAULT_LIMIT)
		});
	}
	function trackToFeed(detail, track, index, kind = null) {
		const resolvedKind = kind || (detail.url.includes("/audio_books/") ? "audio-books" : "library");
		return grayjay.feed_video(`track-${resolvedKind}-${detail.id}-${index}`, {
			name: track.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: track.date ? parseDate(track.date) : 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentUrl(resolvedKind, detail.url, index),
			description: detailTitle(detail.html),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: track.url,
				language: "ar"
			}),
			shareUrl: detail.url
		});
	}
	function trackToDetails(detail, index) {
		const kind = detail.url.includes("/audio_books/") ? "audio-books" : "library";
		const tracks = tracksFromDetail(detail, kind);
		const track = tracks[index];
		if (!track) throw new ScriptException(`${PLATFORM} track not found`);
		return grayjay.video(`track-${kind}-${detail.id}-${index}`, {
			name: track.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: track.date ? parseDate(track.date) : 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentUrl(kind, detail.url, index),
			description: detailTitle(detail.html),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: track.url,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: detail.url,
			getContentRecommendations: () => new ArrayVideoPager(tracks.map((item, itemIndex) => trackToFeed(detail, item, itemIndex, kind)).filter((_, itemIndex) => itemIndex !== index), DEFAULT_LIMIT)
		});
	}
	function tracksFromDetail(detail, _kind) {
		const tracks = [];
		const rows = String(detail.html ?? "").split(/<tr\b/i).slice(1).map((row) => `<tr${row.split(/<\/tr>/i)[0]}</tr>`);
		for (const row of rows) {
			if (!/table-(?:row|alt)/i.test(row)) continue;
			const title = clean_text(extract_first(row, /<td[^>]*>([\s\S]*?)<\/td>/i));
			const fileId = extract_first(row, /FileID=(\d+)/i) || String(tracks.length);
			const direct = decode_html(extract_first(row, /updateSource\(&quot;([^&]+)&quot;\)/i) || extract_first(row, /updateSource\(["']([^"']+)["']\)/i) || "");
			const fallback = extract_first(row, /href=['"]([^'"]*Download\.aspx\?format=mp3[^'"]*)['"]/i);
			const date = clean_text(row).match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";
			const url = absoluteUrl(direct || fallback);
			if (url) tracks.push({
				title: title || `${detailTitle(detail.html)} ${tracks.length + 1}`,
				url,
				fileId,
				date
			});
		}
		if (!tracks.length) {
			const title = detailTitle(detail.html);
			const decodedHtml = decode_html(detail.html);
			const regex = /updateSource\(["']([^"']+\.mp3)["']\)[\s\S]{0,180}?IncreaseStreamCount\((\d+)\)/gi;
			let match;
			while ((match = regex.exec(decodedHtml)) !== null) {
				const url = absoluteUrl(match[1]);
				if (url) tracks.push({
					title: `${title} ${tracks.length + 1}`,
					url,
					fileId: match[2],
					date: ""
				});
			}
		}
		if (!tracks.length) {
			const title = detailTitle(detail.html);
			const decodedHtml = decode_html(detail.html);
			const regex = /updateSource\(["']([^"']+\.mp3)["']\)/gi;
			let match;
			while ((match = regex.exec(decodedHtml)) !== null) {
				const url = absoluteUrl(match[1]);
				if (url) tracks.push({
					title: `${title} ${tracks.length + 1}`,
					url,
					fileId: String(tracks.length),
					date: ""
				});
			}
		}
		return dedupe_by_url(tracks);
	}
	function hasTrackMarkers(html) {
		return /updateSource\(|Download\.aspx\?format=mp3/i.test(String(html ?? ""));
	}
	function radioToDetails(radio) {
		return grayjay.video(`radio-${radio.port}`, {
			name: radio.name,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: -1,
			viewCount: 0,
			isLive: true,
			url: radioUrl(radio.port),
			description: "بث مباشر من راديو الألوكة",
			video: audio_source_descriptor({
				name: "Live MP3",
				container: "audio/mpeg",
				codec: "mp3",
				bitrate: 128e3,
				duration: -1,
				url: `https://radio.alukah.net/${radio.port}`,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: `https://radio.alukah.net/${radio.port}`,
			getContentRecommendations: () => new ArrayVideoPager(RADIO_CHANNELS.filter((item) => item.port !== radio.port).map(radioToDetails), DEFAULT_LIMIT)
		});
	}
	function categoryChannel(kind, id) {
		const category = categoryByKind(kind, id);
		return simpleChannel(`${kind}-${id}`, category.name, `alukah://category/${kind}/${id}`, `${category.name} - ${kindName(kind)}`);
	}
	function simpleChannel(id, name, url, description = "") {
		return grayjay.channel(id, {
			name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: description || name,
			url,
			urlAlternatives: [BASE_URL]
		});
	}
	function categoryByKind(kind, id) {
		return (kind === "audio-books" ? AUDIO_BOOK_CATEGORIES : LIBRARY_CATEGORIES).find((category) => String(category.id) === String(id)) || {
			id,
			name: `${kindName(kind)} ${id}`
		};
	}
	function radioByPort(port) {
		return RADIO_CHANNELS.find((radio) => radio.port === port) || {
			port,
			name: `راديو ${port}`
		};
	}
	function publicCategory(url) {
		let match = url.match(/^https:\/\/www\.alukah\.net\/library\/(\d+)\/?$/i);
		if (match) return {
			kind: "library",
			id: match[1]
		};
		match = url.match(/^https:\/\/www\.alukah\.net\/audio_books\/(\d+)\/?$/i);
		if (match) return {
			kind: "audio-books",
			id: match[1]
		};
		return null;
	}
	function publicDetailUrl(url) {
		let match = url.match(/^https:\/\/www\.alukah\.net\/library\/(\d+)\/(\d+)/i);
		if (match) return {
			kind: "library",
			categoryId: match[1],
			id: match[2]
		};
		match = url.match(/^https:\/\/www\.alukah\.net\/audio_books\/(\d+)\/(\d+)/i);
		if (match) return {
			kind: "audio-books",
			categoryId: match[1],
			id: match[2]
		};
		return null;
	}
	function contentIdFromUrl(url) {
		return String(url ?? "").match(/\/(?:library|audio_books)\/\d+\/(\d+)/)?.[1] || normalize_search_text(url).slice(-32);
	}
	function detailTitle(html) {
		return clean_text(extract_first(html, /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || extract_first(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || PLATFORM);
	}
	function parseDate(value) {
		const match = String(value ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
		if (!match) return 0;
		return Math.floor((/* @__PURE__ */ new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`)).getTime() / 1e3);
	}
	function rootAuthor() {
		return grayjay.author("alukah", "شبكة الألوكة", BASE_URL, iconUrl());
	}
	function kindName(kind) {
		return kind === "audio-books" ? "المكتبة الناطقة" : "المكتبة السمعية";
	}
	function absoluteUrl(url) {
		const raw = decode_html(String(url ?? "").trim()).replace(/^http:\/\//i, "https://");
		if (!raw) return "";
		if (raw.startsWith("/")) return encodeUrl(`${BASE_URL}${raw}`);
		return encodeUrl(raw);
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim()).replace(/^http:\/\//i, "https://");
		if (!raw) return "";
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw.replace(/^https:\/\/alukah\.net/i, BASE_URL);
	}
	function encodeUrl(url) {
		try {
			return encodeURI(decodeURI(url));
		} catch (_e) {
			return encodeURI(url);
		}
	}
	function categoryUrl(kind, id, page = 1) {
		return `${BASE_URL}/${kind === "audio-books" ? "audio_books" : "library"}/${id}/${page > 1 ? `Page/${page}/` : ""}`;
	}
	function playlistUrl(kind, id) {
		return `alukah://playlist/${kind}/${id}`;
	}
	function contentUrl(kind, url, index) {
		return `alukah://content/${kind}/${index}/${encodeURIComponent(url)}`;
	}
	function radioUrl(port) {
		return `alukah://radio/${port}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "alukah://root") return { type: "root" };
		if (value === "alukah://radio") return { type: "radio-root" };
		let match = value.match(/^alukah:\/\/category\/([^/]+)\/(\d+)$/);
		if (match) return {
			type: "category",
			kind: match[1],
			id: match[2]
		};
		match = value.match(/^alukah:\/\/playlist\/([^/]+)\/(\d+)$/);
		if (match) return {
			type: "playlist",
			kind: match[1],
			id: match[2]
		};
		match = value.match(/^alukah:\/\/content\/([^/]+)\/(\d+)\/(.+)$/);
		if (match) return {
			type: "content",
			kind: match[1],
			index: match[2],
			url: decodeURIComponent(match[3])
		};
		match = value.match(/^alukah:\/\/radio\/([^/]+)$/);
		if (match) return {
			type: "radio",
			port: match[1]
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var AlukahListPager = class AlukahListPager extends VideoPager {
		constructor(kind, categoryId, page = 1) {
			const html = fetchPage(categoryUrl(kind, categoryId, page));
			super(parseListItems(html, kind), new RegExp(`/${kind === "audio-books" ? "audio_books" : "library"}/${categoryId}/Page/${page + 1}/`, "i").test(html), {
				kind,
				categoryId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlukahListPager(this.context.kind, this.context.categoryId, this.context.page + 1));
		}
	};
	var AlukahPlaylistPager = class AlukahPlaylistPager extends PlaylistPager {
		constructor(kind, categoryId, page = 1) {
			const html = fetchPage(categoryUrl(kind, categoryId, page));
			const items = parseListItems(html, kind).map(itemToPlaylist);
			super(items, new RegExp(`/${kind === "audio-books" ? "audio_books" : "library"}/${categoryId}/Page/${page + 1}/`, "i").test(html), {
				kind,
				categoryId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlukahPlaylistPager(this.context.kind, this.context.categoryId, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED Alukah " + staticThumbnails().sources.length);

})();
