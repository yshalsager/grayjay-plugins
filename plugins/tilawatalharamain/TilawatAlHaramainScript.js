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

	var PLATFORM = "Tilawat Al Haramain";
	var BASE_URL = "https://tilawatalharamain.com";
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 24;
	var CACHE_LIMITS = {
		pageCache: 80,
		detailCache: 40
	};
	var SECTIONS = [
		{
			id: "prayers",
			name: "الفروض",
			description: "تلاوات الفروض",
			url: `${BASE_URL}/prayers`
		},
		{
			id: "taraweeh",
			name: "التراويح",
			description: "تلاوات رمضان",
			url: `${BASE_URL}/taraweeh`
		},
		{
			id: "quran",
			name: "المصحف",
			description: "السور المكتملة",
			url: `${BASE_URL}/quran`
		},
		{
			id: "miscellanies",
			name: "المزيد",
			description: "تلاوات منوعة",
			url: `${BASE_URL}/miscellanies`
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
		return new ArrayVideoPager(parseItems(fetchPage(BASE_URL)).map(itemToFeed), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [sectionFilter(), mosqueFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"الفاتحة",
			"البقرة",
			"التراويح",
			"الفروض",
			"الحرم المكي",
			"الحرم النبوي",
			"ياسر الدوسري",
			"بندر بليلة"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		const mosque = selectedMosque(filters);
		const sections = selectedSections(filters);
		const items = [];
		items.push(...parseItems(fetchPage(BASE_URL)));
		for (const section of sections) {
			const categories = parseCategories(fetchPage(section.url), section.id);
			if (needle) for (const category of categories.slice(0, 4)) items.push(...parseItems(fetchPage(category.url)).slice(0, 20));
		}
		return new ArrayVideoPager(dedupe_by_url(items).filter((item) => matchesMosque(item, mosque)).filter((item) => !needle || normalize_search_text(`${item.title ?? item.name} ${item.authorName ?? ""}`).includes(needle)).map(itemToFeed).filter(Boolean), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return normalized === BASE_URL || Boolean(sectionByUrl(normalized)) || isCategoryUrl(normalized) || parsed?.type === "section" || parsed?.type === "category";
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(parsed?.url ?? url);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalized);
		if (section) return sectionChannel(section);
		if (parsed?.type === "category" || isCategoryUrl(normalized)) return categoryChannel(categoryFromUrl(normalized));
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "تلاوات من الحرمين الشريفين.",
			url: BASE_URL,
			urlAlternatives: [`${BASE_URL}/`]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(parsed?.url ?? url);
		if (parsed?.type === "category" || isCategoryUrl(normalized)) return new ArrayVideoPager(parseItems(fetchPage(normalized)).map(itemToFeed), DEFAULT_LIMIT);
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
		const normalized = normalizePublicUrl(parsed?.url ?? url);
		if (parsed?.type === "category" || isCategoryUrl(normalized)) {
			const needle = normalize_search_text(query);
			return new ArrayVideoPager(parseItems(fetchPage(normalized)).filter((item) => !needle || normalize_search_text(`${item.title} ${item.authorName}`).includes(needle)).map(itemToFeed), DEFAULT_LIMIT);
		}
		return source.search(query, type, order, filters);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		const channels = [source.getChannel(BASE_URL), ...SECTIONS.map(sectionChannel)];
		for (const section of SECTIONS) channels.push(...parseCategories(fetchPage(section.url), section.id).slice(0, 20).map(categoryChannel));
		return new ArrayChannelPager(dedupe_by_url(channels).filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "category" || isCategoryUrl(normalizePublicUrl(url));
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		const mosque = selectedMosque(filters);
		const playlists = [];
		for (const section of selectedSections(filters)) playlists.push(...parseCategories(fetchPage(section.url), section.id).map(categoryToPlaylist));
		return new ArrayPlaylistPager(dedupe_by_url(playlists).filter((playlist) => matchesMosque(playlist, mosque)).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const normalized = normalizePublicUrl(parseInternalUrl(url)?.url ?? url);
		const items = parseItems(fetchPage(normalized));
		const category = categoryFromUrl(normalized);
		return grayjay.playlist_details(`category-${mediaId(normalized)}`, {
			name: category.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: categoryInternalUrl(normalized),
			videoCount: items.length,
			contents: new ArrayVideoPager(items.map(itemToFeed), DEFAULT_LIMIT)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(parsed?.url ?? url);
		const section = parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(normalized);
		if (section) return new ArrayPlaylistPager(parseCategories(fetchPage(section.url), section.id).map(categoryToPlaylist), DEFAULT_LIMIT);
		if (parsed?.type === "category" || isCategoryUrl(normalized)) return new ArrayPlaylistPager([categoryToPlaylist(categoryFromUrl(normalized))], DEFAULT_LIMIT);
		return source.searchPlaylists("", null, null, null);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(parsed?.url ?? url);
		return parsed?.type === "content" || /^https:\/\/tilawatalharamain\.com\/(prayers|taraweeh|quran|miscellanies|[ptqm])\/\d+/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		return loadDetails(normalizePublicUrl(parseInternalUrl(url)?.url ?? url));
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
	function loadDetails(url) {
		const cached = cache_get(_state, CACHE_LIMITS, "detailCache", url);
		if (cached) return cached;
		const html = fetchPage(url);
		const item = {
			type: detailType(url),
			title: titleFromHtml(html),
			authorName: clean_text(extract_first(html, /<h2\b[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<small>([\s\S]*?)<\/small>/i)) || PLATFORM,
			description: clean_text(extract_first(html, /<meta\s+name="description"\s+content="([^"]+)"/i) ?? ""),
			audioUrl: normalizePublicUrl(extract_first(html, /<source\b[^>]*src="([^"]+)"/i)),
			youtubeUrl: youtubeUrl(html),
			thumbnail: extract_first(html, /<meta\s+itemprop="thumbnailUrl"\s+content="([^"]+)"/i) ?? youtubeThumbnail(html),
			url
		};
		const details = item.audioUrl ? itemToDetails(item) : itemToNested(item);
		return cache_set(_state, CACHE_LIMITS, "detailCache", url, details);
	}
	function parseItems(html) {
		const items = [];
		const regex = /<li\b[^>]*class="[^"]*item\s+media[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const body = match[1];
			const url = normalizePublicUrl(extract_first(body, /<a\b[^>]*href="([^"]+)"/i));
			if (!isDetailUrl(url)) continue;
			const titleBlock = extract_first(body, /<h6\b[^>]*>([\s\S]*?)<\/h6>/i) ?? "";
			const title = clean_text(titleBlock.replace(/<br\s*\/?>[\s\S]*$/i, ""));
			const authorName = clean_text(extract_first(titleBlock, /<span\b[^>]*class="[^"]*text-muted[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ?? "");
			const thumbnail = normalizePublicUrl(extract_first(body, /<img\b[^>]*src="([^"]+)"/i));
			if (title && url) items.push({
				type: detailType(url),
				title,
				authorName,
				thumbnail,
				url
			});
		}
		return dedupe_by_url(items);
	}
	function parseCategories(html, sectionId) {
		const categories = [];
		const regex = /<div\b[^>]*class="[^"]*item[^"]*"[^>]*>\s*<a\b[^>]*href="([^"]+\/(?:prayers|taraweeh|quran|miscellanies)\/c\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const url = normalizePublicUrl(match[1]);
			const title = clean_text(match[2].replace(/<small>[\s\S]*$/i, ""));
			const count = Number(extract_first(match[2], /التلاوات\s*\((\d+)\)/) ?? 0);
			if (title && url) categories.push({
				type: "category",
				sectionId: sectionId ?? detailType(url),
				title,
				url,
				count
			});
		}
		return dedupe_by_url(categories);
	}
	function itemToFeed(item) {
		return grayjay.feed_video(`${item.type}-${mediaId(item.url)}`, {
			name: item.title,
			thumbnails: item.thumbnail ? thumbnails(item.thumbnail) : staticThumbnails(),
			author: authorFor(item),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentInternalUrl(item.url),
			shareUrl: item.url
		});
	}
	function itemToDetails(item) {
		const details = grayjay.video(`${item.type}-${mediaId(item.url)}`, {
			name: item.title,
			thumbnails: item.thumbnail ? thumbnails(item.thumbnail) : staticThumbnails(),
			author: authorFor(item),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentInternalUrl(item.url),
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
			shareUrl: item.url
		});
		if (item.youtubeUrl) details.getContentRecommendations = function() {
			return new ArrayVideoPager([itemToNested(item)], DEFAULT_LIMIT);
		};
		return details;
	}
	function itemToNested(item) {
		if (!item.youtubeUrl) throw new ScriptException(`No playable audio or YouTube URL found: ${item.url}`);
		return grayjay.nested(`${item.type}-youtube-${mediaId(item.url)}`, {
			name: item.title,
			author: authorFor(item),
			datetime: 0,
			url: contentInternalUrl(item.url),
			contentUrl: item.youtubeUrl,
			contentName: item.title,
			contentDescription: item.description || "",
			contentProvider: "YouTube",
			contentThumbnails: item.thumbnail ? thumbnails(item.thumbnail) : staticThumbnails()
		});
	}
	function categoryToPlaylist(category) {
		return grayjay.playlist(`category-${mediaId(category.url)}`, {
			name: category.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: categoryInternalUrl(category.url),
			videoCount: Number(category.count || 0)
		});
	}
	function sectionChannel(section) {
		return grayjay.channel(`section-${section.id}`, {
			name: section.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: section.description,
			url: sectionInternalUrl(section.id),
			urlAlternatives: [section.url]
		});
	}
	function categoryChannel(category) {
		return grayjay.channel(`category-${mediaId(category.url)}`, {
			name: category.title,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${category.title} - ${sectionById(category.sectionId)?.name ?? PLATFORM}`,
			url: categoryInternalUrl(category.url),
			urlAlternatives: [category.url]
		});
	}
	function categoryFromUrl(url) {
		const normalized = normalizePublicUrl(url);
		const html = fetchPage(normalized);
		const title = titleFromHtml(html);
		const count = parseItems(html).length;
		return {
			type: "category",
			sectionId: detailType(normalized),
			title,
			url: normalized,
			count
		};
	}
	function authorFor(item) {
		return grayjay.author(normalize_search_text(item.authorName || PLATFORM) || "haramain", item.authorName || PLATFORM, BASE_URL, iconUrl());
	}
	function rootAuthor() {
		return grayjay.author("haramain", PLATFORM, BASE_URL, iconUrl());
	}
	function titleFromHtml(html) {
		return clean_text(extract_first(html, /<h2\b[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.replace(/<small>[\s\S]*$/i, "")) || clean_text(extract_first(html, /<title>([\s\S]*?)<\/title>/i)).replace(/\s*-\s*تلاوات الحرمين\s*$/i, "") || PLATFORM;
	}
	function youtubeUrl(html) {
		const embed = extract_first(html, /<iframe\b[^>]*src="([^"]*youtube\.com\/embed\/[^"]+)"/i);
		const watch = extract_first(html, /href="(https:\/\/www\.youtube\.com\/watch\?v=[^"]+)"/i);
		if (watch) return decode_html(watch);
		const id = extract_first(embed, /\/embed\/([^?&/"]+)/);
		return id ? `https://www.youtube.com/watch?v=${id}` : null;
	}
	function youtubeThumbnail(html) {
		const id = extract_first(youtubeUrl(html), /v=([^&]+)/);
		return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
	}
	function normalizePublicUrl(url) {
		const value = decode_html(String(url ?? "").trim());
		if (!value) return "";
		if (value.startsWith("//")) return `https:${value}`;
		if (value.startsWith("/")) return `${BASE_URL}${value}`;
		if (value.startsWith("http://tilawatalharamain.com")) return value.replace("http://", "https://");
		return value;
	}
	function isDetailUrl(url) {
		return /^https:\/\/tilawatalharamain\.com\/(prayers|taraweeh|quran|miscellanies|[ptqm])\/\d+/i.test(url);
	}
	function isCategoryUrl(url) {
		return /^https:\/\/tilawatalharamain\.com\/(prayers|taraweeh|quran|miscellanies)\/c\/\d+/i.test(url);
	}
	function detailType(url) {
		const path = String(url).match(/tilawatalharamain\.com\/([^/]+)/)?.[1];
		return {
			p: "prayers",
			t: "taraweeh",
			q: "quran",
			m: "miscellanies"
		}[path] ?? path ?? "recitation";
	}
	function mediaId(url) {
		return extract_first(url, /\/(?:c\/)?(\d+)(?:$|[/?#])/) ?? String(url).split("/").pop().replace(/[^\w-]+/g, "-");
	}
	function matchesMosque(item, mosque) {
		if (!mosque || mosque === "all") return true;
		const text = normalize_search_text(`${item.title ?? item.name ?? ""} ${item.description ?? ""}`);
		if (mosque === "makkah") return /مكي|المكي|مكه|مكة|الحرام/.test(text);
		if (mosque === "madinah") return /نبوي|النبوي|المدينه|المدينة/.test(text);
		return true;
	}
	function selectedSections(filters) {
		const value = selected_filter_values(filters, "section")[0];
		if (!value || value === "all") return SECTIONS;
		return SECTIONS.filter((section) => section.id === value);
	}
	function selectedMosque(filters) {
		return selected_filter_values(filters, "mosque")[0] || "all";
	}
	function sectionById(id) {
		return SECTIONS.find((section) => section.id === id);
	}
	function sectionByUrl(url) {
		return SECTIONS.find((section) => section.url === url);
	}
	function sectionInternalUrl(id) {
		return `tilawatalharamain://section/${encodeURIComponent(id)}`;
	}
	function categoryInternalUrl(url) {
		return `tilawatalharamain://category/${encodeURIComponent(normalizePublicUrl(url))}`;
	}
	function contentInternalUrl(url) {
		return `tilawatalharamain://content/${encodeURIComponent(normalizePublicUrl(url))}`;
	}
	function parseInternalUrl(url) {
		const match = String(url ?? "").match(/^tilawatalharamain:\/\/(section|category|content)\/(.+)$/);
		if (!match) return null;
		const value = decodeURIComponent(match[2]);
		return match[1] === "section" ? {
			type: "section",
			id: value
		} : {
			type: match[1],
			url: value
		};
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
	function mosqueFilter() {
		return {
			id: "mosque",
			name: "الحرم",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "الكل",
					value: "all"
				},
				{
					id: "makkah",
					name: "الحرم المكي",
					value: "makkah"
				},
				{
					id: "madinah",
					name: "الحرم النبوي",
					value: "madinah"
				}
			]
		};
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`);

})();
