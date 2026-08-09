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

	var PLATFORM = "Saleh Al Sheikh";
	var BASE_URL = "https://saleh.af.org.sa";
	var DEFAULT_ICON = `${BASE_URL}/sites/default/files/logo_0_0.png`;
	var DEFAULT_LIMIT = 24;
	var CACHE_LIMITS = { pageCache: 50 };
	var SECTIONS = [
		{
			id: "ftawa",
			name: "الفتاوى",
			url: `${BASE_URL}/ar/ftawa`
		},
		{
			id: "mohadrat",
			name: "المحاضرات",
			url: `${BASE_URL}/ar/mohadrat`
		},
		{
			id: "khotab",
			name: "الخطب",
			url: `${BASE_URL}/ar/khotab`
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
		return new SalehPager(sectionById("mohadrat"));
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [sectionFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"التوحيد",
			"العلم",
			"الإيمان",
			"الفتاوى",
			"المحاضرات",
			"الخطب"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		return new ArrayVideoPager(selectedSections(filters).flatMap((section) => parseItems(fetchPage(section.url), section)).filter((item) => !needle || normalize_search_text(item.title).includes(needle)).map(itemToDetails), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "root" || parsed?.type === "section" || normalizePublicUrl(url) === BASE_URL || Boolean(sectionByUrl(normalizePublicUrl(url)));
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url));
		if (section) return sectionChannel(section);
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "الموقع الرسمي للشيخ صالح بن عبد العزيز آل الشيخ.",
			url: "salehaf://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		return new SalehPager((parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url))) ?? sectionById("mohadrat"));
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		const parsed = parseInternalUrl(url);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url));
		return source.search(query, type, order, section ? { section: section.id } : filters);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([source.getChannel("salehaf://root"), ...SECTIONS.map(sectionChannel)].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist" || Boolean(sectionByUrl(normalizePublicUrl(url)));
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(selectedSections(filters).map(sectionToPlaylist).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		const section = parsed?.type === "playlist" ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url));
		if (!section) throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const items = parseItems(fetchPage(section.url), section);
		return grayjay.playlist_details(`playlist-${section.id}`, {
			name: section.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(section.id),
			videoCount: items.length,
			contents: new ArrayVideoPager(items.map(itemToDetails), DEFAULT_LIMIT)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalizePublicUrl(url));
		return new ArrayPlaylistPager((section ? [section] : SECTIONS).map(sectionToPlaylist), DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "audio" || /^https:\/\/saleh\.af\.org\.sa\/sites\/default\/files\/.*\.mp3/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "audio") return itemToDetails({
			section: sectionById(parsed.section),
			title: parsed.title,
			audioUrl: parsed.audioUrl,
			thumb: parsed.thumb
		});
		const normalized = normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return itemToDetails({
			section: sectionById("mohadrat"),
			title: decodeTitle(normalized),
			audioUrl: normalized,
			thumb: ""
		});
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
	function parseItems(html, section) {
		const items = [];
		const regex = /<div\b[^>]*class="[^"]*audioplayer-tobe[^"]*"[^>]*>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const title = clean_text(attr(tag, "data-videoTitle"));
			const audioUrl = mediaUrl(attr(tag, "data-source"));
			const thumb = normalizePublicUrl(attr(tag, "data-thumb"));
			if (!title || !audioUrl || !/\.mp3(?:$|\?)/i.test(audioUrl)) continue;
			items.push({
				section,
				title,
				audioUrl,
				thumb
			});
		}
		return dedupe_by_url(items.map((item) => ({
			...item,
			url: audioUrlInternal(item)
		})));
	}
	function itemToDetails(item) {
		const details = grayjay.video(`audio-${item.section.id}-${mediaId(item.audioUrl)}`, {
			name: item.title,
			thumbnails: item.thumb ? thumbnails(item.thumb) : staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: audioUrlInternal(item),
			description: item.section.name,
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
			shareUrl: item.audioUrl
		});
		details.getContentRecommendations = function() {
			return new ArrayVideoPager(parseItems(fetchPage(item.section.url), item.section).filter((candidate) => candidate.url !== audioUrlInternal(item)).map(itemToDetails), DEFAULT_LIMIT);
		};
		return details;
	}
	function sectionChannel(section) {
		return grayjay.channel(`section-${section.id}`, {
			name: section.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${section.name} الشيخ صالح آل الشيخ`,
			url: sectionUrl(section.id),
			urlAlternatives: [section.url]
		});
	}
	function sectionToPlaylist(section) {
		return grayjay.playlist(`playlist-${section.id}`, {
			name: section.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(section.id),
			videoCount: 0
		});
	}
	function rootAuthor() {
		return grayjay.author("saleh-af", "الشيخ صالح آل الشيخ", BASE_URL, iconUrl());
	}
	function attr(tag, name) {
		return decode_html(extract_first(tag, new RegExp(`${name}="([^"]*)"`, "i")) ?? "").trim();
	}
	function mediaUrl(value) {
		const raw = decode_html(String(value ?? "").trim());
		if (!raw) return "";
		return encodeURI(normalizePublicUrl(raw));
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("//")) return `https:${raw}`;
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw.replace("http://saleh.af.org.sa", "https://saleh.af.org.sa");
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url).split("/").pop().replace(/\.mp3(?:\?.*)?$/i, "")).replace(/[_-]+/g, " ");
	}
	function mediaId(url) {
		return String(url).split("/").pop().replace(/[^\w-]+/g, "-");
	}
	function selectedSections(filters) {
		const value = selected_filter_values(filters, "section")[0];
		return value && value !== "all" ? SECTIONS.filter((section) => section.id === value) : SECTIONS;
	}
	function sectionById(id) {
		return SECTIONS.find((section) => section.id === id);
	}
	function sectionByUrl(url) {
		return SECTIONS.find((section) => section.url === url);
	}
	function sectionFilter() {
		return {
			id: "section",
			name: "القسم",
			isMultiSelect: false,
			filters: [{
				id: "all",
				name: "كل الأقسام",
				value: "all"
			}, ...SECTIONS.map((section) => ({
				id: section.id,
				name: section.name,
				value: section.id
			}))]
		};
	}
	function sectionUrl(id) {
		return `salehaf://section/${id}`;
	}
	function playlistUrl(id) {
		return `salehaf://playlist/${id}`;
	}
	function audioUrlInternal(item) {
		return `salehaf://audio/${item.section.id}/${encodeURIComponent(item.title)}/${encodeURIComponent(item.audioUrl)}/${encodeURIComponent(item.thumb || "")}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "salehaf://root") return { type: "root" };
		let match = value.match(/^salehaf:\/\/section\/([^/]+)$/);
		if (match) return {
			type: "section",
			id: match[1]
		};
		match = value.match(/^salehaf:\/\/playlist\/([^/]+)$/);
		if (match) return {
			type: "playlist",
			id: match[1]
		};
		match = value.match(/^salehaf:\/\/audio\/([^/]+)\/([^/]+)\/([^/]+)\/?(.*)$/);
		if (match) return {
			type: "audio",
			section: match[1],
			title: decodeURIComponent(match[2]),
			audioUrl: decodeURIComponent(match[3]),
			thumb: decodeURIComponent(match[4] || "")
		};
		return null;
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	var SalehPager = class SalehPager extends VideoPager {
		constructor(section, page = 0) {
			const html = fetchPage(page ? `${section.url}?page=${page}` : section.url);
			super(parseItems(html, section).map(itemToDetails), Boolean(extract_first(html, /rel="next"/i)), {
				section,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new SalehPager(this.context.section, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`);

})();
