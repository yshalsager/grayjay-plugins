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

	var PLATFORM = "IslamHouse";
	var SITE_URL = "https://islamhouse.com";
	var API_URL = `https://api3.islamhouse.com/v3/paV29H2gm56kvLPy`;
	var DEFAULT_ICON = `${SITE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var SEARCH_LIMIT = 12;
	var DEFAULT_LANG = "en";
	var CACHE_LIMITS = { jsonCache: 180 };
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
		return new IslamHouseItemPager(1, "showall");
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [typeFilter(), languageFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"quran",
			"prayer",
			"islam",
			"hadith",
			"creed",
			"ramadan"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		return new IslamHouseSearchPager(1, query || "quran", selectedTypes(filters), selectedLanguage(filters));
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "root" || parsed?.type === "author";
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "author") return authorChannel(fetchAuthor(parsed.id, parsed.lang));
		return grayjay.channel("root", {
			name: "IslamHouse",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "IslamHouse audio and video in multiple languages.",
			url: "islamhouse://root",
			urlAlternatives: [`${SITE_URL}/en`, SITE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "author") return new IslamHouseAuthorPager(parsed.id, parsed.lang, 1);
		return source.getHome();
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type !== "author") return source.search(query, type, order, filters);
		return new IslamHouseAuthorPager(parsed.id, parsed.lang, 1, query);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager(dedupe_by_url([...fetchItems("audios", DEFAULT_LANG, DEFAULT_LANG, 1, 10).data, ...fetchItems("videos", DEFAULT_LANG, DEFAULT_LANG, 1, 10).data].flatMap((item) => item.prepared_by ?? []).map(authorChannel)).filter((channel) => !needle || normalize_search_text(channel.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist" || Boolean(publicItemId(url));
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		return new IslamHousePlaylistSearchPager(1, query || "quran", selectedTypes(filters), selectedLanguage(filters));
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		return itemToPlaylistDetails(fetchItem(parsed?.id || publicItemId(url), parsed?.lang || publicItemLang(url) || DEFAULT_LANG));
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "author") return new IslamHouseAuthorPlaylistPager(parsed.id, parsed.lang, 1);
		return new IslamHousePlaylistPager(1, "showall");
	};
	source.isContentDetailsUrl = function(url) {
		return parseInternalUrl(url)?.type === "item" || Boolean(publicItemId(url)) || /^https:\/\/api3\.islamhouse\.com\/v3\/[^/]+\/main\/get-item\/\d+\//i.test(String(url ?? ""));
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		const id = parsed?.id || publicItemId(url);
		const lang = parsed?.lang || publicItemLang(url) || DEFAULT_LANG;
		const index = Number(parsed?.index || 0);
		return itemToDetails(fetchItem(id, lang), index);
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
	function fetchItems(type, flang = DEFAULT_LANG, slang = DEFAULT_LANG, page = 1, limit = DEFAULT_LIMIT) {
		return fetchJson(`${API_URL}/main/${type}/${flang}/${slang}/${page}/${limit}/json`);
	}
	function fetchItem(id, lang = DEFAULT_LANG) {
		if (!id) throw new ScriptException(`${PLATFORM} item id missing`);
		return fetchJson(`${API_URL}/main/get-item/${id}/${lang}/json`);
	}
	function fetchAuthor(id, lang = DEFAULT_LANG) {
		return fetchJson(`${API_URL}/main/get-author/${id}/${lang}/json`);
	}
	function fetchAuthorItems(id, lang = DEFAULT_LANG, page = 1, limit = DEFAULT_LIMIT) {
		return fetchJson(`${API_URL}/main/get-author-items/${id}/showall/${lang}/${lang}/${page}/${limit}/json`);
	}
	function searchItems(query, types, lang, page) {
		const key = `search:${lang}:${types.join(",")}:${page}:${query}`;
		const cached = cache_get(_state, CACHE_LIMITS, "jsonCache", key);
		if (cached) return cached;
		const result = post_json(`${SITE_URL}/search/search.php`, JSON.stringify({
			term: query,
			langs: [lang],
			types,
			flang: lang,
			page
		}), {
			Accept: "application/json",
			"Content-Type": "application/json"
		});
		return cache_set(_state, CACHE_LIMITS, "jsonCache", key, result);
	}
	function hydrateSearchResults(query, types, lang, page) {
		return (searchItems(query, types, lang, page).items ?? []).slice(0, SEARCH_LIMIT).filter((item) => ["audios", "videos"].includes(item.type)).map((item) => fetchItem(item.id, item.lang || lang)).filter((item) => playableAttachments(item).length);
	}
	function playableAttachments(item) {
		return (item?.attachments ?? []).filter((attachment) => {
			const type = String(attachment.extension_type ?? "").toUpperCase();
			const url = String(attachment.url ?? "");
			return (type === "MP3" || /\.mp3(?:$|\?)/i.test(url) || type === "MP4" || /\.mp4(?:$|\?)/i.test(url)) && /^https?:\/\//i.test(url);
		});
	}
	function itemToFeed(item, attachmentIndex = 0) {
		const attachment = playableAttachments(item)[attachmentIndex] ?? playableAttachments(item)[0];
		if (!attachment) return null;
		const title = attachmentTitle(item, attachment, attachmentIndex);
		return grayjay.feed_video(`item-${item.id}-${attachmentIndex}`, {
			name: title,
			thumbnails: itemThumbnails(item),
			author: authorForItem(item),
			uploadDate: Number(item.add_date || 0),
			duration: 0,
			viewCount: Number(item.hits || 0),
			isLive: false,
			url: itemUrl(item.id, attachmentIndex, item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG),
			description: clean_text(item.description || item.full_description || item.title),
			video: sourceDescriptor(attachment, 0),
			shareUrl: publicItemUrl(item)
		});
	}
	function itemToDetails(item, attachmentIndex = 0) {
		const attachments = playableAttachments(item);
		const attachment = attachments[attachmentIndex] ?? attachments[0];
		if (!attachment) throw new ScriptException(`${PLATFORM} playable attachment not found`);
		const lang = item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG;
		return grayjay.video(`item-${item.id}-${attachmentIndex}`, {
			name: attachmentTitle(item, attachment, attachmentIndex),
			thumbnails: itemThumbnails(item),
			author: authorForItem(item),
			uploadDate: Number(item.add_date || 0),
			duration: 0,
			viewCount: Number(item.hits || 0),
			isLive: false,
			url: itemUrl(item.id, attachmentIndex, lang),
			description: itemDescription(item, attachments),
			video: sourceDescriptor(attachment, 0),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: publicItemUrl(item),
			getContentRecommendations: () => new ArrayVideoPager(attachments.map((entry, index) => itemToFeed(item, index)).filter((entry, index) => entry && index !== attachmentIndex), DEFAULT_LIMIT)
		});
	}
	function itemToPlaylist(item) {
		const attachments = playableAttachments(item);
		return grayjay.playlist(`playlist-${item.id}`, {
			name: clean_text(item.title),
			thumbnails: itemThumbnails(item),
			thumbnail: item.image || iconUrl(),
			author: authorForItem(item),
			datetime: Number(item.add_date || 0),
			url: playlistUrl(item.id, item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG),
			videoCount: attachments.length
		});
	}
	function itemToPlaylistDetails(item) {
		const attachments = playableAttachments(item);
		const lang = item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG;
		return grayjay.playlist_details(`playlist-${item.id}`, {
			name: clean_text(item.title),
			thumbnails: itemThumbnails(item),
			thumbnail: item.image || iconUrl(),
			author: authorForItem(item),
			datetime: Number(item.add_date || 0),
			url: playlistUrl(item.id, lang),
			videoCount: attachments.length,
			contents: new ArrayVideoPager(attachments.map((attachment, index) => itemToFeed(item, index)).filter(Boolean), DEFAULT_LIMIT)
		});
	}
	function sourceDescriptor(attachment, duration) {
		const url = attachment.url;
		if (String(attachment.extension_type ?? "").toUpperCase() === "MP3" || /\.mp3(?:$|\?)/i.test(url)) return audio_source_descriptor({
			name: "MP3 Audio",
			container: "audio/mpeg",
			codec: "mp3",
			duration,
			url,
			language: "en"
		});
		return video_source_descriptor({
			name: "MP4 Video",
			container: "video/mp4",
			codec: "h264",
			duration,
			url
		});
	}
	function attachmentTitle(item, attachment, index) {
		const description = clean_text(attachment.description);
		if (description && description !== clean_text(item.title)) return description;
		const suffix = playableAttachments(item).length > 1 ? ` #${index + 1}` : "";
		return `${clean_text(item.title)}${suffix}`;
	}
	function itemDescription(item, attachments) {
		const lines = [clean_text(item.full_description || item.description || item.title)];
		if (attachments.length > 1) lines.push(`Attachments: ${attachments.length}`);
		return lines.filter(Boolean).join("\n");
	}
	function itemThumbnails(item) {
		return item.image ? content_thumbnails(_config, DEFAULT_ICON, item.image) : static_thumbnails(_config, DEFAULT_ICON);
	}
	function authorForItem(item) {
		const author = (item.prepared_by ?? []).find((entry) => clean_text(entry.title)) || (item.prepared_by ?? [])[0];
		return author ? grayjay.author(`author-${author.id}`, clean_text(author.title || PLATFORM), authorUrl(author.id, item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG), iconUrl()) : rootAuthor();
	}
	function authorChannel(author) {
		return grayjay.channel(`author-${author.id}`, {
			name: clean_text(author.title || PLATFORM),
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: clean_text(author.description || author.title || PLATFORM),
			url: authorUrl(author.id, DEFAULT_LANG),
			urlAlternatives: author.api_url ? [author.api_url] : []
		});
	}
	function rootAuthor() {
		return grayjay.author("islamhouse", "IslamHouse", `${SITE_URL}/en`, iconUrl());
	}
	function publicItemUrl(item) {
		const type = item.type || "showall";
		return `${SITE_URL}/${item.translated_language || item.translation_language || item.source_language || DEFAULT_LANG}/${type}/${item.id}/`;
	}
	function publicItemId(url) {
		return String(url ?? "").match(/(?:get-item\/|\/(?:audios|videos|showall)\/|islamhouse\.com\/)(\d+)/i)?.[1] || "";
	}
	function publicItemLang(url) {
		return String(url ?? "").match(/islamhouse\.com\/([a-z]{2})\//i)?.[1] || DEFAULT_LANG;
	}
	function itemUrl(id, index = 0, lang = DEFAULT_LANG) {
		return `islamhouse://item/${id}/${index}/${lang}`;
	}
	function playlistUrl(id, lang = DEFAULT_LANG) {
		return `islamhouse://playlist/${id}/${lang}`;
	}
	function authorUrl(id, lang = DEFAULT_LANG) {
		return `islamhouse://author/${id}/${lang}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "islamhouse://root") return { type: "root" };
		let match = value.match(/^islamhouse:\/\/item\/(\d+)\/(\d+)\/([a-z]{2})$/i);
		if (match) return {
			type: "item",
			id: match[1],
			index: match[2],
			lang: match[3]
		};
		match = value.match(/^islamhouse:\/\/playlist\/(\d+)\/([a-z]{2})$/i);
		if (match) return {
			type: "playlist",
			id: match[1],
			lang: match[2]
		};
		match = value.match(/^islamhouse:\/\/author\/(\d+)\/([a-z]{2})$/i);
		if (match) return {
			type: "author",
			id: match[1],
			lang: match[2]
		};
		return null;
	}
	function typeFilter() {
		return {
			id: "content",
			name: "Content",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "All playable",
					value: "showall"
				},
				{
					id: "audios",
					name: "Audio",
					value: "audios"
				},
				{
					id: "videos",
					name: "Video",
					value: "videos"
				}
			]
		};
	}
	function languageFilter() {
		return {
			id: "language",
			name: "Language",
			isMultiSelect: false,
			filters: [
				{
					id: "en",
					name: "English",
					value: "en"
				},
				{
					id: "ar",
					name: "Arabic",
					value: "ar"
				},
				{
					id: "fr",
					name: "French",
					value: "fr"
				},
				{
					id: "es",
					name: "Spanish",
					value: "es"
				},
				{
					id: "ur",
					name: "Urdu",
					value: "ur"
				}
			]
		};
	}
	function selectedLanguage(filters) {
		return selected_filter_values(filters, "language")[0] || DEFAULT_LANG;
	}
	function selectedContent(filters) {
		const value = selected_filter_values(filters, "content")[0];
		return value && value !== "all" ? value : "showall";
	}
	function selectedTypes(filters) {
		const content = selectedContent(filters);
		return content === "audios" || content === "videos" ? [content] : ["audios", "videos"];
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	var IslamHouseItemPager = class IslamHouseItemPager extends VideoPager {
		constructor(page = 1, content = "showall", lang = DEFAULT_LANG) {
			const data = fetchItems(content, lang, content === "showall" ? "showall" : lang, page, DEFAULT_LIMIT);
			super((data.data ?? []).map((item) => itemToFeed(item)).filter(Boolean), Boolean(data.links?.next), {
				page,
				content,
				lang
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHouseItemPager(this.context.page + 1, this.context.content, this.context.lang));
		}
	};
	var IslamHouseSearchPager = class IslamHouseSearchPager extends VideoPager {
		constructor(page = 1, query = "quran", types = ["audios", "videos"], lang = DEFAULT_LANG) {
			const result = searchItems(query, types, lang, page);
			super(hydrateSearchResults(query, types, lang, page).map((item) => itemToFeed(item)).filter(Boolean), Boolean(result.showMore), {
				page,
				query,
				types,
				lang
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHouseSearchPager(this.context.page + 1, this.context.query, this.context.types, this.context.lang));
		}
	};
	var IslamHousePlaylistPager = class IslamHousePlaylistPager extends PlaylistPager {
		constructor(page = 1, content = "showall", lang = DEFAULT_LANG) {
			const data = fetchItems(content, lang, content === "showall" ? "showall" : lang, page, DEFAULT_LIMIT);
			super((data.data ?? []).filter((item) => playableAttachments(item).length > 1).map(itemToPlaylist), Boolean(data.links?.next), {
				page,
				content,
				lang
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHousePlaylistPager(this.context.page + 1, this.context.content, this.context.lang));
		}
	};
	var IslamHousePlaylistSearchPager = class IslamHousePlaylistSearchPager extends PlaylistPager {
		constructor(page = 1, query = "quran", types = ["audios", "videos"], lang = DEFAULT_LANG) {
			const result = searchItems(query, types, lang, page);
			super(hydrateSearchResults(query, types, lang, page).filter((item) => playableAttachments(item).length > 1).map(itemToPlaylist), Boolean(result.showMore), {
				page,
				query,
				types,
				lang
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHousePlaylistSearchPager(this.context.page + 1, this.context.query, this.context.types, this.context.lang));
		}
	};
	var IslamHouseAuthorPager = class IslamHouseAuthorPager extends VideoPager {
		constructor(id, lang = DEFAULT_LANG, page = 1, query = "") {
			const data = fetchAuthorItems(id, lang, page, DEFAULT_LIMIT);
			const needle = normalize_search_text(query);
			const items = (data.data ?? []).filter((item) => !needle || normalize_search_text(`${item.title} ${item.description}`).includes(needle));
			super(items.map((item) => itemToFeed(item)).filter(Boolean), Boolean(data.links?.next), {
				id,
				lang,
				page,
				query
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHouseAuthorPager(this.context.id, this.context.lang, this.context.page + 1, this.context.query));
		}
	};
	var IslamHouseAuthorPlaylistPager = class IslamHouseAuthorPlaylistPager extends PlaylistPager {
		constructor(id, lang = DEFAULT_LANG, page = 1) {
			const data = fetchAuthorItems(id, lang, page, DEFAULT_LIMIT);
			super((data.data ?? []).filter((item) => playableAttachments(item).length > 1).map(itemToPlaylist), Boolean(data.links?.next), {
				id,
				lang,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new IslamHouseAuthorPlaylistPager(this.context.id, this.context.lang, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	log("LOADED IslamHouse " + static_thumbnails(_config, DEFAULT_ICON).sources.length);

})();
