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

	var PLATFORM = "AlQasim";
	var BASE_URL = "https://a-alqasim.com";
	var API_URL = `${BASE_URL}/wp-json/alqasim-api/v1`;
	var DEFAULT_ICON = `${BASE_URL}/favicon.ico`;
	var DEFAULT_LIMIT = 20;
	var CACHE_LIMITS = { jsonCache: 160 };
	var KINDS = [
		{
			id: "lessons",
			name: "الدروس",
			publicType: "sounds-explain"
		},
		{
			id: "sermons",
			name: "الخطب",
			publicType: "khotab"
		},
		{
			id: "sounds",
			name: "التلاوات",
			publicType: "sounds"
		},
		{
			id: "videos",
			name: "المرئيات",
			publicType: "video"
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
		const home = fetchJson(`${API_URL}/home`);
		return new ArrayVideoPager(KINDS.flatMap((kind) => (home[kind.id] ?? []).map((post) => postToContent(post, kind.id))).filter(Boolean), DEFAULT_LIMIT);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological],
		filters: [contentFilter()]
	});
	source.searchSuggestions = function(query) {
		const terms = [
			"القرآن",
			"العلم",
			"التوحيد",
			"الخطب",
			"التفسير",
			"الحديث",
			"العقيدة"
		];
		const needle = normalize_search_text(query);
		return terms.filter((term) => !needle || normalize_search_text(term).includes(needle)).slice(0, 6);
	};
	source.search = function(query, _type, _order, filters) {
		const pager = new AlQasimSearchPager(query, 1, selectedKinds(filters).map((kind) => kind.id));
		if (query) return pager;
		return new ArrayVideoPager(selectedKinds(filters).flatMap((kind) => postsFrom(fetchList(kind.id, 1)).map((post) => postToContent(post, kind.id))).filter(Boolean), DEFAULT_LIMIT);
	};
	source.isChannelUrl = function(url) {
		const parsed = parseInternalUrl(url);
		return parsed?.type === "root" || parsed?.type === "channel" || parsed?.type === "category" || normalizePublicUrl(url) === BASE_URL;
	};
	source.getChannel = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "channel") return kindChannel(kindById(parsed.kind));
		if (parsed?.type === "category") return categoryChannel(parsed.kind, categoryById(parsed.kind, parsed.categoryId));
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "دروس وخطب وتلاوات ومرئيات الشيخ عبد المحسن القاسم.",
			url: "alqasim://root",
			urlAlternatives: [BASE_URL]
		});
	};
	source.getChannelContents = function(url, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "category") return new AlQasimCategoryPager(parsed.kind, parsed.categoryId);
		return new AlQasimKindPager(parsed?.type === "channel" ? parsed.kind : "lessons");
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Latest"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, _type, _order, _filters) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "channel") return source.search(query, null, null, { content: parsed.kind });
		if (parsed?.type === "category") {
			const needle = normalize_search_text(query);
			return new ArrayVideoPager(postsFrom(fetchCategory(parsed.kind, parsed.categoryId, 1)).map((post) => postToContent(post, parsed.kind)).filter((item) => item && (!needle || normalize_search_text(item.name).includes(needle))), DEFAULT_LIMIT);
		}
		return source.search(query, null, null, null);
	};
	source.searchChannels = function(query) {
		const needle = normalize_search_text(query);
		return new ArrayChannelPager([
			source.getChannel("alqasim://root"),
			...KINDS.map(kindChannel),
			...KINDS.flatMap((kind) => categoryTree(kind.id).slice(0, 12).map((category) => categoryChannel(kind.id, category)))
		].filter((channel) => !needle || normalize_search_text(`${channel.name} ${channel.description}`).includes(needle)), DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(url) {
		return parseInternalUrl(url)?.type === "playlist";
	};
	source.searchPlaylists = function(query, _type, _order, filters) {
		const needle = normalize_search_text(query);
		return new ArrayPlaylistPager(selectedKinds(filters).flatMap((kind) => categoryTree(kind.id).filter((category) => category.count > 0).map((category) => categoryToPlaylist(kind.id, category))).filter((playlist) => !needle || normalize_search_text(playlist.name).includes(needle)), DEFAULT_LIMIT);
	};
	source.getPlaylist = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type !== "playlist") throw new ScriptException(`Unsupported ${PLATFORM} playlist URL`);
		const category = categoryById(parsed.kind, parsed.categoryId);
		return grayjay.playlist_details(`playlist-${parsed.kind}-${parsed.categoryId}`, {
			name: category.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url,
			videoCount: category.count || 0,
			contents: new AlQasimCategoryPager(parsed.kind, parsed.categoryId)
		});
	};
	source.getChannelPlaylists = function(url) {
		const parsed = parseInternalUrl(url);
		const kinds = parsed?.type === "channel" ? [kindById(parsed.kind)] : KINDS;
		if (parsed?.type === "category") return new ArrayPlaylistPager([categoryToPlaylist(parsed.kind, categoryById(parsed.kind, parsed.categoryId))], DEFAULT_LIMIT);
		return new ArrayPlaylistPager(kinds.flatMap((kind) => categoryTree(kind.id).filter((category) => category.count > 0).map((category) => categoryToPlaylist(kind.id, category))), DEFAULT_LIMIT);
	};
	source.isContentDetailsUrl = function(url) {
		const parsed = parseInternalUrl(url);
		const normalized = normalizePublicUrl(url);
		return parsed?.type === "content" || /^https:\/\/(?:a-alqasim\.com|files\.a-alqasim\.com)\/.*\.mp3(?:$|\?)/i.test(normalized) || youtubeId(normalized);
	};
	source.getContentDetails = function(url) {
		const parsed = parseInternalUrl(url);
		if (parsed?.type === "content") return postToDetails(fetchDetail(parsed.kind, parsed.id), parsed.kind);
		const normalized = normalizePublicUrl(url);
		if (/\.mp3(?:$|\?)/i.test(normalized)) return directMp3ToDetails(normalized);
		const id = youtubeId(normalized);
		if (id) return youtubeToNested({
			id,
			title: "YouTube",
			video_url: normalized
		}, "videos", normalized);
		throw new ScriptException(`Unsupported ${PLATFORM} content URL`);
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
	function fetchList(kind, page = 1) {
		return fetchJson(`${API_URL}/${kind}?${query_string([["page", page], ["per_page", DEFAULT_LIMIT]])}`);
	}
	function fetchDetail(kind, id) {
		return fetchJson(`${API_URL}/${kind}/${id}?lang=ar`);
	}
	function fetchCategory(kind, id, page = 1) {
		return fetchJson(`${API_URL}/${kind}/category/${id}?${query_string([
			["page", page],
			["per_page", DEFAULT_LIMIT],
			["order_by_number", kind !== "sermons"]
		])}`);
	}
	function categoryTree(kind) {
		return fetchJson(`${API_URL}/${kind}/category-tree?parent_id=0&depth=1`).tree ?? [];
	}
	function postsFrom(data) {
		return Array.isArray(data?.posts) ? data.posts : [];
	}
	function categoryById(kind, id) {
		const cached = categoryTree(kind).find((category) => String(category.id) === String(id));
		if (cached) return cached;
		return fetchCategory(kind, id, 1).term ?? {
			id,
			name: `${kindById(kind).name} ${id}`,
			count: 0
		};
	}
	function postToContent(post, fallbackKind = null) {
		const kind = normalizeKind(post.post_type || fallbackKind);
		if (!kind) return null;
		if (mediaUrl(post.audio_url)) return postToFeed(post, kind);
		if (kind === "videos" && youtubeId(post.video_url)) return youtubeToNested(post, kind);
		return null;
	}
	function postToFeed(post, kind) {
		return grayjay.feed_video(`${kind}-${post.id}`, {
			name: postTitle(post),
			thumbnails: imageThumbnails(post.thumbnail),
			author: authorForPost(post, kind),
			uploadDate: parseDate(post.date),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentUrl(kind, post.id),
			description: clean_text(post.excerpt || post.content || kindById(kind).name),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: mediaUrl(post.audio_url),
				language: "ar"
			}),
			shareUrl: publicPostUrl(post, kind)
		});
	}
	function postToDetails(post, kind) {
		if (mediaUrl(post.audio_url)) return grayjay.video(`${kind}-${post.id}`, {
			name: postTitle(post),
			thumbnails: imageThumbnails(post.thumbnail),
			author: authorForPost(post, kind),
			uploadDate: parseDate(post.date),
			duration: 0,
			viewCount: 0,
			isLive: false,
			url: contentUrl(kind, post.id),
			description: clean_text(post.content || post.excerpt || kindById(kind).name),
			video: audio_source_descriptor({
				name: "MP3 Audio",
				container: "audio/mpeg",
				codec: "mp3",
				duration: 0,
				url: mediaUrl(post.audio_url),
				language: "ar"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: publicPostUrl(post, kind),
			getContentRecommendations: () => recommendations(post, kind)
		});
		if (kind === "videos" && youtubeId(post.video_url)) return youtubeToNested(post, kind);
		throw new ScriptException(`${PLATFORM} playable media not found`);
	}
	function youtubeToNested(post, kind, requestedUrl = null) {
		const id = youtubeId(post.video_url || requestedUrl);
		if (!id) return null;
		const watchUrl = `https://www.youtube.com/watch?v=${id}`;
		return grayjay.nested(`youtube-${post.id ?? id}`, {
			name: postTitle(post),
			author: authorForPost(post, kind),
			datetime: parseDate(post.date),
			url: requestedUrl || contentUrl(kind, post.id),
			contentUrl: watchUrl,
			contentName: postTitle(post),
			contentDescription: clean_text(post.content || post.excerpt || ""),
			contentProvider: "YouTube",
			contentThumbnails: imageThumbnails(post.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`)
		});
	}
	function directMp3ToDetails(url) {
		return grayjay.video(`mp3-${normalize_search_text(url).slice(-60)}`, {
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
	function recommendations(post, kind) {
		const category = (post.categories ?? []).slice(-1)[0];
		if (!category?.id) return new AlQasimKindPager(kind);
		return new ArrayVideoPager(postsFrom(fetchCategory(kind, category.id, 1)).filter((item) => String(item.id) !== String(post.id)).map((item) => postToContent(item, kind)).filter(Boolean), DEFAULT_LIMIT);
	}
	function postTitle(post) {
		return clean_text(post?.title || PLATFORM);
	}
	function publicPostUrl(post, kind) {
		if (!post?.slug) return BASE_URL;
		return `${BASE_URL}/${kindById(kind).publicType}/${post.slug}/`;
	}
	function mediaUrl(value) {
		return encodeUrl(normalizePublicUrl(value));
	}
	function normalizePublicUrl(url) {
		const raw = decode_html(String(url ?? "").trim());
		if (!raw) return "";
		if (raw.startsWith("//")) return `https:${raw}`;
		if (raw.startsWith("/")) return `${BASE_URL}${raw}`;
		return raw.replace(/^http:\/\//i, "https://").replace(/^https:\/\/www\.a-alqasim\.com/i, BASE_URL);
	}
	function youtubeId(url) {
		return String(url ?? "").match(/youtube\.com\/embed\/([^/?&"']+)/i)?.[1] || String(url ?? "").match(/[?&]v=([^&]+)/)?.[1] || String(url ?? "").match(/youtu\.be\/([^/?&"']+)/i)?.[1] || "";
	}
	function imageThumbnails(url) {
		const normalized = normalizePublicUrl(url);
		return normalized ? thumbnails(encodeUrl(normalized)) : staticThumbnails();
	}
	function encodeUrl(url) {
		try {
			return encodeURI(decodeURI(url));
		} catch (_e) {
			return encodeURI(url);
		}
	}
	function rootAuthor() {
		return grayjay.author("alqasim", "الشيخ عبد المحسن القاسم", BASE_URL, iconUrl());
	}
	function authorForPost(post, kind) {
		const name = (post.categories ?? [])[0]?.name || kindById(kind).name;
		return grayjay.author(`author-${normalize_search_text(name) || kind}`, name, BASE_URL, iconUrl());
	}
	function kindChannel(kind) {
		return grayjay.channel(`kind-${kind.id}`, {
			name: kind.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: `${kind.name} - ${PLATFORM}`,
			url: kindUrl(kind.id),
			urlAlternatives: [`${BASE_URL}/${kind.publicType}/`]
		});
	}
	function categoryChannel(kind, category) {
		return grayjay.channel(`category-${kind}-${category.id}`, {
			name: category.name,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: clean_text(category.description || `${category.name} - ${kindById(kind).name}`),
			url: categoryUrl(kind, category.id),
			urlAlternatives: [`${BASE_URL}/${kindById(kind).publicType}-cats/${category.slug || category.id}/`]
		});
	}
	function categoryToPlaylist(kind, category) {
		return grayjay.playlist(`playlist-${kind}-${category.id}`, {
			name: category.name,
			thumbnails: staticThumbnails(),
			thumbnail: iconUrl(),
			author: rootAuthor(),
			datetime: 0,
			url: playlistUrl(kind, category.id),
			videoCount: category.count || 0
		});
	}
	function contentFilter() {
		return {
			id: "content",
			name: "المحتوى",
			isMultiSelect: false,
			filters: [{
				id: "all",
				name: "كل المحتوى",
				value: "all"
			}, ...KINDS.map((kind) => ({
				id: kind.id,
				name: kind.name,
				value: kind.id
			}))]
		};
	}
	function selectedKinds(filters) {
		const value = selected_filter_values(filters, "content")[0];
		return value && value !== "all" ? [kindById(value)] : KINDS;
	}
	function kindById(id) {
		return KINDS.find((kind) => kind.id === id);
	}
	function normalizeKind(value) {
		if (KINDS.some((kind) => kind.id === value)) return value;
		if (value === "sounds-explain") return "lessons";
		if (value === "khotab") return "sermons";
		if (value === "video") return "videos";
		return null;
	}
	function parseDate(value) {
		const raw = String(value ?? "");
		if (!raw) return 0;
		return Math.floor(new Date(raw).getTime() / 1e3) || 0;
	}
	function decodeTitle(url) {
		return decodeURIComponent(String(url ?? "").split("/").pop()?.replace(/\.[a-z0-9]+(?:\?.*)?$/i, "") || PLATFORM).replace(/[-_]+/g, " ");
	}
	function kindUrl(kind) {
		return `alqasim://channel/${kind}`;
	}
	function categoryUrl(kind, id) {
		return `alqasim://category/${kind}/${id}`;
	}
	function playlistUrl(kind, id) {
		return `alqasim://playlist/${kind}/${id}`;
	}
	function contentUrl(kind, id) {
		return `alqasim://content/${kind}/${id}`;
	}
	function parseInternalUrl(url) {
		const value = String(url ?? "");
		if (value === "alqasim://root") return { type: "root" };
		let match = value.match(/^alqasim:\/\/channel\/([^/]+)$/);
		if (match) return {
			type: "channel",
			kind: match[1]
		};
		match = value.match(/^alqasim:\/\/category\/([^/]+)\/([^/]+)$/);
		if (match) return {
			type: "category",
			kind: match[1],
			categoryId: match[2]
		};
		match = value.match(/^alqasim:\/\/playlist\/([^/]+)\/([^/]+)$/);
		if (match) return {
			type: "playlist",
			kind: match[1],
			categoryId: match[2]
		};
		match = value.match(/^alqasim:\/\/content\/([^/]+)\/(\d+)$/);
		if (match) return {
			type: "content",
			kind: match[1],
			id: match[2]
		};
		return null;
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function staticThumbnails() {
		return static_thumbnails(_config, DEFAULT_ICON);
	}
	var AlQasimKindPager = class AlQasimKindPager extends VideoPager {
		constructor(kind, page = 1) {
			const data = fetchList(kind, page);
			super(postsFrom(data).map((post) => postToContent(post, kind)).filter(Boolean), page < (data.pagination?.total_pages || 1), {
				kind,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlQasimKindPager(this.context.kind, this.context.page + 1));
		}
	};
	var AlQasimCategoryPager = class AlQasimCategoryPager extends VideoPager {
		constructor(kind, categoryId, page = 1) {
			const data = fetchCategory(kind, categoryId, page);
			super(postsFrom(data).map((post) => postToContent(post, kind)).filter(Boolean), page < (data.pagination?.total_pages || 1), {
				kind,
				categoryId,
				page
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlQasimCategoryPager(this.context.kind, this.context.categoryId, this.context.page + 1));
		}
	};
	var AlQasimSearchPager = class AlQasimSearchPager extends VideoPager {
		constructor(query, page = 1, kinds = KINDS.map((kind) => kind.id)) {
			const data = fetchJson(`${API_URL}/search?${query_string([
				["q", query],
				["page", page],
				["per_page", DEFAULT_LIMIT]
			])}`);
			const items = postsFrom(data).map((post) => postToContent(post)).filter((item) => item && kinds.some((kind) => item.url.includes(`/${kind}/`)));
			super(dedupe_by_url(items), page < (data.pagination?.total_pages || 1), {
				query,
				page,
				kinds
			});
		}
		nextPage() {
			return apply_pager_state(this, new AlQasimSearchPager(this.context.query, this.context.page + 1, this.context.kinds));
		}
	};
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var ArrayPlaylistPager = array_pager_class(PlaylistPager);
	log("LOADED AlQasim " + staticThumbnails().sources.length);

})();
