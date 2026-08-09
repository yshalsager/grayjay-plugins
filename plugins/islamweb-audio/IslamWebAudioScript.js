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

	var PLATFORM = "IslamWeb Audio";
	var BASE_URL = "https://audio.islamweb.net/audio";
	var DEFAULT_ICON = "https://www.islamweb.net/favicon.ico";
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { pageCache: 160 };
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
		return new IslamWebAudioListPager(`${BASE_URL}/index.php?page=allsoura&qid=1762&tab=qareelast`);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [searchFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"التوحيد",
			"القرآن",
			"الفقه",
			"العقيدة",
			"محمد مكي",
			"ابن باز"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		return new IslamWebSearchPager(query || "التوحيد", selectedSearchTab(filters), 0);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "root" || parsed?.type === "reader" || parsed?.type === "speaker" || /page=(allsoura|lecview).*?(qid|sid)=\d+/i.test(String(url ?? ""));
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url) || publicChannel(url);
		if (parsed?.type === "reader") return simpleChannel(`reader-${parsed.id}`, parsed.name || detailTitle(fetchPage(readerPage(parsed.id))), readerUrl(parsed.id), readerPage(parsed.id));
		if (parsed?.type === "speaker") return simpleChannel(`speaker-${parsed.id}`, parsed.name || detailTitle(fetchPage(speakerPage(parsed.id))), speakerUrl(parsed.id), speakerPage(parsed.id));
		return grayjay.channel("root", {
			name: "صوتيات إسلام ويب",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "تلاوات القرآن الكريم ومحاضرات ودروس إسلام ويب الصوتية.",
			url: "islamweb-audio://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url) || publicChannel(url);
		if (parsed?.type === "reader") return new IslamWebAudioListPager(readerPage(parsed.id));
		if (parsed?.type === "speaker") return new IslamWebAudioListPager(speakerPage(parsed.id));
		return source.getHome();
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		const needle = normalize_search_text(query);
		const pager = source.getChannelContents(url, type, order, filters);
		pager.results = pager.results.filter((item) => !needle || normalize_search_text(item.name).includes(needle));
		return pager;
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([...parseChannels(fetchPage(`${BASE_URL}/index.php?page=qareelast`), "reader"), ...parseChannels(fetchPage(`${BASE_URL}/index.php?page=lectures`), "speaker")].filter((channel) => !needle || normalize_search_text(channel.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "reader" || parsed?.type === "series" || /page=(allsoura|lecview).*?(qid|sid)=\d+/i.test(String(url ?? ""));
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(parseSeries(fetchPage(speakerPage(1265))).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url) || publicChannel(url);
		if (parsed?.type === "reader") return pagePlaylist(readerPage(parsed.id), readerUrl(parsed.id));
		if (parsed?.type === "series") return pagePlaylist(seriesPage(parsed.sid, parsed.lg), seriesUrl(parsed.sid, parsed.lg));
		throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url) || publicChannel(url);
		if (parsed?.type === "reader") return new ArrayPlaylistPager([playlistSummary(detailTitle(fetchPage(readerPage(parsed.id))), readerUrl(parsed.id), 0)], DEFAULT_LIMIT);
		if (parsed?.type === "speaker") return new ArrayPlaylistPager(parseSeries(fetchPage(speakerPage(parsed.id))), DEFAULT_LIMIT);
		return new ArrayPlaylistPager([], DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		return parseInternalUrl(url)?.type === "audio" || /audioid=\d+/i.test(String(url ?? ""));
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "audio" && parsed.media) return audioDetails({
			id: parsed.id,
			title: parsed.title,
			media: parsed.media,
			shareUrl: audioInfoUrl(parsed.id)
		});
		const id = parsed?.id || String(url ?? "").match(/audioid=(\d+)/i)?.[1];
		return audioDetailsFromPage(fetchPage(audioInfoUrl(id)), id);
	};
	function parseState(value) {
		try {
			return JSON.parse(value || "{}");
		} catch (_e) {
			return {};
		}
	}
	function fetchPage(url) {
		const normalized = absoluteUrl(url);
		const cached = cache_get(_state, CACHE_LIMITS, "pageCache", normalized);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "pageCache", normalized, get_text(normalized, { Accept: "text/html,application/xhtml+xml" }));
	}
	function parseRows(html) {
		const rows = [];
		const regex = /<li\b[^>]*id=['"]poem-line-(\d+)['"][\s\S]*?<\/li>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const row = match[0];
			const id = match[1];
			const href = attr(row, "href") || `index.php?page=audioinfo&audioid=${id}`;
			const media = attr(row, "data-file") || attr(row, "data-mp3") || attr(row, "url");
			const title = clean_text(extract_first(row, /href=['"][^'"]*audioinfo[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i)) || `مادة ${id}`;
			if (media) rows.push({
				id,
				title,
				media: absoluteUrl(media),
				shareUrl: absoluteUrl(href)
			});
		}
		return dedupe_by_url(rows.map((row) => audioFeed(row)));
	}
	function parseChannels(html, kind) {
		const regex = new RegExp(`<a\\b[^>]*href=['"][^'"]*page=${kind === "reader" ? "allsoura" : "lecview"}[^'"]*${kind === "reader" ? "qid" : "sid"}=(\\d+)[^'"]*['"][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
		const items = [];
		let match;
		while ((match = regex.exec(html)) !== null) {
			const name = clean_text(match[2]);
			if (name && !/^\d+$/.test(name)) items.push(simpleChannel(`${kind}-${match[1]}`, name, kind === "reader" ? readerUrl(match[1], name) : speakerUrl(match[1], name), kind === "reader" ? readerPage(match[1]) : speakerPage(match[1])));
		}
		return dedupeChannels(items);
	}
	function parseSeries(html) {
		const items = [];
		const regex = /<a\b[^>]*href=['"]([^'"]*page=lecview[^'"]*sid=(\d+)[^'"]*lg=(\d+)[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const name = clean_text(match[4]) || `سلسلة ${match[3]}`;
			items.push(playlistSummary(name, seriesUrl(match[2], match[3]), 0));
		}
		return dedupe_by_url(items);
	}
	function audioFeed(item) {
		return grayjay.feed_video(`audio-${item.id}`, {
			name: item.title,
			thumbnails: static_thumbnails(_config, DEFAULT_ICON),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: audioUrl(item.id, item.title, item.media),
			description: item.shareUrl,
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: item.media,
				language: "ar"
			}),
			shareUrl: item.shareUrl
		});
	}
	function audioDetails(item) {
		return grayjay.video(`audio-${item.id}`, {
			name: item.title,
			thumbnails: static_thumbnails(_config, DEFAULT_ICON),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: audioUrl(item.id, item.title, item.media),
			description: item.shareUrl,
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: item.media,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: item.shareUrl,
			getContentRecommendations: () => new ArrayVideoPager([], DEFAULT_LIMIT)
		});
	}
	function audioDetailsFromPage(html, id) {
		const media = contentUrl(html) || attrFromHtml(html, "data-file") || `${BASE_URL}/downloadmp3.php?audioid=${id}`;
		return audioDetails({
			id,
			title: detailTitle(html),
			media: absoluteUrl(media),
			shareUrl: audioInfoUrl(id)
		});
	}
	function pagePlaylist(pageUrl, internalUrl) {
		const html = fetchPage(pageUrl);
		const contents = parseRows(html);
		return grayjay.playlist_details(`playlist-${internalUrl}`, {
			name: detailTitle(html),
			thumbnails: static_thumbnails(_config, DEFAULT_ICON),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: internalUrl,
			videoCount: contents.length,
			contents: new ArrayVideoPager(contents, DEFAULT_LIMIT)
		});
	}
	function playlistSummary(name, url, count) {
		return grayjay.playlist(`playlist-${url}`, {
			name,
			thumbnails: static_thumbnails(_config, DEFAULT_ICON),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url,
			videoCount: count
		});
	}
	function simpleChannel(id, name, url, publicUrl) {
		return grayjay.channel(id, {
			name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: name,
			url,
			urlAlternatives: [publicUrl]
		});
	}
	function detailTitle(html) {
		return clean_text(extract_first(html, /<title>([^<]+)/i) || PLATFORM).replace(/ - صوتيات إسلام ويب.*/i, "");
	}
	function attr(tag, name) {
		return decode_html(extract_first(tag, new RegExp(`${name}=['"]([^'"]*)['"]`, "i")) || "").trim();
	}
	function attrFromHtml(html, name) {
		return decode_html(extract_first(html, new RegExp(`${name}=['"]([^'"]*)['"]`, "i")) || "").trim();
	}
	function contentUrl(html) {
		return decode_html(extract_first(html, /itemprop=['"]contentUrl['"][^>]*content=['"]([^'"]+)['"]/i) || extract_first(html, /content=['"]([^'"]+)['"][^>]*itemprop=['"]contentUrl['"]/i) || "").trim();
	}
	function absoluteUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
		return `${BASE_URL}/${raw.replace(/^\//, "").replace(/^audio\//, "")}`;
	}
	function readerPage(id) {
		return `${BASE_URL}/index.php?page=allsoura&qid=${id}&tab=qareelast`;
	}
	function speakerPage(id) {
		return `${BASE_URL}/index.php?page=lecview&sid=${id}`;
	}
	function seriesPage(sid, lg) {
		return `${BASE_URL}/index.php?page=lecview&sid=${sid}&read=0&lg=${lg}&kh=0`;
	}
	function audioInfoUrl(id) {
		return `${BASE_URL}/index.php?page=audioinfo&audioid=${id}`;
	}
	function audioUrl(id, title = "", media = "") {
		return `islamweb-audio://audio/${id}/${encodeURIComponent(title)}/${encodeURIComponent(media)}`;
	}
	function readerUrl(id, name = "") {
		return `islamweb-audio://reader/${id}/${encodeURIComponent(name)}`;
	}
	function speakerUrl(id, name = "") {
		return `islamweb-audio://speaker/${id}/${encodeURIComponent(name)}`;
	}
	function seriesUrl(sid, lg) {
		return `islamweb-audio://series/${sid}/${lg}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "islamweb-audio://root") return { type: "root" };
		let match = value.match(/^islamweb-audio:\/\/audio\/(\d+)\/([^/]*)\/(.*)$/);
		if (match) return {
			type: "audio",
			id: match[1],
			title: decodeURIComponent(match[2]),
			media: decodeURIComponent(match[3])
		};
		match = value.match(/^islamweb-audio:\/\/reader\/(\d+)\/?(.*)$/);
		if (match) return {
			type: "reader",
			id: match[1],
			name: decodeURIComponent(match[2] || "")
		};
		match = value.match(/^islamweb-audio:\/\/speaker\/(\d+)\/?(.*)$/);
		if (match) return {
			type: "speaker",
			id: match[1],
			name: decodeURIComponent(match[2] || "")
		};
		match = value.match(/^islamweb-audio:\/\/series\/(\d+)\/(\d+)$/);
		if (match) return {
			type: "series",
			sid: match[1],
			lg: match[2]
		};
		return null;
	}
	function publicChannel(url) {
		const value = String(url ?? "");
		let match = value.match(/page=allsoura[^#]*qid=(\d+)/i);
		if (match) return {
			type: "reader",
			id: match[1]
		};
		match = value.match(/page=lecview[^#]*sid=(\d+)/i);
		if (match) return {
			type: "speaker",
			id: match[1]
		};
		return null;
	}
	function searchFilter() {
		return {
			id: "tab",
			name: "نوع البحث",
			isMultiSelect: false,
			filters: [
				{
					id: "titlelec",
					name: "عناوين المحاضرات",
					value: "titlelec"
				},
				{
					id: "qiraname",
					name: "أسماء القراء",
					value: "qiraname"
				},
				{
					id: "namelec",
					name: "أسماء المحاضرين",
					value: "namelec"
				}
			]
		};
	}
	function selectedSearchTab(filters) {
		return selected_filter_values(filters, "tab")[0] || "titlelec";
	}
	function rootAuthor() {
		return grayjay.author("islamweb-audio", "إسلام ويب", BASE_URL, iconUrl());
	}
	function dedupeChannels(channels) {
		const seen = {};
		return channels.filter((channel) => {
			if (!channel.url || seen[channel.url]) return false;
			seen[channel.url] = true;
			return true;
		});
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	var IslamWebAudioListPager = class IslamWebAudioListPager extends VideoPager {
		constructor(url, page = 1) {
			const html = fetchPage(page > 1 ? `${url}&pageno=${page}` : url);
			super(parseRows(html), /pageno=\d+/i.test(html), {
				url,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamWebAudioListPager(this.context.url, this.context.page + 1));
		}
	};
	var IslamWebSearchPager = class IslamWebSearchPager extends VideoPager {
		constructor(query, tab = "titlelec", page = 0) {
			const html = fetchPage(`${BASE_URL}/ajax/index.php?${query_string([
				["page", tab],
				["kword", query],
				["pageno", page]
			])}`);
			super(tab === "titlelec" ? parseRows(html) : [], /pageno=\d+/i.test(html), {
				query,
				tab,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamWebSearchPager(this.context.query, this.context.tab, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED IslamWeb Audio " + static_thumbnails(_config, DEFAULT_ICON).sources.length);

})();
