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

	var PLATFORM = "Baheth";
	var BASE_URL = "https://baheth.ieasybooks.com";
	var DEFAULT_ICON = `${BASE_URL}/favicon.png`;
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
		return new BahethSearchPager(1, "العلم");
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: []
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"القرآن",
			"التفسير",
			"الحديث",
			"الفقه",
			"العقيدة",
			"العلم"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, _filters) {
		return new BahethSearchPager(1, query || "العلم");
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "root" || parsed?.type === "speaker" || normalized === `${BASE_URL}/ar` || normalized === BASE_URL || /^https:\/\/baheth\.ieasybooks\.com\/(?:ar\/)?speakers\/[^/?#]+/i.test(normalized);
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "speaker") return speakerChannel(speakerPage(parsed.slug));
		const normalized = normalizePublicUrl(url);
		if (/^https:\/\/baheth\.ieasybooks\.com\/(?:ar\/)?speakers\/[^/?#]+/i.test(normalized)) return speakerChannel(fetchPage(localizedPublicUrl(normalized)));
		return grayjay.channel("root", {
			name: "باحث",
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "محاضرات ومقاطع إسلامية قابلة للبحث داخل التفريغات.",
			url: "baheth://root",
			urlAlternatives: [`${BASE_URL}/ar`, BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "speaker") return new BahethSpeakerMediaPager(parsed.slug, 1);
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
		if (parsed?.type !== "speaker") return source.search(query, type, order, filters);
		const speakerId = scopedId(speakerPage(parsed.slug), "speaker");
		return speakerId ? new BahethSearchPager(1, query || "العلم", { speaker: speakerId }) : source.search(query, type, order, filters);
	};
	source.searchChannels = function(query) {
		return new BahethSpeakerPager(1, query);
	};
	source.isPlaylistUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "playlist" || /^https:\/\/baheth\.ieasybooks\.com\/(?:ar\/)?playlists\/[^/?#]+/i.test(normalized);
	};
	source.searchPlaylists = function(query, _type, _order, _filters) {
		return new BahethPlaylistPager(1, query);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		return playlistDetails(parsed?.type === "playlist" ? playlistPage(parsed.slug) : fetchPage(localizedPublicUrl(normalizePublicUrl(url))));
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "speaker") return new BahethSpeakerPlaylistPager(parsed.slug, 1);
		return new BahethPlaylistPager(1);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "media" || /^https:\/\/baheth\.ieasybooks\.com\/(?:ar\/)?media\/[^/?#]+/i.test(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "media") return mediaDetails(mediaPage(parsed.slug));
		return mediaDetails(fetchPage(localizedPublicUrl(normalizePublicUrl(url)).replace(/[?#].*$/, "")));
	};
	source.getContentChapters = function(url) {
		const parsed = parseInternalUrl(url);
		return contentChapters(parsed?.type === "media" ? mediaPage(parsed.slug) : fetchPage(localizedPublicUrl(normalizePublicUrl(url)).replace(/[?#].*$/, "")));
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
	function fetchText(url) {
		const normalized = normalizePublicUrl(url);
		const cached = cache_get(_state, CACHE_LIMITS, "pageCache", normalized);
		if (cached) return cached;
		return cache_set(_state, CACHE_LIMITS, "pageCache", normalized, get_text(normalized, { Accept: "text/plain,*/*" }));
	}
	function speakerPage(slug) {
		return fetchPage(`${BASE_URL}/ar/speakers/${slug}`);
	}
	function playlistPage(slug) {
		return fetchPage(`${BASE_URL}/ar/playlists/${slug}`);
	}
	function mediaPage(slug) {
		return fetchPage(`${BASE_URL}/ar/media/${slug}`);
	}
	function searchPage(page, query, scope = {}) {
		return fetchPage(`${BASE_URL}/ar/transcriptions/search?${query_string([
			["turbo_frames_prefix", scope.speaker ? "speaker" : scope.playlist ? "playlist" : "home"],
			["transcriptions_query", query],
			["query", query],
			["speaker", scope.speaker || null],
			["playlist", scope.playlist || null],
			["page", page > 1 ? page : null]
		])}`);
	}
	function playlistListPage(page, query = "") {
		return fetchPage(`${BASE_URL}/ar/playlists?${query_string([["query", query || null], ["page", page > 1 ? page : null]])}`);
	}
	function speakerListPage(page, query = "") {
		return fetchPage(`${BASE_URL}/ar/speakers?${query_string([["query", query || null], ["page", page > 1 ? page : null]])}`);
	}
	function parseMediaItems(html) {
		const items = [];
		const regex = /<a\b[^>]*href=['"][^'"]*\/(?:ar\/)?media\/[^'"]+['"][^>]*>[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const href = attr(tag, "href");
			const slug = mediaSlug(href);
			if (!slug) continue;
			items.push({
				slug,
				title: linkTitle(tag, slug),
				shareUrl: absoluteUrl(href),
				image: imageFromHtml(tag),
				cueStart: Number(attr(tag, "data-start-time") || 0)
			});
		}
		return dedupe_by_url(items.map(mediaItemToFeed));
	}
	function parsePlaylists(html) {
		const items = [];
		const regex = /<a\b[^>]*href=['"][^'"]*\/(?:ar\/)?playlists\/[^'"]+['"][^>]*>[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const href = attr(tag, "href");
			const slug = playlistSlug(href);
			if (!slug) continue;
			items.push({
				slug,
				title: linkTitle(tag, slug),
				shareUrl: absoluteUrl(href),
				image: imageFromHtml(tag)
			});
		}
		return dedupe_by_url(items.map(playlistItemToPlatform));
	}
	function parseSpeakers(html) {
		const items = [];
		const regex = /<a\b[^>]*href=['"][^'"]*\/(?:ar\/)?speakers\/[^'"]+['"][^>]*>[\s\S]*?<\/a>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const href = attr(tag, "href");
			const slug = speakerSlug(href);
			if (!slug) continue;
			const title = linkTitle(tag, slug);
			if (!title || title === "المُتحدّثون") continue;
			items.push({
				slug,
				title,
				shareUrl: absoluteUrl(href),
				image: imageFromHtml(tag)
			});
		}
		return dedupe_by_url(items.map(speakerItemToChannel));
	}
	function mediaItemToFeed(item) {
		return grayjay.feed_video(`media-${item.slug}`, {
			name: item.title,
			thumbnails: item.image ? content_thumbnails(_config, DEFAULT_ICON, item.image) : static_thumbnails(_config, DEFAULT_ICON),
			author: rootAuthor(),
			uploadDate: 0,
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: mediaUrl(item.slug),
			description: item.cueStart ? `نتيجة تفريغ عند ${formatSeconds(item.cueStart)}` : "مادة من باحث",
			shareUrl: item.shareUrl
		});
	}
	function mediaDetails(html) {
		const pageUrl = meta(html, "og:url");
		const slug = mediaSlug(pageUrl);
		const audioUrl = mediaAudioUrl(html);
		if (!audioUrl) {
			const nested = mediaYoutubeNested(html);
			if (nested) return nested;
			throw new ScriptException(`${PLATFORM} media audio not found`);
		}
		const title = meta(html, "og:title") || slugTitle(slug);
		const duration = contentChapters(html).slice(-1)[0]?.timeEnd || 0;
		const thumbnail = meta(html, "og:image") || iconUrl();
		const publicUrl = pageUrl || `${BASE_URL}/ar/media/${slug}`;
		const speaker = speakerFromHtml(html);
		const youtubeUrl = youtubeLink(html);
		return grayjay.video(`media-${slug || audioUrl}`, {
			name: title,
			thumbnails: content_thumbnails(_config, DEFAULT_ICON, thumbnail),
			author: speaker ? speakerAuthor(speaker) : rootAuthor(),
			uploadDate: 0,
			duration,
			viewCount: 0,
			isLive: false,
			url: mediaUrl(slug),
			description: [meta(html, "og:description") || title, youtubeUrl ? `YouTube: ${youtubeUrl}` : ""].filter(Boolean).join("\n"),
			video: audio_source_descriptor({
				name: "WebM Audio",
				container: "audio/webm",
				codec: "opus",
				duration,
				url: audioUrl,
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: mediaSubtitles(publicUrl),
			shareUrl: publicUrl,
			getContentRecommendations: () => new ArrayVideoPager(mediaRecommendations(html, slug, title), DEFAULT_LIMIT)
		});
	}
	function playlistItemToPlatform(item) {
		return grayjay.playlist(`playlist-${item.slug}`, {
			name: item.title,
			thumbnails: item.image ? content_thumbnails(_config, DEFAULT_ICON, item.image) : static_thumbnails(_config, DEFAULT_ICON),
			thumbnail: item.image || iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(item.slug),
			videoCount: 0
		});
	}
	function playlistDetails(html) {
		const slug = playlistSlug(meta(html, "og:url"));
		const title = meta(html, "og:title") || slugTitle(slug);
		const contents = parseMediaItems(html);
		return grayjay.playlist_details(`playlist-${slug}`, {
			name: title,
			thumbnails: content_thumbnails(_config, DEFAULT_ICON, meta(html, "og:image") || iconUrl()),
			thumbnail: meta(html, "og:image") || iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(slug),
			videoCount: contents.length,
			contents: new ArrayVideoPager(contents, DEFAULT_LIMIT)
		});
	}
	function speakerItemToChannel(item) {
		return grayjay.channel(`speaker-${item.slug}`, {
			name: item.title,
			thumbnail: item.image ? absoluteUrl(item.image) : iconUrl(),
			banner: item.image ? absoluteUrl(item.image) : iconUrl(),
			description: `مواد ${item.title} على باحث`,
			url: speakerUrl(item.slug),
			urlAlternatives: [item.shareUrl]
		});
	}
	function speakerChannel(html) {
		const pageUrl = meta(html, "og:url");
		const slug = speakerSlug(pageUrl);
		const name = meta(html, "og:title") || slugTitle(slug);
		const image = meta(html, "og:image") || iconUrl();
		return grayjay.channel(`speaker-${slug}`, {
			name,
			thumbnail: image,
			banner: image,
			description: meta(html, "og:description") || `مواد ${name} على باحث`,
			url: speakerUrl(slug),
			urlAlternatives: [pageUrl || `${BASE_URL}/ar/speakers/${slug}`]
		});
	}
	function scopedId(html, key) {
		return extract_first(html, new RegExp(`${key}=(\\d+)`, "i"));
	}
	function cueChapters(html) {
		const chapters = [];
		const regex = /<[^>]+data-(?:start|end)-time=['"][^'"]+['"][^>]*>/gi;
		let match;
		while ((match = regex.exec(html)) !== null) {
			const tag = match[0];
			const start = Number(attr(tag, "data-start-time"));
			const end = Number(attr(tag, "data-end-time"));
			if (end > start) chapters.push({
				name: `مقطع ${chapters.length + 1}`,
				timeStart: start,
				timeEnd: end,
				type: Type.Chapter.NORMAL
			});
		}
		return chapters;
	}
	function contentChapters(html) {
		const chapters = cueChapters(html);
		if (chapters.length) return chapters;
		const publicUrl = meta(html, "og:url");
		if (!publicUrl) return [];
		try {
			return srtChapters(fetchText(`${publicUrl.replace(/[?#].*$/, "")}/download_transcription_in_srt`));
		} catch (e) {
			debug_log(PLATFORM, "Failed to load chapters from SRT", e);
			return [];
		}
	}
	function srtChapters(value) {
		const chapters = [];
		const regex = /(?:^|\n)(?:\d+\s*\n)?(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
		let match;
		while ((match = regex.exec(String(value ?? ""))) !== null) {
			const start = timeToSeconds(match[1]);
			const end = timeToSeconds(match[2]);
			if (end > start) chapters.push({
				name: `مقطع ${chapters.length + 1}`,
				timeStart: start,
				timeEnd: end,
				type: Type.Chapter.NORMAL
			});
		}
		return chapters;
	}
	function mediaSubtitles(publicUrl) {
		try {
			const srt = fetchText(`${publicUrl.replace(/[?#].*$/, "")}/download_transcription_in_srt`);
			return [{
				name: "التفريغ",
				language: "ar",
				format: "text/vtt",
				url: `data:text/vtt;charset=utf-8,${encodeURIComponent(srtToVtt(srt))}`
			}];
		} catch (e) {
			debug_log(PLATFORM, "Failed to load subtitles", e);
			return [];
		}
	}
	function srtToVtt(value) {
		return `WEBVTT\n\n${String(value ?? "").replace(/\r/g, "").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2").trim()}\n`;
	}
	function mediaAudioUrl(html) {
		return absoluteUrl(attrFromHtml(html, "data-baheth-link")) || absoluteUrl(attrFromHtml(html, "data-github-from-youtube-link")) || absoluteUrl(extract_first(html, /(https:\/\/baheth-audios\.ieasybooks\.com\/[^'"\s<>]+\/audio\.webm)/i));
	}
	function youtubeLink(html) {
		return absoluteUrl(attrFromHtml(html, "data-youtube-link") || extract_first(html, /(https:\/\/(?:www\.)?youtube\.com\/watch\?v=[^'"\s<>]+)/i) || extract_first(html, /(https:\/\/youtu\.be\/[^'"\s<>]+)/i));
	}
	function mediaYoutubeNested(html) {
		const contentUrl = youtubeLink(html);
		if (!contentUrl) return null;
		const pageUrl = meta(html, "og:url");
		const slug = mediaSlug(pageUrl) || youtubeId(contentUrl);
		const title = meta(html, "og:title") || slugTitle(slug);
		const thumbnail = meta(html, "og:image") || youtubeThumbnail(contentUrl) || iconUrl();
		const speaker = speakerFromHtml(html);
		const nested = grayjay.nested(`youtube-${slug || contentUrl}`, {
			name: title,
			author: speaker ? speakerAuthor(speaker) : rootAuthor(),
			datetime: 0,
			url: slug ? mediaUrl(slug) : pageUrl || contentUrl,
			contentUrl,
			contentName: title,
			contentDescription: meta(html, "og:description") || title,
			contentProvider: "YouTube",
			contentThumbnails: content_thumbnails(_config, DEFAULT_ICON, thumbnail)
		});
		nested.getContentRecommendations = function() {
			return new ArrayVideoPager(mediaRecommendations(html, slug, title), DEFAULT_LIMIT);
		};
		return nested;
	}
	function mediaRecommendations(html, slug, title) {
		const playlist = parsePlaylists(html).find((item) => parseInternalUrl(item.url)?.type === "playlist");
		const playlistItems = playlist ? parseMediaItems(playlistPage(parseInternalUrl(playlist.url).slug)) : [];
		if (playlistItems.length) return playlistItems.filter((item) => item.url !== mediaUrl(slug)).slice(0, 12);
		const speakerId = scopedId(html, "speaker");
		const scoped = speakerId ? parseMediaItems(searchPage(1, firstSearchWord(title), { speaker: speakerId })) : [];
		return (scoped.length ? scoped : parseMediaItems(searchPage(1, firstSearchWord(title)))).filter((item) => item.url !== mediaUrl(slug)).slice(0, 12);
	}
	function hasNextPage(html, nextPage) {
		return new RegExp(`[?&]page=${nextPage}(?:[&"']|$)`, "i").test(html);
	}
	function attr(tag, name) {
		return decode_html(extract_first(tag, new RegExp(`${name}=['"]([^'"]*)['"]`, "i")) || "").trim();
	}
	function attrFromHtml(html, name) {
		return decode_html(extract_first(html, new RegExp(`${name}=['"]([^'"]*)['"]`, "i")) || "").trim();
	}
	function meta(html, property) {
		return decode_html(extract_first(html, new RegExp(`<meta\\b[^>]*(?:property|name)=['"]${property}['"][^>]*content=['"]([^'"]*)['"]`, "i")) || extract_first(html, new RegExp(`<meta\\b[^>]*content=['"]([^'"]*)['"][^>]*(?:property|name)=['"]${property}['"]`, "i")) || "").trim();
	}
	function imageFromHtml(html) {
		return absoluteUrl(attr(html, "src") || attr(html, "data-src") || extract_first(html, /<img\b[^>]*src=['"]([^'"]+)['"]/i));
	}
	function linkTitle(html, slug) {
		return clean_text((attr(html, "aria-label") || attr(html, "title")).replace(/^صفحة\s+/u, "")) || clean_text(html) || slugTitle(slug);
	}
	function speakerFromHtml(html) {
		const match = html.match(/<a\b[^>]*href=['"][^'"]*\/(?:ar\/)?speakers\/[^'"]+['"][^>]*>[\s\S]*?<\/a>/i);
		if (!match) return null;
		const tag = match[0];
		const slug = speakerSlug(attr(tag, "href"));
		if (!slug) return null;
		return {
			slug,
			name: linkTitle(tag, slug),
			image: imageFromHtml(tag),
			shareUrl: absoluteUrl(attr(tag, "href"))
		};
	}
	function mediaSlug(url) {
		return decodeURIComponent(String(url ?? "").match(/\/(?:ar\/)?media\/([^/?#]+)/i)?.[1] || "");
	}
	function playlistSlug(url) {
		return decodeURIComponent(String(url ?? "").match(/\/(?:ar\/)?playlists\/([^/?#]+)/i)?.[1] || "");
	}
	function speakerSlug(url) {
		return decodeURIComponent(String(url ?? "").match(/\/(?:ar\/)?speakers\/([^/?#]+)/i)?.[1] || "");
	}
	function slugTitle(slug) {
		return clean_text(decodeURIComponent(String(slug ?? "")).replace(/[-_]+/g, " "));
	}
	function firstSearchWord(title) {
		return clean_text(title).split(/\s+/).find((word) => word.length > 3) || "العلم";
	}
	function formatSeconds(value) {
		const seconds = Math.max(0, Math.floor(Number(value) || 0));
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
	}
	function timeToSeconds(value) {
		const parts = String(value ?? "").replace(",", ".").split(":");
		if (parts.length !== 3) return 0;
		return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
	}
	function absoluteUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("/")) return encodeUrl(`${BASE_URL}${raw}`);
		return encodeUrl(raw.replace(/^http:\/\//i, "https://"));
	}
	function localizedPublicUrl(url) {
		const normalized = normalizePublicUrl(url);
		if (/^https:\/\/baheth\.ieasybooks\.com\/(?:speakers|playlists|media)\//i.test(normalized)) return normalized.replace(`${BASE_URL}/`, `${BASE_URL}/ar/`);
		return normalized;
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim()).replace(/^http:\/\//i, "https://");
		if (!raw) return "";
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw;
	}
	function encodeUrl(url) {
		try {
			return encodeURI(decodeURI(url));
		} catch (_e) {
			return encodeURI(url);
		}
	}
	function rootAuthor() {
		return grayjay.author("baheth", "باحث", `${BASE_URL}/ar`, iconUrl());
	}
	function speakerAuthor(speaker) {
		return grayjay.author(`speaker-${speaker.slug}`, speaker.name || slugTitle(speaker.slug), speaker.shareUrl || `${BASE_URL}/ar/speakers/${speaker.slug}`, speaker.image || iconUrl());
	}
	function youtubeId(url) {
		return extract_first(url, /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&#?/]+)/i);
	}
	function youtubeThumbnail(url) {
		const id = youtubeId(url);
		return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : "";
	}
	function mediaUrl(slug) {
		return `baheth://media/${encodeURIComponent(slug)}`;
	}
	function playlistUrl(slug) {
		return `baheth://playlist/${encodeURIComponent(slug)}`;
	}
	function speakerUrl(slug) {
		return `baheth://speaker/${encodeURIComponent(slug)}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "baheth://root") return { type: "root" };
		let match = value.match(/^baheth:\/\/media\/(.+)$/);
		if (match) return {
			type: "media",
			slug: decodeURIComponent(match[1])
		};
		match = value.match(/^baheth:\/\/playlist\/(.+)$/);
		if (match) return {
			type: "playlist",
			slug: decodeURIComponent(match[1])
		};
		match = value.match(/^baheth:\/\/speaker\/(.+)$/);
		if (match) return {
			type: "speaker",
			slug: decodeURIComponent(match[1])
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	var BahethSearchPager = class BahethSearchPager extends VideoPager {
		constructor(page = 1, query = "العلم", scope = {}) {
			const html = searchPage(page, query, scope);
			super(parseMediaItems(html), hasNextPage(html, page + 1), {
				page,
				query,
				scope
			});
		}
		nextPage() {
			return apply_pager_state(this, new BahethSearchPager(this.context.page + 1, this.context.query, this.context.scope));
		}
	};
	var BahethPlaylistPager = class BahethPlaylistPager extends PlaylistPager {
		constructor(page = 1, query = "") {
			const html = playlistListPage(page, query);
			super(parsePlaylists(html), hasNextPage(html, page + 1), {
				page,
				query
			});
		}
		nextPage() {
			return apply_pager_state(this, new BahethPlaylistPager(this.context.page + 1, this.context.query));
		}
	};
	var BahethSpeakerPager = class BahethSpeakerPager extends ChannelPager {
		constructor(page = 1, query = "") {
			const html = speakerListPage(page, query);
			super(parseSpeakers(html), hasNextPage(html, page + 1), {
				page,
				query
			});
		}
		nextPage() {
			return apply_pager_state(this, new BahethSpeakerPager(this.context.page + 1, this.context.query));
		}
	};
	var BahethSpeakerPlaylistPager = class BahethSpeakerPlaylistPager extends PlaylistPager {
		constructor(slug, page = 1) {
			const html = page === 1 ? speakerPage(slug) : fetchPage(`${BASE_URL}/ar/speakers/${slug}?page=${page}`);
			super(parsePlaylists(html), hasNextPage(html, page + 1), {
				slug,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new BahethSpeakerPlaylistPager(this.context.slug, this.context.page + 1));
		}
	};
	var BahethSpeakerMediaPager = class BahethSpeakerMediaPager extends VideoPager {
		constructor(slug, page = 1) {
			const html = page === 1 ? speakerPage(slug) : fetchPage(`${BASE_URL}/ar/speakers/${slug}?page=${page}`);
			const items = parsePlaylists(html).slice(0, 5).flatMap((playlist) => parseMediaItems(playlistPage(parseInternalUrl(playlist.url).slug)).slice(0, 2));
			super(dedupe_by_url(items), hasNextPage(html, page + 1), {
				slug,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new BahethSpeakerMediaPager(this.context.slug, this.context.page + 1));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	log("LOADED Baheth " + static_thumbnails(_config, DEFAULT_ICON).sources.length);

})();
