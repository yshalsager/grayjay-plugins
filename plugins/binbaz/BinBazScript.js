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
	function dedupe_strings(values, key = (value) => value) {
		const seen = {};
		const result = [];
		for (const value of values) {
			const dedupeKey = key(value);
			if (!dedupeKey || seen[dedupeKey]) continue;
			seen[dedupeKey] = true;
			result.push(value);
		}
		return result;
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

	var PLATFORM = "BinBaz";
	var BASE_URL = "https://binbaz.org.sa";
	var DEFAULT_ICON = `${BASE_URL}/img/square-logo.png`;
	var DEFAULT_LIMIT = 18;
	var CACHE_LIMITS = {
		pageCache: 80,
		detailCache: 40
	};
	var SECTIONS = [
		{
			id: "fatwas-1",
			kind: "fatwa",
			name: "مجموع الفتاوى",
			url: `${BASE_URL}/fatwas/kind/1`
		},
		{
			id: "fatwas-2",
			kind: "fatwa",
			name: "نور على الدرب",
			url: `${BASE_URL}/fatwas/kind/2`
		},
		{
			id: "fatwas-3",
			kind: "fatwa",
			name: "فتاوى الدروس",
			url: `${BASE_URL}/fatwas/kind/3`
		},
		{
			id: "fatwas-4",
			kind: "fatwa",
			name: "فتاوى الجامع الكبير",
			url: `${BASE_URL}/fatwas/kind/4`
		},
		{
			id: "audios-1",
			kind: "audio",
			name: "شروح الكتب",
			url: `${BASE_URL}/audios/kind/1`
		},
		{
			id: "audios-2",
			kind: "audio",
			name: "دروس ومحاضرات",
			url: `${BASE_URL}/audios/kind/2`
		},
		{
			id: "videos-1",
			kind: "video",
			name: "مقاطع مختارة",
			url: `${BASE_URL}/videos/type/1`
		},
		{
			id: "videos-2",
			kind: "video",
			name: "مرئيات الشيخ",
			url: `${BASE_URL}/videos/type/2`
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
		return new BinBazListPager(sectionById("fatwas-2"));
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [contentFilter(), sectionFilter()]
	});
	source.searchSuggestions = function(_query) {
		return [];
	};
	source.search = function(query, _type, _order, filters) {
		if (normalize_search_text(query)) return new ArrayContentPager([], DEFAULT_LIMIT);
		const section = selectedSection(filters);
		const content = selectedContent(filters);
		const sections = section ? [section] : SECTIONS.filter((item) => content === "all" || item.kind === content);
		const entries = [];
		for (const item of sections) entries.push(...loadSectionPage(item, 1).items);
		return new ArrayContentPager(entries.map(entryToContent).filter(Boolean), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		return normalizePublicUrl(url) === BASE_URL || parseInternalUrl(url)?.type === "section" || sectionByUrl(url);
	};
	source.getChannel = function(url) {
		const section = sectionFromUrl(url);
		if (section) return sectionChannel(section);
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "الموقع الرسمي لسماحة الشيخ عبد العزيز بن باز رحمه الله.",
			url: `${BASE_URL}`,
			urlAlternatives: [`${BASE_URL}/`]
		});
	};
	source.getChannelContents = function(url, _type, _order, filters) {
		return new BinBazListPager(sectionFromUrl(url) ?? selectedSection(filters) ?? sectionById("fatwas-2"));
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, type, order, filters) {
		const section = sectionFromUrl(url);
		return source.search(query, type, order, section ? {
			...filters,
			section: section.id
		} : filters);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([source.getChannel(BASE_URL), ...SECTIONS.map(sectionChannel)].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "series" || /^https:\/\/binbaz\.org\.sa\/audios\/series\/\d+/i.test(normalizePublicUrl(url));
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		if (normalize_search_text(query)) return new ArrayPlaylistPager([], DEFAULT_LIMIT);
		const section = selectedSection(filters);
		const sections = section?.kind === "audio" ? [section] : SECTIONS.filter((item) => item.kind === "audio");
		const playlists = [];
		for (const item of sections) playlists.push(...loadSectionPage(item, 1).items.filter((entry) => entry.type === "series").map(entryToPlaylist));
		return new ArrayPlaylistPager(dedupe_by_url(playlists), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const details = loadPlaylist(url);
		return grayjay.playlist_details(`series-${details.id}`, {
			name: details.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: seriesInternalUrl(details.url),
			videoCount: details.items.length,
			contents: new BinBazSeriesPager(details.url, details.items, details.hasMore, 1)
		});
	};
	source.getChannelPlaylists = function(url) {
		const section = sectionFromUrl(url);
		if (section && section.kind !== "audio") return new ArrayPlaylistPager([], DEFAULT_LIMIT);
		return source.searchPlaylists("", null, null, section ? { section: section.id } : { content: "audio" });
	};
	source.isContentDetailsUrl = function(url) {
		const normalized = normalizePublicUrl(url);
		return parseInternalUrl(url)?.type === "content" || /^https:\/\/binbaz\.org\.sa\/(fatwas|audios|videos)\/\d+/i.test(normalized) || /^https:\/\/files\.zadapps\.info\/.*\.mp3(?:$|\?)/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const normalized = normalizePublicUrl(url);
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "content") return loadContent(parsed.url);
		if (/^https:\/\/files\.zadapps\.info\/.*\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToVideo(normalized);
		return loadContent(normalized);
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
	function cachedDetail(url, load) {
		const normalized = normalizePublicUrl(url);
		const cached = cache_get(_state, CACHE_LIMITS, "detailCache", normalized);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "detailCache", normalized, load());
	}
	function loadContent(url) {
		const normalized = normalizePublicUrl(url);
		return cachedDetail(normalized, () => {
			const html = fetchPage(normalized);
			const kind = contentKind(normalized);
			if (kind === "video") return videoToNested(parseVideoDetail(html, normalized));
			const detail = parseAudioDetail(html, normalized, kind);
			if (!detail.audioUrl) throw new ScriptException(`No playable BinBaz MP3 found: ${normalized}`);
			return audioDetailToVideo(detail);
		});
	}
	function loadPlaylist(url) {
		const normalized = normalizePublicUrl(parseInternalUrl(url)?.url ?? url);
		const html = fetchPage(normalized);
		const id = extract_first(normalized, /\/audios\/series\/(\d+)/) ?? mediaId(normalized);
		const parsed = parseEntries(html, "audio");
		return {
			id,
			url: normalized,
			title: titleFromHtml(html, "سلسلة صوتية"),
			items: parsed.items.filter((item) => item.type === "audio"),
			hasMore: Boolean(parsed.nextUrl)
		};
	}
	function loadSectionPage(section, page = 1) {
		if (!section) return {
			items: [],
			nextUrl: null
		};
		const parsed = parseEntries(fetchPage(withPage(section.url, page)), section.kind);
		return {
			items: parsed.items.map((item) => ({
				...item,
				sectionId: section.id,
				sectionName: section.name
			})),
			nextUrl: parsed.nextUrl
		};
	}
	function parseEntries(html, kind) {
		if (kind === "video") return parseVideoEntries(html);
		const items = [];
		const articleRegex = /<article\b[^>]*class="[^"]*box__body__element[^"]*(fatwa|audio)[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
		let match;
		while ((match = articleRegex.exec(html)) !== null) {
			const body = match[2];
			const anchor = body.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
			if (!anchor) continue;
			const url = normalizePublicUrl(anchor[1]);
			const type = /\/audios\/series\//.test(url) ? "series" : contentKind(url);
			const title = clean_text(anchor[2]);
			const description = clean_text(extract_first(body, /<p[^>]*>([\s\S]*?)<\/p>/i) ?? "");
			if (!title || !url) continue;
			items.push({
				type,
				title,
				description,
				url
			});
		}
		return {
			items: dedupeEntries(items),
			nextUrl: nextUrl(html)
		};
	}
	function parseVideoEntries(html) {
		const items = [];
		const regex = /<a\b[^>]*href="(https:\/\/binbaz\.org\.sa\/videos\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const title = clean_text(match[2]);
			if (!title || /youtube-play/.test(match[2])) continue;
			items.push({
				type: "video",
				title,
				description: "",
				url: normalizePublicUrl(match[1])
			});
		}
		return {
			items: dedupeEntries(items),
			nextUrl: nextUrl(html)
		};
	}
	function parseAudioDetail(html, pageUrl, kind) {
		const media = parseDataFiles(html).find((item) => /^audio/i.test(item.type ?? "") || /^audio\//i.test(item.mime ?? "") || /\.mp3(?:$|\?)/i.test(item.link ?? ""));
		const fallbackAudio = extract_first(html, /<audio\b[^>]*src="([^"]+)"/i) ?? extract_first(html, /<a\b[^>]*href="([^"]+\.mp3[^"]*)"/i);
		return {
			kind,
			pageUrl,
			title: titleFromHtml(html, "مادة صوتية"),
			description: descriptionFromHtml(html),
			audioUrl: mediaUrl(media?.link ?? fallbackAudio),
			createdAt: parseDate(media?.created_at?.date ?? extract_first(html, /itemprop="uploadDate"\s+content="([^"]+)"/i))
		};
	}
	function parseVideoDetail(html, pageUrl) {
		const youtubeId = extract_first(normalizePublicUrl(extract_first(html, /<meta\s+itemprop="embedUrl"\s+content="([^"]+)"/i) ?? extract_first(html, /data-src="([^"]*youtube\.com\/embed\/[^"]+)"/i)), /\/embed\/([^?&/]+)/);
		if (!youtubeId) throw new ScriptException(`No YouTube embed found for BinBaz video: ${pageUrl}`);
		return {
			pageUrl,
			title: titleFromHtml(html, "مرئي"),
			description: descriptionFromHtml(html),
			contentUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
			thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
			uploadDate: parseDate(extract_first(html, /itemprop="uploadDate"\s+content="([^"]+)"/i))
		};
	}
	function parseDataFiles(html) {
		const raw = extract_first(html, /data-files="([^"]+)"/i);
		if (!raw) return [];
		try {
			return JSON.parse(decode_html(raw));
		} catch (e) {
			log(`Could not parse BinBaz data-files: ${e}`);
			return [];
		}
	}
	function entryToContent(item) {
		if (item.type === "series") return firstSeriesItem(item.url) ?? null;
		if (item.type === "video") return videoEntryToNested(item);
		return feedItem(item);
	}
	function feedItem(item) {
		return grayjay.feed_video(`${item.type}-${mediaId(item.url)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentInternalUrl(item.url),
			shareUrl: item.url
		});
	}
	function audioDetailToVideo(item) {
		const details = grayjay.video(`${item.kind}-${mediaId(item.pageUrl)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			author: rootAuthor(),
			uploadDate: item.createdAt,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentInternalUrl(item.pageUrl),
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
			shareUrl: item.pageUrl
		});
		details.getContentRecommendations = function() {
			return new ArrayContentPager(relatedEntries(item), DEFAULT_LIMIT);
		};
		return details;
	}
	function directMp3ToVideo(url) {
		const title = decodeURIComponent(url.split("/").pop().replace(/\.mp3(?:\?.*)?$/i, "")).replace(/[_-]+/g, " ").trim();
		return grayjay.video(`mp3-${mediaId(url)}`, {
			name: title || "BinBaz MP3",
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
	function videoEntryToNested(item) {
		const id = mediaId(item.url);
		const youtubeId = extract_first(item.thumbnail, /\/vi\/([^/]+)\//);
		return grayjay.nested(`video-${id}`, {
			name: item.title,
			author: rootAuthor(),
			datetime: 0,
			url: contentInternalUrl(item.url),
			contentUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : item.url,
			contentName: item.title,
			contentDescription: item.description || "",
			contentProvider: youtubeId ? "YouTube" : PLATFORM,
			contentThumbnails: item.thumbnail ? thumbnails(item.thumbnail) : staticThumbnails()
		});
	}
	function videoToNested(item) {
		return grayjay.nested(`video-${mediaId(item.pageUrl)}`, {
			name: item.title,
			author: rootAuthor(),
			datetime: item.uploadDate,
			url: contentInternalUrl(item.pageUrl),
			contentUrl: item.contentUrl,
			contentName: item.title,
			contentDescription: item.description,
			contentProvider: "YouTube",
			contentThumbnails: thumbnails(item.thumbnail)
		});
	}
	function firstSeriesItem(url) {
		const item = parseEntries(fetchPage(url), "audio").items.find((entry) => entry.type === "audio");
		return item ? feedItem(item) : null;
	}
	function relatedEntries(item) {
		const related = [];
		for (const section of SECTIONS.filter((section) => section.kind === item.kind)) {
			related.push(...loadSectionPage(section, 1).items.map(entryToContent).filter(Boolean));
			if (related.length >= DEFAULT_LIMIT) break;
		}
		return dedupe_by_url(related).filter((entry) => entry.url !== contentInternalUrl(item.pageUrl)).slice(0, DEFAULT_LIMIT);
	}
	function entryToPlaylist(item) {
		return grayjay.playlist(`series-${mediaId(item.url)}`, {
			name: item.title,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: seriesInternalUrl(item.url),
			videoCount: 0
		});
	}
	function sectionChannel(section) {
		return grayjay.channel(`section-${section.id}`, {
			name: section.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `قسم ${section.name} من موقع الشيخ ابن باز.`,
			url: sectionInternalUrl(section.id),
			urlAlternatives: [section.url]
		});
	}
	function rootAuthor() {
		return grayjay.author("binbaz", "الشيخ عبد العزيز بن باز", BASE_URL, iconUrl());
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function titleFromHtml(html, fallback) {
		return clean_text(extract_first(html, /<h1\b[^>]*class="[^"]*article-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)) || clean_text(extract_first(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i)) || clean_text(extract_first(html, /<title>([\s\S]*?)<\/title>/i)).replace(/\s*-\s*موقع الشيخ ابن باز\s*$/i, "") || fallback;
	}
	function descriptionFromHtml(html) {
		return clean_text(extract_first(html, /<div\b[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)) || clean_text(extract_first(html, /<meta\s+name="description"\s+content="([^"]+)"/i)) || "";
	}
	function nextUrl(html) {
		const href = extract_first(html, /<a\b[^>]*href="([^"]+)"[^>]*rel="next"/i) ?? extract_first(html, /<a\b[^>]*rel="next"[^>]*href="([^"]+)"/i);
		return href ? normalizePublicUrl(href) : null;
	}
	function mediaUrl(url) {
		if (!url) return null;
		return encodeURI(normalizePublicUrl(String(url).replace(/\\\//g, "/")));
	}
	function normalizePublicUrl(url) {
		const value = decode_html(String(url ?? "").trim()).replace(/\\\//g, "/");
		if (!value) return "";
		if (value.startsWith("//")) return `https:${value}`;
		if (value.startsWith("/")) return `${BASE_URL}${value}`;
		if (value.startsWith("http://binbaz.org.sa")) return value.replace("http://", "https://");
		if (value.startsWith("http://files.zadapps.info")) return value.replace("http://", "https://");
		return value;
	}
	function withPage(url, page) {
		if (page <= 1) return url;
		return `${url}?${query_string([["page", page]])}`;
	}
	function parseDate(value) {
		const date = Date.parse(String(value ?? "").replace(" ", "T"));
		return Number.isFinite(date) ? Math.floor(date / 1e3) : 0;
	}
	function contentKind(url) {
		if (/\/fatwas\//.test(url)) return "fatwa";
		if (/\/videos\//.test(url)) return "video";
		return "audio";
	}
	function mediaId(url) {
		return extract_first(url, /\/(?:fatwas|audios|videos|series)\/(\d+)/) ?? String(url).split("/").pop().replace(/[^\w-]+/g, "-");
	}
	function sectionById(id) {
		return SECTIONS.find((section) => section.id === id);
	}
	function sectionByUrl(url) {
		const normalized = normalizePublicUrl(url);
		return SECTIONS.find((section) => section.url === normalized);
	}
	function sectionFromUrl(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "section" ? sectionById(parsed.id) : sectionByUrl(url);
	}
	function dedupeEntries(items) {
		return dedupe_strings(items.map((item) => item.url)).map((url) => items.find((item) => item.url === url));
	}
	function sectionInternalUrl(id) {
		return `binbaz://section/${encodeURIComponent(id)}`;
	}
	function contentInternalUrl(url) {
		return `binbaz://content/${encodeURIComponent(normalizePublicUrl(url))}`;
	}
	function seriesInternalUrl(url) {
		return `binbaz://series/${encodeURIComponent(normalizePublicUrl(url))}`;
	}
	function parseInternalUrl(url) {
		const match = String(url ?? "").match(/^binbaz:\/\/(section|content|series)\/(.+)$/);
		if (!match) return null;
		const decoded = decodeURIComponent(match[2]);
		return match[1] === "section" ? {
			type: "section",
			id: decoded
		} : {
			type: match[1],
			url: decoded
		};
	}
	function contentFilter() {
		return {
			id: "content",
			name: "المحتوى",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "الكل",
					value: "all"
				},
				{
					id: "fatwa",
					name: "فتاوى صوتية",
					value: "fatwa"
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
	function selectedContent(filters) {
		const value = selected_filter_values(filters, "content")[0];
		return value && value !== "all" ? value : "all";
	}
	function selectedSection(filters) {
		const value = selected_filter_values(filters, "section")[0];
		return value && value !== "all" ? sectionById(value) : null;
	}
	var BinBazListPager = class BinBazListPager extends VideoPager {
		constructor(section, page = 1) {
			const loaded = loadSectionPage(section, page);
			super(loaded.items.map(entryToContent).filter(Boolean), Boolean(loaded.nextUrl), {
				section,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new BinBazListPager(this.context.section, this.context.page + 1));
		}
	};
	var BinBazSeriesPager = class BinBazSeriesPager extends VideoPager {
		constructor(url, firstPageItems = null, hasMore = false, page = 1) {
			const loaded = firstPageItems ? {
				items: firstPageItems,
				nextUrl: hasMore ? withPage(url, page + 1) : null
			} : parseEntries(fetchPage(withPage(url, page)), "audio");
			super(loaded.items.filter((item) => item.type === "audio").map(feedItem), Boolean(loaded.nextUrl), {
				url,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new BinBazSeriesPager(this.context.url, null, false, this.context.page + 1));
		}
	};
	var ArrayContentPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log(`LOADED ${PLATFORM} ${staticThumbnails().sources.length}`);

})();
